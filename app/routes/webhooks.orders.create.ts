import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

interface DiscountApplication {
  title?: string;
  value?: string | number;
}

interface DiscountAllocation {
  discount_application_index?: number;
  amount?: string | number;
  amount_set?: {
    shop_money?: {
      amount?: string | number;
    };
  };
}

interface LineItem {
  discount_allocations?: DiscountAllocation[];
}

interface OrderAttribute {
  key?: string;
  value?: string;
}

interface OrderPayload {
  id?: number;
  customer?: {
    id?: string | number | null;
  } | null;
  current_total_price?: string | number | null;
  discount_applications?: DiscountApplication[];
  line_items?: LineItem[];
  note_attributes?: OrderAttribute[];
}

interface LoyaltySettings {
  pointsPerDollar?: number;
  rewardValuePerPoint?: number;
}

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    admin,
    payload,
    topic,
    shop,
  } = await authenticate.webhook(request);

  if (!admin) {
    console.log(
      "[orders/create] Missing admin client",
    );
    return new Response();
  }

  let orderPayload: OrderPayload = {};

  if (typeof payload === "object" && payload !== null) {
    orderPayload = payload as OrderPayload;
  } else if (typeof payload === "string") {

    try {
      orderPayload = JSON.parse(payload);
    } catch {
      console.log(
        "[orders/create] Invalid payload JSON",
      );
      return new Response();
    }
  }

  const orderId = orderPayload.id ?? null;
  const customerId =
    orderPayload.customer?.id ?? null;
  console.log(
    `[orders/create] topic=${topic} shop=${shop} order=${orderId}`,
  );
  if (!customerId) {
    console.log(
      "[orders/create] No customer attached",
    );
    return new Response();
  }

  if (!orderId) {
    console.log(
      "[orders/create] Missing order id",
    );
    return new Response();
  }

  const customerGid =
    String(customerId).startsWith(
      "gid://shopify/Customer/",
    )
      ? String(customerId)
      : `gid://shopify/Customer/${customerId}`;

  const dataResponse = await admin.graphql(
    `#graphql
      query loyaltyWebhookData($customerId: ID!) {
        currentAppInstallation {
          metafield(
            namespace:"loyalty"
            key:"settings"
          ){
            value
          }
          metafield(
            namespace:"loyalty"
            key:"processed_orders"
          ){
            value
          }
        }
        customer(id:$customerId){
          metafield(
            namespace:"$app:loyalty"
            key:"points"
          ){
            value
          }
        }
      }
    `,
    {
      variables:{
        customerId: customerGid,
      },
    },
  );

  const dataJson = await dataResponse.json();
  let processedOrders:string[] = [];
  const processedRaw =
    dataJson?.data
      ?.currentAppInstallation
      ?.metafield
      ?.value;

  if(processedRaw){
    try{
      processedOrders =
        JSON.parse(processedRaw);
    }catch{
      processedOrders = [];
    }
  }

  if(
    processedOrders.includes(String(orderId))
  ){
    console.log(
      `[orders/create] Order ${orderId} already processed`,
    );
    return new Response();
  }
  const settingsRaw =
    dataJson?.data
      ?.currentAppInstallation
      ?.metafield
      ?.value;
  let pointsPerDollar = 0;
  let rewardValuePerPoint = 0;

  if(settingsRaw){
    try{
      const settings =
        JSON.parse(settingsRaw) as LoyaltySettings;
      const earning =
        Number(settings.pointsPerDollar);
      const reward =
        Number(settings.rewardValuePerPoint);
      if(
        Number.isFinite(earning) &&
        earning > 0
      ){
        pointsPerDollar = earning;
      }
      if(
        Number.isFinite(reward) &&
        reward > 0
      ){
        rewardValuePerPoint = reward;
      }
    }catch{
      console.log(
        "[orders/create] Invalid loyalty settings",
      );
    }
  }
  const currentPointsRaw =
    dataJson?.data
      ?.customer
      ?.metafield
      ?.value;

  const currentPointsNumber =
    Number(currentPointsRaw);

  const currentPoints =
    Number.isFinite(currentPointsNumber)
      ? currentPointsNumber
      : 0;


  const orderTotal =
    Number(
      orderPayload.current_total_price ?? 0,
    );


  const earnedPoints =
    Number.isFinite(orderTotal)
      ? Math.round(
          orderTotal * pointsPerDollar,
        )
      : 0;


  const redemptionAttribute =
    orderPayload.note_attributes?.find(
      (attribute) =>
        attribute.key ===
        "loyalty_points_to_redeem",
    );

  const attributeRedeemedPoints =
    Number(
      redemptionAttribute?.value ?? 0,
    );
  let redeemedPoints =
    Number.isFinite(attributeRedeemedPoints) &&
    attributeRedeemedPoints > 0
      ? attributeRedeemedPoints
      : 0;
  if(redeemedPoints === 0){
    const discounts =
      orderPayload.discount_applications ?? [];

    const loyaltyDiscountIndex =
      discounts.findIndex(
        (discount)=>
          discount.title ===
          "Loyalty points redemption",
      );
    let discountAmount = 0;

    if(
      loyaltyDiscountIndex >= 0
    ){
      for(
        const item of
        orderPayload.line_items ?? []
      ){
        for(
          const allocation of
          item.discount_allocations ?? []
        ){
          if(
            allocation.discount_application_index !==
            loyaltyDiscountIndex
          ){
            continue;
          }
          const amount =
            Number(
              allocation.amount ??
              allocation.amount_set
                ?.shop_money
                ?.amount ??
              0,
            );
          if(
            Number.isFinite(amount)
          ){
            discountAmount += amount;
          }
        }
      }
    }

    if(
      rewardValuePerPoint > 0 &&
      discountAmount > 0
    ){
      redeemedPoints =
        Math.round(
          discountAmount /
          rewardValuePerPoint,
        );

    }

  }

  if(
    redeemedPoints > currentPoints
  ){

    redeemedPoints = currentPoints;

  }

  const newBalance =
    Math.max(
      0,
      currentPoints +
      earnedPoints -
      redeemedPoints,
    );
console.log({
    orderId,
    currentPoints,
    earnedPoints,
    redeemedPoints,
    newBalance,
  });

const updateResponse =
    await admin.graphql(
      `#graphql
        mutation updatePoints(
          $metafields:[MetafieldsSetInput!]!
        ){

          metafieldsSet(
            metafields:$metafields
          ){

            userErrors{
              field
              message
            }

          }

        }
      `,
      {
        variables:{
          metafields:[
            {
              ownerId:customerGid,
              namespace:"$app:loyalty",
              key:"points",
              type:"number_integer",
              value:String(newBalance),
            },
          ],
        },
      },
    );

    const updateJson =
    await updateResponse.json();

  const updateErrors =
    updateJson?.data
      ?.metafieldsSet
      ?.userErrors ?? [];

  if(updateErrors.length > 0){
    console.log(
      "[orders/create] Update failed",
      updateErrors,
    );
    return new Response();
  }

  processedOrders.push(
    String(orderId),
  );

  await admin.graphql(
    `#graphql
      mutation saveProcessedOrders(
        $metafields:[MetafieldsSetInput!]!
      ){

        metafieldsSet(
          metafields:$metafields
        ){

          userErrors{
            field
            message
          }

        }

      }
    `,
    {
      variables:{
        metafields:[
          {
            ownerId:
              dataJson.data.currentAppInstallation.id,

            namespace:"loyalty",

            key:"processed_orders",

            type:"json",

            value:
              JSON.stringify(
                processedOrders,
              ),
          },
        ],
      },
    },
  );
  return new Response();
};