// supabase/functions/_shared/cors.ts

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

// JSON response helper. "pay" and "verify-payment" used to return HTML
// pages meant for an external browser - Supabase doesn't serve real
// text/html on the default *.supabase.co domain (scripts get sandboxed
// and blocked), which is why the checkout button did nothing. They now
// return JSON, and the checkout UI runs inside the app's own WebView.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
