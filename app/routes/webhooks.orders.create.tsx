import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

function parseLoyaltySettings(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const pointsPerDollar = Number(parsed?.pointsPerDollar);
    const rewardValuePerPoint = Number(parsed?.rewardValuePerPoint);

    if (pointsPerDollar > 0 && rewardValuePerPoint > 0) {
      return { pointsPerDollar, rewardValuePerPoint };
    }
  } catch (_error) {
    // Ignore malformed stored settings and skip awarding points.
  }

  return null;
}

function parseCustomerPoints(rawValue: string | null | undefined) {
  if (!rawValue) {
    return 0;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const adminRequest = request.clone();
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as {
    id?: number;
    total_price?: string | number | null;
    customer?: { id?: number | null } | null;
  };

  if (!order.customer?.id) {
    return new Response(null, { status: 204 });
  }

  const customerId = order.customer.id;
  const orderTotal = Number(order.total_price ?? 0);
  const pointsPerDollar = await getPointsPerDollar(adminRequest);

  if (!Number.isFinite(orderTotal) || !pointsPerDollar || pointsPerDollar <= 0) {
    return new Response(null, { status: 204 });
  }

  const earnedPoints = Math.round(orderTotal * pointsPerDollar);
  const previousBalance = await getCustomerPointsBalance(customerId, adminRequest);
  const updatedBalance = previousBalance + earnedPoints;

  await setCustomerPointsBalance(customerId, updatedBalance, adminRequest);

  return new Response(null, { status: 204 });
};

async function getPointsPerDollar(request: Request) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query loyaltyConfigForWebhook {
      currentAppInstallation {
        metafield(namespace: "loyalty", key: "settings") {
          value
        }
      }
    }`,
  );

  const responseJson = await response.json();
  const rawValue = responseJson?.data?.currentAppInstallation?.metafield?.value;
  const parsedSettings = parseLoyaltySettings(rawValue);

  return parsedSettings?.pointsPerDollar ?? null;
}

async function getCustomerPointsBalance(customerId: number, request: Request) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query loyaltyCustomerPoints($customerId: ID!) {
      customer(id: $customerId) {
        metafield(namespace: "loyalty", key: "points_balance") {
          value
        }
      }
    }`,
    {
      variables: {
        customerId: `gid://shopify/Customer/${customerId}`,
      },
    },
  );

  const responseJson = await response.json();
  const rawValue = responseJson?.data?.customer?.metafield?.value;
  return parseCustomerPoints(rawValue);
}

async function setCustomerPointsBalance(customerId: number, balance: number, request: Request) {
  const { admin } = await authenticate.admin(request);

  await admin.graphql(
    `#graphql
    mutation updateLoyaltyBalance($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: `gid://shopify/Customer/${customerId}`,
            namespace: "loyalty",
            key: "points_balance",
            type: "number_integer",
            value: String(balance),
          },
        ],
      },
    },
  );
}
