import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

export default async function () {
  render(<Extension />, document.body);
}

function Extension() {
  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /*
    TODO:
    Replace this with real customer loyalty points.
    This is temporary for testing.
  */
  const availablePoints: number = 250;


  async function savePoints() {
    setError("");
    setSuccess("");

    const points = Number(pointsToRedeem);


    // Check if input is a number
    if (!pointsToRedeem || Number.isNaN(points)) {
      setError("Please enter a valid number of points.");
      return;
    }


    // Check positive number
    if (points <= 0) {
      setError("Points must be greater than 0.");
      return;
    }


    // Check available balance
    if (points > availablePoints) {
      setError(
        "You cannot redeem more points than your available balance."
      );
      return;
    }


    const result = await shopify.applyAttributeChange({
      type: "updateAttribute",
      key: "loyalty_points_to_redeem",
      value: points.toString(),
    });


    if (result.type === "error") {
      setError(result.message);
      return;
    }


    setSuccess(
      `${points} points will be used at checkout.`
    );


    console.log(
      "Saved loyalty_points_to_redeem:",
      points
    );
  }


  /*
    TODO:
    Replace this with real customer detection.
    Shopify buyer identity will be used later.
  */
  const customerLoggedIn = true;


  if (!customerLoggedIn) {
    return (
      <s-banner heading="Loyalty Points">
        <s-text>
          Please log in to use loyalty points.
        </s-text>
      </s-banner>
    );
  }


  if (availablePoints === 0) {
    return (
      <s-banner heading="Loyalty Points">
        <s-text>
          You do not have any loyalty points yet.
        </s-text>
      </s-banner>
    );
  }


  return (
    <s-banner heading="Loyalty Points">

      <s-stack gap="base">

        <s-text>
          Your current loyalty points: {availablePoints}
        </s-text>


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


        {error && (
          <s-text tone="critical">
            {error}
          </s-text>
        )}


        {success && (
          <s-text>
            {success}
          </s-text>
        )}


        <s-button
          onClick={() => savePoints()}
        >
          Use points
        </s-button>


      </s-stack>

    </s-banner>
  );
}