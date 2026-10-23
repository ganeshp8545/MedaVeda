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

export async function serviceAccountToken(): Promise<string> {
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
  let response: Response;
  try { response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(15_000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }),
  }); } catch { throw new GoogleApiError(0, "oauth.token"); }
  if (!response.ok) throw await googleError(response, "oauth.token");
  const value = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!value?.access_token || !Number.isFinite(value.expires_in)) throw new Error("Google OAuth response invalid");
  cached = { token: value.access_token, until: Date.now() + Math.min(value.expires_in as number, 3600) * 1000 };
  return cached.token;
}

// Only static operation/reason labels reach logs. Paths, bodies and Google's free-form
// messages can contain purchase tokens or account data and must never be logged.
export type GoogleOperation = "api.request" | "oauth.token" | "catalog.get" |
  "catalog.readback.created" | "catalog.readback.activated" | "catalog.price-conversion" |
  "catalog.patch" | "catalog.activate" | "purchase.get" | "purchase.get-v2" |
  "purchase.consume" | "voids.list" | "external.create" | "external.get" | "external.refund";
const safeReasons = new Set([
  "accessNotConfigured", "insufficientPermissions", "permissionDenied", "forbidden",
  "rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "backendError",
  "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "INVALID_ARGUMENT",
  "UNAUTHENTICATED", "NOT_FOUND", "invalid_grant", "invalid_client", "unauthorized_client",
]);
const safeDetailReasons = new Set([
  "SERVICE_DISABLED", "SERVICE_ACCESS_DENIED", "CONSUMER_INVALID", "BILLING_DISABLED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "IAM_PERMISSION_DENIED", "USER_PROJECT_DENIED",
  "RATE_LIMIT_EXCEEDED", "RESOURCE_QUOTA_EXCEEDED", "SECURITY_POLICY_VIOLATED",
  "API_KEY_INVALID", "API_KEY_SERVICE_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED", "CREDENTIALS_MISSING", "ACCOUNT_STATE_INVALID",
]);
const safeDomains = new Set(["googleapis.com", "androidpublisher.googleapis.com", "serviceusage.googleapis.com"]);
export type GoogleErrorDetail = {
  type: "ErrorInfo" | "QuotaFailure" | "PreconditionFailure" | "RetryInfo";
  reason?: string;
  domain?: string;
  service?: string;
  consumer?: string;
};
// ErrorInfo metadata is untrusted. Preserve only known labels and project-number
// resource names; never copy arbitrary metadata, messages, links or credentials.
function safeErrorDetails(value: unknown): GoogleErrorDetail[] {
  if (!Array.isArray(value)) return [];
  const result: GoogleErrorDetail[] = [];
  for (const entry of value.slice(0, 8)) {
    if (!entry || typeof entry !== "object") continue;
    if (entry["@type"] === "type.googleapis.com/google.rpc.ErrorInfo") {
      const detail: GoogleErrorDetail = { type: "ErrorInfo" };
      if (typeof entry.reason === "string" && safeDetailReasons.has(entry.reason)) detail.reason = entry.reason;
      if (typeof entry.domain === "string" && safeDomains.has(entry.domain)) detail.domain = entry.domain;
      if (entry.metadata?.service === "androidpublisher.googleapis.com") detail.service = entry.metadata.service;
      const consumer = entry.metadata?.consumer;
      if (typeof consumer === "string" && (/^projects\/[0-9]{6,20}$/.test(consumer) ||
          consumer === "projects/medveda-play-billing")) detail.consumer = consumer;
      result.push(detail);
    } else {
      for (const type of ["QuotaFailure", "PreconditionFailure", "RetryInfo"] as const) {
        if (entry["@type"] === `type.googleapis.com/google.rpc.${type}`) result.push({ type });
      }
    }
    if (result.length === 4) break;
  }
  return result;
}
export class GoogleApiError extends Error {
  readonly retryable: boolean;
  readonly reason: string;
  readonly details: readonly GoogleErrorDetail[];
  constructor(public readonly status: number, public readonly operation: GoogleOperation = "api.request",
    reason = "unclassified", public readonly requestId = crypto.randomUUID(), details: unknown = []) {
    const safeReason = safeReasons.has(reason) ? reason : "unclassified";
    super(`Google API operation=${operation} status=${status} reason=${safeReason} request=${requestId}`);
    this.reason = safeReason;
    this.details = safeErrorDetails(details);
    // Permanent OAuth permission/credential failures need operator correction,
    // just like Publisher 403s. Only transport/conflict/quota/server failures retry.
    this.retryable = status === 0 || status === 409 || status === 429 || status >= 500;
  }
}
async function googleError(response: Response, operation: GoogleOperation): Promise<GoogleApiError> {
  const value = await response.json().catch(() => null);
  const candidates = [value?.error?.errors?.[0]?.reason, value?.error?.status, value?.error];
  const reason = candidates.find((entry) => typeof entry === "string" && safeReasons.has(entry));
  return new GoogleApiError(response.status, operation, reason, undefined, value?.error?.details);
}
export async function googleRequest<T>(method: "GET" | "POST" | "PATCH", path: string,
  body?: unknown, operation: GoogleOperation = "api.request"): Promise<T> {
  const token = await serviceAccountToken();
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new GoogleApiError(0, operation); }
  if (!response.ok) throw await googleError(response, operation);
  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { throw new Error("Google Play API response invalid"); }
}

function productPath(sku: string, token: string): string {
  return `/applications/${encodeURIComponent(packageName())}/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}`;
}

export function getProductPurchase(sku: string, token: string): Promise<ProductPurchase> {
  return googleRequest<ProductPurchase>("GET", productPath(sku, token), undefined, "purchase.get");
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
    `/applications/${encodeURIComponent(packageName())}/purchases/productsv2/tokens/${encodeURIComponent(token)}`, undefined, "purchase.get-v2");
}

export function consumeProductPurchase(sku: string, token: string): Promise<Record<string, never>> {
  return googleRequest<Record<string, never>>("POST", `${productPath(sku, token)}:consume`, undefined, "purchase.consume");
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
    `/applications/${encodeURIComponent(packageName())}/purchases/voidedpurchases?${query}`, undefined, "voids.list");
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
  return googleRequest<ExternalTransaction>("POST", `${externalPath()}?externalTransactionId=${encodeURIComponent(id)}`, data, "external.create");
}

export function getExternalTransaction(id: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("GET", externalPath(id), undefined, "external.get");
}

export function refundExternalTransaction(id: string, refundTime: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("POST", `${externalPath(id)}:refund`, { refundTime, fullRefund: {} }, "external.refund");
}

export function refundExternalTransactionPartially(id: string, refundId: string,
  preTaxMicros: string, refundTime: string): Promise<ExternalTransaction> {
  return googleRequest<ExternalTransaction>("POST", `${externalPath(id)}:refund`, {
    refundTime,
    partialRefund: { refundId, refundPreTaxAmount: { currency: "INR", priceMicros: preTaxMicros } },
  }, "external.refund");
}
