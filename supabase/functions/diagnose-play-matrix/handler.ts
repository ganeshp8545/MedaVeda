import { corsHeaders } from "../_shared/cors.ts";

type User = { id: string; email?: string };
export type Dependencies = {
  getUser: (request: Request) => Promise<User | null>;
  getAdmin: (id: string) => Promise<boolean>;
  getAal: (request: Request) => string;
  getToken: () => Promise<string>;
  getPackageName: () => string;
  fetchGoogle: typeof fetch;
};

const capturedHeaders = [
  "x-goog-request-id", "x-guploader-uploadid", "www-authenticate", "server", "date",
] as const;
const secretKeys = /^(?:access_token|refresh_token|id_token|purchase_?token|private_key|client_secret|assertion|authorization|password)$/i;

// Preserve every field and Google diagnostic word, except secret values and user emails.
// In particular, do not allowlist ErrorInfo reasons/domains/metadata or truncate errors.
export function redact(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const secret of secrets) {
      if (secret) result = result.replaceAll(secret, "[secret masked]");
    }
    return result
      .replace(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z]+ )?PRIVATE KEY-----/g, "[private key masked]")
      .replace(/\b(?:ya29\.[A-Za-z0-9._~-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[token masked]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) =>
        email.toLowerCase().endsWith(".gserviceaccount.com") ? email : "[user email masked]");
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key, secretKeys.test(key) ? "[secret masked]" : redact(entry, secrets),
    ]));
  }
  return value;
}

function reply(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(status === 405 ? { Allow: "POST" } : {}),
    },
  });
}

export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return reply(200, { ok: true });
    if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
    try {
      const user = await deps.getUser(request);
      if (!user) return reply(401, { error: "unauthorized" });
      if (!await deps.getAdmin(user.id)) return reply(403, { error: "admin_required" });
      if (deps.getAal(request) !== "aal2") return reply(403, { error: "mfa_required" });

      const pkg = deps.getPackageName();
      // Exactly one helper call; the same token is reused for all four requests.
      const token = await deps.getToken();
      const authorization = request.headers.get("Authorization") ?? "";
      const secrets = [token, authorization, authorization.replace(/^Bearer\s+/i, ""), user.email ?? ""];
      const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}`;
      const steps = [
        { operation: "tokeninfo", method: "GET", endpoint: "https://oauth2.googleapis.com/tokeninfo", url: `https://oauth2.googleapis.com/tokeninfo?${new URLSearchParams({ access_token: token })}` },
        { operation: "legacy_products", method: "GET", endpoint: `/applications/${pkg}/inappproducts?maxResults=1`, url: `${base}/inappproducts?maxResults=1` },
        { operation: "one_time_products", method: "GET", endpoint: `/applications/${pkg}/oneTimeProducts?pageSize=1`, url: `${base}/oneTimeProducts?pageSize=1` },
        { operation: "convert_region_prices", method: "POST", endpoint: `/applications/${pkg}/pricing:convertRegionPrices`, url: `${base}/pricing:convertRegionPrices`, body: { price: { currencyCode: "INR", units: "1", nanos: 0 } } },
      ];
      const startedAt = new Date().toISOString();
      const matrix: unknown[] = [];
      for (const step of steps) {
        const started = new Date().toISOString();
        try {
          const response = await deps.fetchGoogle(step.url, {
            method: step.method,
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
            headers: step.operation === "tokeninfo" ? {} : {
              Authorization: `Bearer ${token}`,
              ...(step.body ? { "Content-Type": "application/json" } : {}),
            },
            ...(step.body ? { body: JSON.stringify(step.body) } : {}),
          });
          const headers: Record<string, string> = {};
          for (const name of capturedHeaders) {
            const value = response.headers.get(name);
            if (value !== null) headers[name] = value;
          }
          // Read once, without trimming, selecting fields, or silently dropping non-JSON errors.
          const raw = await response.text();
          let body: unknown = null;
          let bodyFormat = "empty";
          if (raw) {
            try { body = JSON.parse(raw); bodyFormat = "json"; }
            catch { body = raw; bodyFormat = "text"; }
          }
          matrix.push(redact({
            operation: step.operation, method: step.method, endpoint: step.endpoint,
            started_at: started, http_status: response.status,
            content_type: response.headers.get("content-type"), headers,
            body_format: bodyFormat, body,
          }, secrets));
        } catch {
          // Never serialize a fetch exception: it can contain the tokeninfo URL.
          matrix.push({ operation: step.operation, method: step.method, endpoint: step.endpoint,
            started_at: started, http_status: null, error: "transport_or_body_read_failed" });
        }
      }
      return reply(200, { package_name: pkg, started_at: startedAt,
        completed_at: new Date().toISOString(), matrix });
    } catch {
      // Shared OAuth errors are already projected; do not misrepresent them as a full response.
      return reply(502, { error: "matrix_setup_failed", matrix: [] });
    }
  };
}
