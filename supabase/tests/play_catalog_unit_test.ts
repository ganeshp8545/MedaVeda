import { strict as assert } from "node:assert";
import { moneyCents, optionNeedsActivation, priceCents, verifiedBuyOption } from
  "../functions/_shared/playCatalog.ts";
import { validatePlayPurchaseV2 } from "../functions/_shared/playPurchaseValidation.ts";

Deno.test("arbitrary exact INR prices and Play money precision", () => {
  assert.equal(priceCents("137.25"), 13725);
  assert.equal(priceCents("99999999.99"), 9999999999);
  for (const invalid of ["0", "-1", "137.251", "NaN", "100000000", "1e3"])
    assert.throws(() => priceCents(invalid));
  assert.equal(moneyCents({ currencyCode: "INR", units: "137", nanos: 250000000 }), 13725);
  assert.equal(moneyCents({ currencyCode: "USD", units: "137", nanos: 250000000 }), null);
});

Deno.test("only an active, exact-price India BUY option is verified", () => {
  const product = { packageName: "in.medveda.app", productId: "notes_137_25_v_fixture",
    purchaseOptions: [{ purchaseOptionId: "buy", state: "ACTIVE", buyOption: { multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: [{ regionCode: "IN", availability: "AVAILABLE",
        price: { currencyCode: "INR", units: "137", nanos: 250000000 } }] }] };
  assert.equal(verifiedBuyOption(product, product.productId, "buy", 13725), true);
  assert.equal(verifiedBuyOption(product, product.productId, "buy", 13726), false);
  assert.equal(verifiedBuyOption(product, product.productId, "other", 13725), false);
  assert.equal(verifiedBuyOption({ ...product, purchaseOptions: [
    ...product.purchaseOptions, { ...product.purchaseOptions[0], purchaseOptionId: "other" },
  ] }, product.productId, "buy", 13725), false);
  const draft = { ...product, purchaseOptions: [{ ...product.purchaseOptions[0], state: "DRAFT" }] };
  assert.equal(optionNeedsActivation(draft, "buy", 13725), true);
  assert.equal(optionNeedsActivation({ ...draft, purchaseOptions: [
    ...draft.purchaseOptions, { ...draft.purchaseOptions[0], purchaseOptionId: "other" },
  ] }, "buy", 13725), false);
  assert.equal(verifiedBuyOption(draft, product.productId, "buy", 13725), false);
  const rental = { ...product, purchaseOptions: [{ ...product.purchaseOptions[0], buyOption: undefined }] };
  assert.equal(verifiedBuyOption(rental, product.productId, "buy", 13725), false);
});

Deno.test("purchase verification binds SKU, BUY option, user, order and refund state", () => {
  const now = Date.now();
  const purchase = { purchaseStateContext: { purchaseState: "PURCHASED" }, regionCode: "IN",
    purchaseCompletionTime: new Date(now).toISOString(),
    obfuscatedExternalAccountId: "account", obfuscatedExternalProfileId: "order",
    productLineItem: [{ productId: "tier", productOfferDetails: { purchaseOptionId: "buy", quantity: 1,
      refundableQuantity: 1, consumptionState: "CONSUMPTION_STATE_YET_TO_BE_CONSUMED" } }] };
  const expected = { sku: "tier", optionId: "buy", accountHash: "account", orderHash: "order", now };
  assert.equal(validatePlayPurchaseV2(purchase, expected).status, "valid");
  assert.equal(validatePlayPurchaseV2({ ...purchase, purchaseStateContext: { purchaseState: "PENDING" } }, expected).status, "pending");
  for (const wrong of [
    { ...purchase, regionCode: "US" },
    { ...purchase, obfuscatedExternalAccountId: "other" },
    { ...purchase, obfuscatedExternalProfileId: "other" },
    { ...purchase, productLineItem: [{ ...purchase.productLineItem[0], productId: "other" }] },
    { ...purchase, productLineItem: [{ productId: "tier", productOfferDetails: { ...purchase.productLineItem[0].productOfferDetails, purchaseOptionId: "other" } }] },
    { ...purchase, productLineItem: [{ productId: "tier", productOfferDetails: { ...purchase.productLineItem[0].productOfferDetails, refundableQuantity: 0 } }] },
    { ...purchase, productLineItem: [...purchase.productLineItem, ...purchase.productLineItem] },
    { ...purchase, purchaseStateContext: { purchaseState: "CANCELLED" } },
  ]) assert.equal(validatePlayPurchaseV2(wrong, expected).status, "invalid");
});
