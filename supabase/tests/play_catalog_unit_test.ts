import { strict as assert } from "node:assert";
import { moneyCents, optionNeedsActivation, priceCents, verifiedBuyOption } from
  "../functions/_shared/playCatalog.ts";
import { validatePlayPurchaseV2 } from "../functions/_shared/playPurchaseValidation.ts";
import type { OneTimeProduct } from "../functions/_shared/playCatalog.ts";

Deno.test("arbitrary exact INR prices and Play money precision", () => {
  assert.equal(priceCents("137.25"), 13725);
  assert.equal(priceCents("99999999.99"), 9999999999);
  for (const invalid of ["0", "-1", "137.251", "NaN", "100000000", "1e3"])
    assert.throws(() => priceCents(invalid));
  assert.equal(moneyCents({ currencyCode: "INR", units: "137", nanos: 250000000 }), 13725);
  assert.equal(moneyCents({ currencyCode: "USD", units: "137", nanos: 250000000 }), null);
});

Deno.test("malformed or ambiguous catalog responses cannot activate or become ready", () => {
  const sku = "notes_137_25_v_fixture";
  const product = { packageName: "in.medveda.app", productId: sku,
    purchaseOptions: [{ purchaseOptionId: "buy", state: "ACTIVE", buyOption: {},
      regionalPricingAndAvailabilityConfigs: [{ regionCode: "IN", availability: "AVAILABLE",
        price: { currencyCode: "INR", units: "137", nanos: 250000000 } }] }] };
  const option = product.purchaseOptions[0];
  const india = option.regionalPricingAndAvailabilityConfigs[0];
  const withOption = (patch: Record<string, unknown>) => ({ ...product, purchaseOptions: [{ ...option, ...patch }] });
  const invalid: unknown[] = [null, [], true, {}, { ...product, packageName: "other.app" },
    { ...product, productId: "other_sku" }, { ...product, purchaseOptions: {} },
    { ...product, purchaseOptions: [null] }, withOption({ buyOption: true }),
    withOption({ buyOption: { multiQuantityEnabled: 0 } }), withOption({ buyOption: { multiQuantityEnabled: true } }),
    withOption({ rentOption: {} }), withOption({ purchaseOptionId: "other" }),
    withOption({ regionalPricingAndAvailabilityConfigs: {} }),
    withOption({ regionalPricingAndAvailabilityConfigs: [null] }),
    withOption({ regionalPricingAndAvailabilityConfigs: [india, india] }),
    withOption({ regionalPricingAndAvailabilityConfigs: [{ ...india, availability: "AVAILABLE_FOR_OFFERS_ONLY" }] }),
    withOption({ regionalPricingAndAvailabilityConfigs: [{ ...india, regionCode: "US" }] }),
  ];
  for (const money of [null, {}, { currencyCode: "USD", units: "137", nanos: 250000000 },
    { currencyCode: "INR", units: "136", nanos: 1250000000 },
    { currencyCode: "INR", units: "138", nanos: -750000000 },
    { currencyCode: "INR", units: 137, nanos: 250000000 },
    { currencyCode: "INR", units: "9007199254740993", nanos: 0 },
    { currencyCode: "INR", units: "137", nanos: "250000000" },
    { currencyCode: "INR", units: "137", nanos: 250000001 },
    { currencyCode: "INR", units: "137", nanos: null },
  ]) {
    assert.equal(moneyCents(money as Parameters<typeof moneyCents>[0]), null);
    invalid.push(withOption({ regionalPricingAndAvailabilityConfigs: [{ ...india, price: money }] }));
  }
  for (const value of invalid) {
    assert.equal(verifiedBuyOption(value as OneTimeProduct, sku, "buy", 13725), false);
    const draft = value && typeof value === "object" && !Array.isArray(value)
      ? { ...value, purchaseOptions: Array.isArray((value as OneTimeProduct).purchaseOptions)
        ? (value as OneTimeProduct).purchaseOptions!.map((o) => o && { ...o, state: "DRAFT" })
        : (value as OneTimeProduct).purchaseOptions }
      : value;
    assert.equal(optionNeedsActivation(draft as OneTimeProduct, sku, "buy", 13725), false);
  }
  for (const state of ["INACTIVE", "STATE_UNSPECIFIED", "UNEXPECTED"]) {
    assert.equal(verifiedBuyOption(withOption({ state }), sku, "buy", 13725), false);
    assert.equal(optionNeedsActivation(withOption({ state }), sku, "buy", 13725), false);
  }
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
  assert.equal(optionNeedsActivation(draft, product.productId, "buy", 13725), true);
  assert.equal(optionNeedsActivation({ ...draft, purchaseOptions: [
    ...draft.purchaseOptions, { ...draft.purchaseOptions[0], purchaseOptionId: "other" },
  ] }, product.productId, "buy", 13725), false);
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
