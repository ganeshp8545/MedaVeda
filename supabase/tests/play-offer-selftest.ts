import { strict as assert } from "node:assert";
import { selectStandardPlayOffer } from "../../mobile-app/src/services/playOfferSelection.ts";

const quotedAmount = 137;
const buy = { priceCurrencyCode: "INR", priceAmountMicros: "137000000", offerToken: "buy-token" };
assert.equal(selectStandardPlayOffer([buy], quotedAmount).offerToken, "buy-token");
for (const offers of [[], [buy, buy], [{ ...buy, priceAmountMicros: "1000000" }],
  [{ ...buy, priceCurrencyCode: "USD" }], [{ ...buy, offerId: "discount" }],
  [{ ...buy, rentalDetailsAndroid: { rentalPeriod: "P1D" } }],
  [{ ...buy, preorderDetailsAndroid: {} }], [{ ...buy, offerToken: "" }],
  [{ ...buy, offerId: "discount", offerToken: "discount-token" }, buy],
  [{ ...buy, rentalDetailsAndroid: { rentalPeriod: "P1D" }, offerToken: "rent-token" }, buy]]) {
  assert.throws(() => selectStandardPlayOffer(offers, quotedAmount));
}
console.log("PASS standard Play BUY offer selection and unsafe-offer rejection");
