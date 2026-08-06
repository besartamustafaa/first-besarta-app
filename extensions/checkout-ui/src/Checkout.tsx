import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

export default async function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [pointsToRedeem, setPointsToRedeem] = useState("");

  const loyaltyMetafield = shopify.appMetafields.value.find(
    (metafield) =>
      metafield.metafield.namespace === "$app:loyalty" &&
      metafield.metafield.key === "points"
  );

  const points = loyaltyMetafield
    ? Number(loyaltyMetafield.metafield.value)
    : 0;


  return (
    <s-banner heading="Loyalty Points">
      <s-stack gap="base">

        <s-text>
          You have {points} loyalty points
        </s-text>


        {points === 0 ? (
          <s-text>
            You do not have any loyalty points available.
          </s-text>
        ) : (
          <>
            <s-text-field
              label="Points to redeem"
              value={pointsToRedeem}
              onChange={(event) => {
                const target = event.target as HTMLInputElement | null;

                if (target) {
                  setPointsToRedeem(target.value);
                }
              }}
            />

            <s-button>
              Use points
            </s-button>
          </>
        )}

      </s-stack>
    </s-banner>
  );
}