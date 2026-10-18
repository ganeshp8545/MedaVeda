import { googleRequest, GoogleApiError, packageName } from "./googlePlay.ts";

type Money = { currencyCode?: string; units?: string; nanos?: number };
type Option = {
  purchaseOptionId?: string;
  state?: string;
  buyOption?: { multiQuantityEnabled?: boolean };
  regionalPricingAndAvailabilityConfigs?: { regionCode?: string; price?: Money; availability?: string }[];
};
export type OneTimeProduct = { packageName?: string; productId?: string; purchaseOptions?: Option[] };
type ConvertedPrices = { regionVersion?: { version?: string }; convertedRegionPrices?: Record<string, unknown> };

export function priceCents(price: string | number): number {
  const value = String(price);
  if (!/^(?:[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) throw new Error("Price is outside supported INR precision or range");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function moneyCents(money?: Money): number | null {
  if (money?.currencyCode !== "INR" || !/^-?\d+$/.test(money.units ?? "") ||
      !Number.isInteger(money.nanos ?? 0) || (money.nanos ?? 0) % 10_000_000 !== 0) return null;
  return Number(money.units) * 100 + (money.nanos ?? 0) / 10_000_000;
}

export function verifiedBuyOption(product: OneTimeProduct, sku: string, optionId: string, cents: number): boolean {
  if (product.packageName !== "in.medveda.app" || product.productId !== sku) return false;
  // The mobile SDK returns offer tokens without purchase option IDs. A SKU is
  // checkout-ready only when Play read-back contains exactly this one option.
  if (product.purchaseOptions?.length !== 1) return false;
  const option = product.purchaseOptions[0];
  if (option.purchaseOptionId !== optionId) return false;
  const india = option.regionalPricingAndAvailabilityConfigs?.filter((entry) => entry.regionCode === "IN") ?? [];
  return option.state === "ACTIVE" && !!option.buyOption && !option.buyOption.multiQuantityEnabled &&
    india.length === 1 && india[0].availability === "AVAILABLE" && moneyCents(india[0].price) === cents;
}

export async function getOneTimeProduct(sku: string): Promise<OneTimeProduct | null> {
  try {
    return await googleRequest<OneTimeProduct>("GET",
      `/applications/${encodeURIComponent(packageName())}/oneTimeProducts/${encodeURIComponent(sku)}`);
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) return null;
    throw error;
  }
}

export function optionNeedsActivation(product: OneTimeProduct, optionId: string, cents: number): boolean {
  if (product.purchaseOptions?.length !== 1) return false;
  const option = product.purchaseOptions?.find((value) => value.purchaseOptionId === optionId);
  const india = option?.regionalPricingAndAvailabilityConfigs?.find((value) => value.regionCode === "IN");
  return !!option && option.state === "DRAFT" && !!option.buyOption && !option.buyOption.multiQuantityEnabled &&
    india?.availability === "AVAILABLE" && moneyCents(india.price) === cents;
}

export async function createOneTimeProduct(sku: string, optionId: string, cents: number): Promise<void> {
  const pkg = packageName();
  const price: Money = { currencyCode: "INR", units: String(Math.floor(cents / 100)),
    nanos: (cents % 100) * 10_000_000 };
  const converted = await googleRequest<ConvertedPrices>("POST",
    `/applications/${encodeURIComponent(pkg)}/pricing:convertRegionPrices`, { price });
  if (!converted.regionVersion?.version || !converted.convertedRegionPrices?.IN)
    throw new Error("Google Play did not return an India regions version");
  // Only India is enabled. The Admin catalog is INR-only; other regions require
  // a separate currency and tax design, rather than silent conversion.
  const body = {
    packageName: pkg,
    productId: sku,
    listings: [{ languageCode: "en-US", title: `MedVeda content INR ${cents / 100}`,
      description: "One purchase of MedVeda digital content selected in the app." }],
    purchaseOptions: [{ purchaseOptionId: optionId,
      buyOption: { legacyCompatible: true, multiQuantityEnabled: false },
      regionalPricingAndAvailabilityConfigs: [{ regionCode: "IN", price, availability: "AVAILABLE" }],
    }],
  };
  const query = new URLSearchParams({ updateMask: "listings,purchaseOptions", allowMissing: "true",
    "regionsVersion.version": converted.regionVersion.version });
  await googleRequest<OneTimeProduct>("PATCH",
    `/applications/${encodeURIComponent(pkg)}/onetimeproducts/${encodeURIComponent(sku)}?${query}`, body);
}

export async function activateBuyOption(sku: string, optionId: string): Promise<void> {
  const pkg = packageName();
  await googleRequest("POST",
    `/applications/${encodeURIComponent(pkg)}/oneTimeProducts/${encodeURIComponent(sku)}/purchaseOptions:batchUpdateStates`,
    { requests: [{ activatePurchaseOptionRequest: { packageName: pkg, productId: sku, purchaseOptionId: optionId } }] });
}
