import { supabaseAdmin } from "./supabaseAdmin.ts";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]
    ?? "unknown";
  return forwarded.trim() || "unknown";
}

// true = within limit. Fails OPEN on a database error for availability of the
// endpoint, but the auth provider's own limits still apply behind it.
export async function withinLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
    p_key: await sha256Hex(key),
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rateLimit: rpc failed", error.code);
    return true;
  }
  return data === true;
}
