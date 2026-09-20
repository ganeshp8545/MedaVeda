import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const invalidCredentials = () =>
  new Response(JSON.stringify({ error: "Invalid credentials" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const compact = value.trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { phone, password } = await request.json();
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone || typeof password !== "string" || password.length === 0) {
      return invalidCredentials();
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceRoleKey || !anonKey) {
      console.error("Missing required Supabase Edge Function environment variables");
      return new Response("Authentication is unavailable", { status: 503, headers: corsHeaders });
    }

    // Service role is used only for the RLS-protected profile lookup. The
    // password is verified by the normal anonymous Supabase Auth endpoint.
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("email")
      .eq("phone_normalized", normalizedPhone)
      .maybeSingle();

    if (profileError) {
      console.error("Phone lookup failed", profileError.message);
      return new Response("Authentication is unavailable", { status: 503, headers: corsHeaders });
    }
    if (!profile?.email) {
      return invalidCredentials();
    }

    const auth = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (error || !data.session) return invalidCredentials();

    // Return a session, never the resolved email or profile details. The
    // client immediately persists it through its SecureStore-backed client.
    return new Response(JSON.stringify({ session: data.session }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Phone password login failed", error);
    return invalidCredentials();
  }
});
