import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const customer = getCheckoutCustomerContext();

  const [availablePoints, setAvailablePoints] = useState(0);
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadPoints() {
      if (!customer.isLoggedIn) return;

      setLoading(true);

      try {
        const response = await fetch("/api/loyalty-points", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customerId: customer.customerId,
            email: customer.email,
            shop: customer.shop,
          }),
        });

        if (!response.ok) {
          setAvailablePoints(0);
          return;
        }

        const data = await response.json();

        const points = Number(data.points);

        setAvailablePoints(
          Number.isFinite(points) && points >= 0 ? points : 0
        );
      } catch (error) {
        console.error(error);
        setAvailablePoints(0);
      } finally {
        setLoading(false);
      }
    }

    loadPoints();
  }, []);

  async function savePoints() {
    setMessage("");

    const value = Number(pointsToRedeem);

    if (!pointsToRedeem || Number.isNaN(value)) {
      setMessage("Please enter a valid number.");
      return;
    }

    if (value <= 0) {
      setMessage("Points must be greater than 0.");
      return;
    }

    if (value > availablePoints) {
      setMessage(
        "You cannot redeem more points than your available balance."
      );
      return;
    }

    const result = await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "loyalty_points_to_redeem",
      value: value.toString(),
    });

    if (result.type === "error") {
      setMessage(result.message);
      return;
    }

    setMessage("Points saved successfully.");
  }

  if (!customer.isLoggedIn) {
    return (
      <s-banner heading="Loyalty Points">
        <s-text>
          Please sign in to use loyalty points.
        </s-text>
      </s-banner>
    );
  }

  if (loading) {
    return (
      <s-banner heading="Loyalty Points">
        <s-text>Loading loyalty points...</s-text>
      </s-banner>
    );
  }

  return (
    <s-banner heading="Loyalty Points">
      <s-stack gap="base">

        <s-text>
          You have {availablePoints} loyalty points
        </s-text>

        <s-number-field
          label="Points to redeem"
          value={pointsToRedeem}
          onInput={(event: Event) => {
            const target = event.currentTarget as HTMLInputElement | null;

            if (!target) return;

            setPointsToRedeem(target.value);
          }}
        />

        {message && (
          <s-text>
            {message}
          </s-text>
        )}

        <s-button onClick={savePoints}>
          Use points
        </s-button>

      </s-stack>
    </s-banner>
  );
}

function getCheckoutCustomerContext() {
  const shopify = globalThis.shopify;

  if (!shopify) {
    return {
      isLoggedIn: false,
      customerId: null,
      email: null,
      shop: null,
    };
  }

  const customer = shopify.buyerIdentity?.customer?.current;

  if (!customer) {
    return {
      isLoggedIn: false,
      customerId: null,
      email: null,
      shop: shopify.shop?.myshopifyDomain ?? null,
    };
  }

  return {
    isLoggedIn: true,
    customerId: customer.id ?? null,
    email: customer.email ?? null,
    shop: shopify.shop?.myshopifyDomain ?? null,
  };
}