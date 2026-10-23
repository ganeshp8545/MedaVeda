import type { GoogleOperation } from "./googlePlay.ts";
import { googleRequest, GoogleApiError, packageName } from "./googlePlay.ts";

type Money = { currencyCode?: string; units?: string; nanos?: number };
type Option = {
  purchaseOptionId?: string;
  state?: string;
  buyOption?: { multiQuantityEnabled?: boolean };
  rentOption?: unknown;
  regionalPricingAndAvailabilityConfigs?: { regionCode?: string; price?: Money; availability?: string }[];
};
export type OneTimeProduct = {
  packageName?: string; productId?: string; purchaseOptions?: Option[]; regionsVersion?: { version?: string };
};

export class PlayCatalogConfigurationError extends Error {}

// No supported-regions listing method exists in Android Publisher v3.
// RegionsVersion documents explicit versions, including historical support:
// https://developers.google.com/android-publisher/api-ref/rest/v3/RegionsVersion
// Google's published discovery history documents 2022/02; see the local review
// report for the pinned source. Add new versions only after reviewing IN/INR.
const REVIEWED_REGIONS_VERSIONS = new Set(["2022/02"]);
function configuredRegionsVersion(): string {
  const version = Deno.env.get("PLAY_CATALOG_REGIONS_VERSION");
  if (!version || !REVIEWED_REGIONS_VERSIONS.has(version))
    throw new PlayCatalogConfigurationError("PLAY_CATALOG_REGIONS_VERSION must explicitly select a reviewed version");
  return version;
}

export function priceCents(price: string | number): number {
  const value = String(price);
  if (!/^(?:[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)) throw new Error("Price is outside supported INR precision or range");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function moneyCents(money?: Money): number | null {
  if (!isRecord(money) || money.currencyCode !== "INR" ||
      (money.units !== undefined && (typeof money.units !== "string" || !/^(0|[1-9]\d{0,7})$/.test(money.units))) ||
      (money.nanos !== undefined && (typeof money.nanos !== "number" || !Number.isInteger(money.nanos) ||
        money.nanos < 0 || money.nanos >= 1_000_000_000 || money.nanos % 10_000_000 !== 0))) return null;
  return Number(money.units ?? "0") * 100 + (money.nanos ?? 0) / 10_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// TypeScript types do not validate Google's JSON. Reject malformed containers
// before a caller can interpret a response as a missing product or activate it.
function validProduct(value: unknown): value is OneTimeProduct {
  if (!isRecord(value) || typeof value.packageName !== "string" || typeof value.productId !== "string" ||
      !Array.isArray(value.purchaseOptions) || value.purchaseOptions.length === 0) return false;
  return value.purchaseOptions.every((option) => isRecord(option) &&
    typeof option.purchaseOptionId === "string" && typeof option.state === "string" &&
    (option.buyOption === undefined || (isRecord(option.buyOption) &&
      (option.buyOption.multiQuantityEnabled === undefined || typeof option.buyOption.multiQuantityEnabled === "boolean"))) &&
    Array.isArray(option.regionalPricingAndAvailabilityConfigs) &&
    option.regionalPricingAndAvailabilityConfigs.every((entry) => isRecord(entry) &&
      typeof entry.regionCode === "string" && typeof entry.availability === "string" && isRecord(entry.price)));
}

export function verifiedBuyOption(product: OneTimeProduct, sku: string, optionId: string, cents: number): boolean {
  if (!validProduct(product) || product.packageName !== "in.medveda.app" || product.productId !== sku ||
      !Number.isSafeInteger(cents) || cents <= 0) return false;
  // The mobile SDK returns offer tokens without purchase option IDs. A SKU is
  // checkout-ready only when Play read-back contains exactly this one option.
  if (product.purchaseOptions?.length !== 1) return false;
  const option = product.purchaseOptions[0];
  if (option.purchaseOptionId !== optionId) return false;
  const india = option.regionalPricingAndAvailabilityConfigs?.filter((entry) => entry.regionCode === "IN") ?? [];
  return option.state === "ACTIVE" && !!option.buyOption && option.rentOption === undefined && !option.buyOption.multiQuantityEnabled &&
    india.length === 1 && india[0].availability === "AVAILABLE" && moneyCents(india[0].price) === cents;
}

export async function getOneTimeProduct(sku: string, operation: GoogleOperation = "catalog.get"): Promise<OneTimeProduct | null> {
  try {
    const product = await googleRequest<unknown>("GET",
      `/applications/${encodeURIComponent(packageName())}/oneTimeProducts/${encodeURIComponent(sku)}`, undefined, operation);
    if (!validProduct(product) || product.packageName !== packageName() || product.productId !== sku)
      throw new Error("Google Play catalog product response invalid");
    return product;
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 404) return null;
    throw error;
  }
}

export function optionNeedsActivation(product: OneTimeProduct, sku: string, optionId: string, cents: number): boolean {
  if (!validProduct(product) || product.purchaseOptions?.length !== 1 || product.purchaseOptions[0].state !== "DRAFT") return false;
  // Activation has the same identity, union type, duplicate-region and money
  // checks as readiness; only the expected lifecycle state differs.
  return verifiedBuyOption({ ...product, purchaseOptions: [{ ...product.purchaseOptions[0], state: "ACTIVE" }] },
    sku, optionId, cents);
}

export async function createOneTimeProduct(sku: string, optionId: string, cents: number): Promise<void> {
  const pkg = packageName();
  const regionsVersion = configuredRegionsVersion();
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 9_999_999_999)
    throw new PlayCatalogConfigurationError("Catalog price is outside supported INR precision or range");
  const price: Money = { currencyCode: "INR", units: String(Math.floor(cents / 100)),
    nanos: (cents % 100) * 10_000_000 };
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
    "regionsVersion.version": regionsVersion });
  const created = await googleRequest<unknown>("PATCH",
    `/applications/${encodeURIComponent(pkg)}/onetimeproducts/${encodeURIComponent(sku)}?${query}`, body, "catalog.patch");
  if (!validProduct(created) || created.regionsVersion?.version !== regionsVersion ||
      !(optionNeedsActivation(created, sku, optionId, cents) ||
      verifiedBuyOption(created, sku, optionId, cents)))
    throw new Error("Google Play catalog creation response invalid");
}

export async function activateBuyOption(sku: string, optionId: string, cents: number): Promise<void> {
  const pkg = packageName();
  const activated = await googleRequest<unknown>("POST",
    `/applications/${encodeURIComponent(pkg)}/oneTimeProducts/${encodeURIComponent(sku)}/purchaseOptions:batchUpdateStates`,
    { requests: [{ activatePurchaseOptionRequest: { packageName: pkg, productId: sku, purchaseOptionId: optionId } }] }, "catalog.activate");
  if (!isRecord(activated) || !Array.isArray(activated.oneTimeProducts) || activated.oneTimeProducts.length !== 1)
    throw new Error("Google Play catalog activation response invalid");
  const product = activated.oneTimeProducts[0];
  if (!validProduct(product) || !verifiedBuyOption(product, sku, optionId, cents))
    throw new Error("Google Play catalog activation response invalid");
}
