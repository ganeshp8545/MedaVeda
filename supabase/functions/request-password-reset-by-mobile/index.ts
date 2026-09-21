// "Forgot password" by mobile number. Called by the app as
// supabase.functions.invoke("request-password-reset-by-mobile", { body: { mobileNumber } })
// with no session, so verify_jwt = false (config.toml).
//
// There is no SMS: the number is only used to find the account, and the normal
// Supabase reset email is sent to the address already on that account. The
// caller always gets the same { ok: true } whether or not a number matched, so
// it cannot be used to discover registered numbers, and the email address is
// never returned.
//
// Abuse / enumeration controls: rate limited per IP (10/hour) and per number
// (3/hour), counted before any lookup; over-limit calls get the SAME generic
// { ok: true } (a distinct 429 would let an attacker tell "known" from "unknown"
// once the per-number budget runs out). The email is sent in the background so
// response time does not differ between a known and an unknown number.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { normalizePhoneNumber } from "../_shared/phone.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { clientIp, withinLimit } from "../_shared/rateLimit.ts";

// Must also be in Supabase Auth -> URL Configuration -> Redirect URLs.
const PASSWORD_RESET_REDIRECT_URL = "https://www.medveda.in/reset-password";

const generic = () => jsonResponse({ ok: true });

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let phone: string | null = null;
  try {
    phone = normalizePhoneNumber((await req.json()).mobileNumber);
  } catch {
    return generic();
  }
  if (!phone) return generic();

  // Per IP, per IP+number, and a per-number ceiling across IPs (bounds mail-bombing a
  // victim's inbox without letting one client exhaust the number's whole budget).
  const ip = clientIp(req);
  if (!(await withinLimit(`reset-ip:${ip}`, 10, 3600))
      || !(await withinLimit(`reset-ip-phone:${ip}:${phone}`, 3, 3600))
      || !(await withinLimit(`reset-phone:${phone}`, 6, 3600))) {
    return generic();
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    console.error("request-password-reset-by-mobile: missing SUPABASE_URL / SUPABASE_ANON_KEY");
    return generic();
  }

  const { data: profile, error: lookupError } = await supabaseAdmin
    .from("profiles")
    .select("email, blocked")
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (lookupError) {
    console.error("request-password-reset-by-mobile: lookup failed", lookupError.code);
    return generic();
  }
  if (!profile?.email || profile.blocked) return generic();

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const send = authClient.auth
    .resetPasswordForEmail(profile.email, { redirectTo: PASSWORD_RESET_REDIRECT_URL })
    .then(({ error }) => {
      if (error) console.error("request-password-reset-by-mobile: send failed", error.status);
    })
    .catch(() => {});
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(send);
  else await send;

  return generic();
});
