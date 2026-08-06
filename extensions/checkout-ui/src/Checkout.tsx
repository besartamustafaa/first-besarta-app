import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async function () {
  render(<Extension />, document.body);
}

function Extension() {
  if (!shopify.instructions.value.metafields.canSetCartMetafields) {
    return (
      <s-banner heading="checkout-ui" tone="warning">
        {shopify.i18n.translate("metafieldChangesAreNotSupported")}
      </s-banner>
    );
  }

  const freeGiftRequested = shopify.appMetafields.value.find(
    (appMetafield) =>
      appMetafield.target.type === "cart" &&
      appMetafield.metafield.namespace === "$app" &&
      appMetafield.metafield.key === "requestedFreeGift"
  );

  async function onCheckboxChange(event: Event) {
  const target = event.target as HTMLInputElement | null;

  if (!target) return;

  const result = await shopify.applyMetafieldChange({
    type: "updateCartMetafield",
    metafield: {
      namespace: "$app",
      key: "requestedFreeGift",
      value: target.checked ? "true" : "false",
      type: "boolean",
    },
  });

  console.log(result);
}

  return (
    <s-banner heading="checkout-ui">
      <s-stack gap="base">
        <s-text>
          {shopify.i18n.translate("welcome", {
            target: (
              <s-text type="emphasis">
                {shopify.extension.target}
              </s-text>
            ),
          })}
        </s-text>

        <s-checkbox
          checked={freeGiftRequested?.metafield.value === "true"}
          onChange={onCheckboxChange}
          label={shopify.i18n.translate(
            "iWouldLikeAFreeGiftWithMyOrder"
          )}
        />
      </s-stack>
    </s-banner>
  );
}