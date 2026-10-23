import { GoogleApiError } from "../_shared/googlePlay.ts";
import { sanitizeGoogleResponse } from "./sanitize.ts";

export type Dependencies = {
  getUser: (request: Request) => Promise<{ id: string } | null>;
  getAdmin: (id: string) => Promise<boolean>;
  getAal: (request: Request) => string;
  getToken: () => Promise<string>;
  getPackageName: () => string;
  fetchGoogle: typeof fetch;
};

const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
function reply(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, ...(status === 405 ? { Allow: "POST" } : {}) },
  });
}

export function createHandler(
  deps: Dependencies,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return reply(405, { error: "method_not_allowed" });
    }
    try {
      const user = await deps.getUser(request);
      if (!user) return reply(401, { error: "unauthorized" });
      if (!await deps.getAdmin(user.id)) {
        return reply(403, { error: "admin_required" });
      }
      if (deps.getAal(request) !== "aal2") {
        return reply(403, { error: "mfa_required" });
      }

      // All authorization checks precede credential access. The fixed body
      // calculates prices; it cannot create or update a Play catalog item.
      const pkg = deps.getPackageName();
      const token = await deps.getToken();
      const response = await deps.fetchGoogle(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${
          encodeURIComponent(pkg)
        }/pricing:convertRegionPrices`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15_000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            price: { currencyCode: "INR", units: "1", nanos: 0 },
          }),
        },
      );
      if (response.ok) {
        return reply(200, { google_http_status: response.status });
      }
      const raw = await response.json().catch(() => null);
      const callerAuthorization = request.headers.get("Authorization") ?? "";
      return reply(
        200,
        sanitizeGoogleResponse(response.status, raw, [
          token,
          callerAuthorization,
          callerAuthorization.replace(/^Bearer\s+/i, ""),
        ]),
      );
    } catch (error) {
      if (error instanceof GoogleApiError) {
        return reply(502, {
          error: "oauth_failed",
          oauth_http_status: error.status,
          reason: error.reason,
          details: error.details,
        });
      }
      // Never serialize exceptions: fetch and parser failures may contain secrets.
      return reply(500, { error: "diagnostic_failed" });
    }
  };
}
