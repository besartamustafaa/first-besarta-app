import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';


export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {

  const rawRedeemedPoints =
    input.cart.attribute?.value?.trim();

  const redeemedPoints =
    rawRedeemedPoints
      ? Number.parseInt(rawRedeemedPoints, 10)
      : NaN;


  if (
    !Number.isInteger(redeemedPoints) ||
    redeemedPoints <= 0
  ) {
    return {
      operations: [],
    };
  }


  const hasOrderDiscountClass =
    input.discount.discountClasses.includes(
      DiscountClass.Order,
    );


  if (!hasOrderDiscountClass) {
    return {
      operations: [],
    };
  }


  const settings = input.discount.metafield?.jsonValue;


  const rewardValuePerPoint =
    settings &&
    typeof settings === "object" &&
    "rewardValuePerPoint" in settings
      ? Number(settings.rewardValuePerPoint)
      : NaN;


  if (
    !Number.isFinite(rewardValuePerPoint) ||
    rewardValuePerPoint <= 0
  ) {
    return {
      operations: [],
    };
  }


  const discountAmount =
    redeemedPoints * rewardValuePerPoint;


  return {
    operations: [
      {
        orderDiscountsAdd: {
          selectionStrategy:
            OrderDiscountSelectionStrategy.First,

          candidates: [
            {
              message:
                "Loyalty points redemption",

              targets: [
                {
                  orderSubtotal: {
                    excludedCartLineIds: [],
                  },
                },
              ],

              value: {
                fixedAmount: {
                  amount: discountAmount.toFixed(2),
                },
              },
            },
          ],
        },
      },
    ],
  };
}