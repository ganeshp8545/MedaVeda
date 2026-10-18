// Google Play Developer API. References:
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products
// https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const encoder = new TextEncoder();
let cached: { token: string; until: number } | null = null;

export type ProductPurchase = {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  purchaseTimeMillis?: string;
  productId?: string;
  purchaseToken?: string;
  quantity?: number;
  regionCode?: string;
  refundableQuantity?: number;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function packageName(): string {
  const value = env("GOOGLE_PLAY_PACKAGE_NAME");
  if (value !== "in.medveda.app") throw new Error("GOOGLE_PLAY_PACKAGE_NAME must match in.medveda.app");
  return value;
}

function b64url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function serviceAccountToken(): Promise<string> {
  if (cached && Date.now() < cached.until - 60_000) return cached.token;
  let serviceAccount: { client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(env("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"));
  } catch { throw new Error("Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"); }
  if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Incomplete Google service account");
  const pem = serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(pem);
  const keyBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = b64url(encoder.encode(JSON.stringify({ iss: serviceAccount.client_email, scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const input = `${header}.${payload}`;
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(input))));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Google OAuth returned ${response.status}`);
  const value = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!value?.access_token || !Number.isFinite(value.expires_in)) throw new Error("Google OAuth response invalid");
  cached = { token: value.access_token, until: Date.now() + Math.min(value.expires_in as number, 3600) * 1000 };
  return cached.token;
}

export class GoogleApiError extends Error {
  constructor(public readonly status: number) { super(`Google Play API returned ${status}`); }
}

export async function googleRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method, signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${await serviceAccountToken()}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new GoogleApiError(response.status);
  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { throw new Error("Google Play API response invalid"); }
}

function productPath(sku: string, token: string): string {
  return `/applications/${encodeURIComponent(packageName())}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`;
}

export function getProductPurchase(sku: string, token: string): Promise<ProductPurchase> {
  return googleRequest<ProductPurchase>("GET", productPath(sku, token));
}

export type ProductPurchaseV2 = {
  purchaseStateContext?: { purchaseState?: string };
  productLineItem?: { productId?: string; productOfferDetails?: {
    purchaseOptionId?: string; offerId?: string; quantity?: number;
    refundableQuantity?: number; consumptionState?: string;
  } }[];
  regionCode?: string;
  purchaseCompletionTime?: string;
  obfuscatedExternalAccountId?: string;
  obfuscatedExternalProfileId?: string;
};

export function getProductPurchaseV2(token: string): Promise<ProductPurchaseV2> {
  return googleRequest<ProductPurchaseV2>("GET",
    `/applications/${encodeURIComponent(packageName())}/purchases/productsv2/tokens/${encodeURIComponent(token)}`);
}

export function consumeProductPurchase(sku: string, token: string): Promise<Record<string, never>> {
  return googleRequest<Record<string, never>>("POST", `${productPath(sku, token)}:consume`);
}

export type VoidedPurchase = { purchaseToken?: string; voidedTimeMillis?: string };
export type VoidedPurchasesPage = {
  voidedPurchases?: VoidedPurchase[];
  tokenPagination?: { nextPageToken?: string };
};

export function getVoidedPurchasesPage(startTime: number, pageToken?: string, endTime?: number,
  maxResults = 200): Promise<VoidedPurchasesPage> {
  if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 200) throw new Error("Invalid void page size");
  const query = new URLSearchParams({
    startTime: String(startTime), type: "0", "pageSelection.maxResults": String(maxResults),
  });
  if (endTime) query.set("endTime", String(endTime));
  if (pageToken) query.set("pageSelection.token", pageToken);
  return googleRequest<VoidedPurchasesPage>("GET",
    `/applications/${encodeURIComponent(packageName())}/purchases/voidedpurchases?${query}`);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type ExternalTransaction = {
  externalTransactionId?: string;
  packageName?: string;
  transactionState?: string;
  oneTimeTransaction?: { externalTransactionToken?: string };
  originalPreTaxAmount?: { currency?: string; priceMicros?: string };
  originalTaxAmount?: { currency?: string; priceMicros?: string };
  currentPreTaxAmount?: { currency?: string; priceMicros?: string };
  currentTaxAmount?: { currency?: string; priceMicros?: string };
  userTaxAddress?: { regionCode?: string; administrativeArea?: string };
  transactionTime?: string;
};

function externalPath(id?: string): string {
  const base = `/applications/${encodeURIComponent(packageName())}/externalTransactions`;
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

export function createExternalTransaction(id: string, data: Record<string, unknown>): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("POST", `${externalPath()}?externalTransactionId=${encodeURIComponent(id)}`, data);
}

export function getExternalTransaction(id: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("GET", externalPath(id));
}

export function refundExternalTransaction(id: string, refundTime: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("POST", `${externalPath(id)}:refund`, { refundTime, fullRefund: {} });
}

export function refundExternalTransactionPartially(id: string, refundId: string,
  preTaxMicros: string, refundTime: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("POST", `${externalPath(id)}:refund`, {
    refundTime,
    partialRefund: { refundId, refundPreTaxAmount: { currency: "INR", priceMicros: preTaxMicros } },
  });
}
