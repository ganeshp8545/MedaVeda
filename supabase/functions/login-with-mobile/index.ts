// Password login by mobile number. Called by the app as
// supabase.functions.invoke("login-with-mobile", { body: { mobileNumber, password } })
// BEFORE the user has a session, so verify_jwt = false (config.toml).
//
// Security properties:
// - The mobile number is only used to look up the account's email with the
//   service-role key. The email is never returned to the caller.
// - The password is checked by Supabase Auth itself (signInWithPassword), so
//   Auth's own rate limits, email-confirmation rule and ban checks all apply.
// - Every failure - bad input, unknown number, wrong password, unconfirmed
//   email, blocked account - returns the same 401 "Invalid credentials", so the
//   endpoint cannot be used to find out which numbers are registered.
// - Nothing about the request (number, password) is logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { normalizePhoneNumber } from "../_shared/phone.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const invalid = () => jsonResponse({ error: "Invalid credentials" }, 401);

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { mobileNumber?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalid();
  }
  const phone = normalizePhoneNumber(body.mobileNumber);
  const password = body.password;
  if (!phone || typeof password !== "string" || password.length === 0 || password.length > 256) {
    return invalid();
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    console.error("login-with-mobile: missing SUPABASE_URL / SUPABASE_ANON_KEY");
    return jsonResponse({ error: "Sign-in is temporarily unavailable." }, 503);
  }

  const { data: profile, error: lookupError } = await supabaseAdmin
    .from("profiles")
    .select("email, blocked")
    .eq("phone_normalized", phone)
    .maybeSingle();
  if (lookupError) {
    console.error("login-with-mobile: lookup failed", lookupError.code);
    return jsonResponse({ error: "Sign-in is temporarily unavailable." }, 503);
  }
  if (!profile?.email || profile.blocked) return invalid();

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email: profile.email, password });
  if (error || !data.session) return invalid();

  // Session only - never the email or profile.
  return jsonResponse({ session: data.session });
});
