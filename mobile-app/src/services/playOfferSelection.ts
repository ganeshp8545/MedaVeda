export type StandardPlayOffer = {
  priceCurrencyCode: string;
  priceAmountMicros: string;
  offerToken: string;
  formattedPrice?: string;
  offerId?: string | null;
  discountDisplayInfo?: unknown;
  rentalDetailsAndroid?: unknown;
  preorderDetailsAndroid?: unknown;
};

// The backend maps a permanent Notes entitlement to a reusable price-tier SKU.
// expo-iap does not expose the purchase option ID for these offers. Accept
// only one offer so its token cannot be confused with another Play option.
// The catalog worker separately requires one verified BUY option per SKU.
export function selectStandardPlayOffer(offers: StandardPlayOffer[] | null | undefined,
  priceInr: number): StandardPlayOffer {
  if (!Number.isSafeInteger(Math.round(priceInr * 100)) || priceInr <= 0 ||
      !offers || offers.length !== 1) {
    throw new Error("This Play product needs one standard BUY option at the quoted price.");
  }
  const matching = offers.filter((offer) =>
    offer.priceCurrencyCode === "INR" &&
    Number(offer.priceAmountMicros) === Math.round(priceInr * 1_000_000) &&
    !offer.offerId && !offer.discountDisplayInfo && !offer.rentalDetailsAndroid &&
    !offer.preorderDetailsAndroid && !!offer.offerToken
  );
  if (matching.length !== 1) {
    throw new Error("This Play product needs one standard BUY option at the quoted price.");
  }
  return matching[0];
}
