import { corsHeaders } from "../_shared/cors.ts";
import {
  aalFromAuthHeader,
  getUserFromAuthHeader,
  supabaseAdmin,
} from "../_shared/supabaseAdmin.ts";

const expectedClientEmail =
  "medveda-play-billing@medveda-play-billing.iam.gserviceaccount.com";
const headers = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

function result(matches: boolean, status = 200): Response {
  return new Response(
    JSON.stringify({ service_account_matches_expected: matches }),
    {
      status,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...(status === 405 ? { Allow: "GET, OPTIONS" } : {}),
      },
    },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== "GET") return result(false, 405);

  try {
    // Verify the same token before trusting its AAL claim, then require admin
    // membership and MFA unconditionally for this credential diagnostic.
    const user = await getUserFromAuthHeader(req);
    if (!user) return result(false, 401);
    const { data: admin, error: adminError } = await supabaseAdmin
      .from("admins").select("id").eq("id", user.id).maybeSingle();
    if (adminError) return result(false, 500);
    if (!admin) return result(false, 403);

    if (aalFromAuthHeader(req) !== "aal2") {
      return result(false, 403);
    }

    // Read only after authorization. Never return or log the parsed value or a
    // parser exception (which can contain fragments of the credential JSON).
    const raw = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    let account: unknown;
    try {
      account = JSON.parse(raw ?? "");
    } catch {
      return result(false);
    }
    return result(
      typeof account === "object" && account !== null &&
        !Array.isArray(account) && "client_email" in account &&
        account.client_email === expectedClientEmail,
    );
  } catch {
    // Status codes distinguish a failed check from a successful non-match.
    // Do not serialize or log authentication, database or environment errors.
    return result(false, 500);
  }
});
