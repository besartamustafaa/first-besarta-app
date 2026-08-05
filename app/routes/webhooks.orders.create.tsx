import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {

  const { admin, payload, topic, shop } =
    await authenticate.webhook(request);

  let orderPayload = {};

  if (payload && typeof payload === "object") {
    orderPayload = payload;
  } else if (typeof payload === "string") {
    try {
      orderPayload = JSON.parse(payload);
    } catch {
      orderPayload = {};
    }
  }

  // Get order information.
  const orderId = orderPayload.id ?? null;
  const customerId = orderPayload.customer?.id ?? null;

  // Choose the order total used for calculating points.
  const orderTotal =
    orderPayload.current_total_price ??
    orderPayload.total_price ??
    orderPayload.total_outstanding ??
    null;

  console.log(`Received ${topic} webhook for ${shop}`);
  console.log(
    `[orders/create] orderId=${orderId} customerId=${customerId} orderTotal=${orderTotal}`,
  );

  // Stop if the order has no customer.
  if (!customerId) {
    console.log("[orders/create] Order has no customer");
    return new Response();
  }

  // Stop if no Admin API client is available.
  if (!admin) {
    console.log("[orders/create] No admin client available");
    return new Response();
  }

  // Convert numeric customer ID into Shopify GraphQL GID.
  const customerGid = String(customerId).startsWith("gid://shopify/Customer/")
    ? String(customerId)
    : `gid://shopify/Customer/${customerId}`;

  // Fetch loyalty settings and customer's current points.
  const queryResponse = await admin.graphql(
    `#graphql
      query loyaltyWebhookData($customerId: ID!) {
        currentAppInstallation {
          metafield(namespace: "loyalty", key: "settings") {
            value
          }
        }

        customer(id: $customerId) {
          metafield(namespace: "$app:loyalty", key: "points") {
            value
          }
        }
      }
    `,
    {
      variables: {
        customerId: customerGid,
      },
    },
  );

  const queryJson = await queryResponse.json();

  // Read loyalty settings.
  const settingsRaw =
    queryJson?.data?.currentAppInstallation?.metafield?.value ?? null;

  let pointsPerDollar = 0;

  if (settingsRaw) {
    try {
      const parsedSettings = JSON.parse(settingsRaw);

      const parsedPointsPerDollar = Number(
        parsedSettings?.pointsPerDollar,
      );

      if (
        Number.isFinite(parsedPointsPerDollar) &&
        parsedPointsPerDollar > 0
      ) {
        pointsPerDollar = parsedPointsPerDollar;
      }
    } catch {
      pointsPerDollar = 0;
    }
  }

  // Read current customer points.
  const currentPointsRaw =
    queryJson?.data?.customer?.metafield?.value ?? null;

  const parsedCurrentPoints = Number(currentPointsRaw);

  const currentPoints = Number.isFinite(parsedCurrentPoints)
    ? parsedCurrentPoints
    : 0;

  // Convert order total into a number.
  const parsedOrderTotal = Number(orderTotal);

  const safeOrderTotal = Number.isFinite(parsedOrderTotal)
    ? parsedOrderTotal
    : 0;

  // Calculate earned points.
  const earnedPoints = Math.round(
    safeOrderTotal * pointsPerDollar,
  );

  // Calculate new balance.
  const updatedPoints = currentPoints + earnedPoints;

  console.log(`[orders/create] orderTotal=${safeOrderTotal}`);
  console.log(`[orders/create] pointsPerDollar=${pointsPerDollar}`);
  console.log(`[orders/create] currentPoints=${currentPoints}`);
  console.log(`[orders/create] earnedPoints=${earnedPoints}`);
  console.log(`[orders/create] updatedPoints=${updatedPoints}`);

  // Save the updated balance.
  const savePointsResponse = await admin.graphql(
    `#graphql
      mutation updateCustomerLoyaltyPoints(
        $metafields: [MetafieldsSetInput!]!
      ) {
        metafieldsSet(metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: customerGid,
            namespace: "$app:loyalty",
            key: "points",
            type: "number_integer",
            value: String(updatedPoints),
          },
        ],
      },
    },
  );

  const savePointsJson = await savePointsResponse.json();

  const userErrors =
    savePointsJson?.data?.metafieldsSet?.userErrors ?? [];

  if (userErrors.length > 0) {
    console.log(
      `[orders/create] Failed to save points: ${userErrors[0].message}`,
    );
  }

  return new Response();
};