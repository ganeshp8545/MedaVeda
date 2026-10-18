import type { ProductPurchaseV2 } from "./googlePlay.ts";

export type PurchaseCheck =
  | { status: "pending" }
  | { status: "invalid" }
  | { status: "valid"; paidMillis: number; consumed: boolean };

export function validatePlayPurchaseV2(purchase: ProductPurchaseV2, expected: {
  sku: string; optionId: string; accountHash: string; orderHash: string; now: number;
}): PurchaseCheck {
  if (purchase.purchaseStateContext?.purchaseState === "PENDING") return { status: "pending" };
  const line = purchase.productLineItem?.[0];
  const details = line?.productOfferDetails;
  const paidMillis = Date.parse(purchase.purchaseCompletionTime ?? "");
  if (purchase.purchaseStateContext?.purchaseState !== "PURCHASED" || purchase.productLineItem?.length !== 1 ||
      line?.productId !== expected.sku || details?.purchaseOptionId !== expected.optionId ||
      !!details?.offerId || (details?.quantity ?? 1) !== 1 || details?.refundableQuantity === 0 ||
      purchase.regionCode !== "IN" || purchase.obfuscatedExternalAccountId !== expected.accountHash ||
      purchase.obfuscatedExternalProfileId !== expected.orderHash || !Number.isSafeInteger(paidMillis) ||
      paidMillis <= 0 || paidMillis > expected.now + 300_000) return { status: "invalid" };
  return { status: "valid", paidMillis,
    consumed: details?.consumptionState === "CONSUMPTION_STATE_CONSUMED" };
}
