import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
// into every Edge Function's environment - no need to set them manually
// via `supabase secrets set`. The service role key bypasses RLS, which
// this backend needs: it has to read/write orders, purchases, and
// payment_sessions across users, not just the calling user's own rows.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY Edge Function environment variable.");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Verifies the bearer token from an incoming request's Authorization
// header and returns the authenticated user - the only thing that should
// ever identify who's paying. Never trust a uid passed as a plain body/
// query param, since that would let anyone buy a product "as" someone
// else.
export async function getUserFromAuthHeader(
  req: Request
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? undefined };
}

// The session's authentication assurance level ("aal1" = password only, "aal2" = MFA done).
// Only call this AFTER getUserFromAuthHeader() accepted the same token: it decodes the payload
// without re-verifying the signature.
export function aalFromAuthHeader(req: Request): string {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "";
  } catch {
    return "";
  }
}
