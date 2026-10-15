// Best-effort server alert. UCB_SENTRY_DSN is a Supabase secret, never a client value.
export async function alertUcb(message: string, orderId?: string): Promise<void> {
  const raw = Deno.env.get("UCB_SENTRY_DSN");
  if (!raw) { console.error("UCB Sentry DSN missing", { message, orderId }); return; }
  try {
    const dsn = new URL(raw);
    if (dsn.protocol !== "https:" || !dsn.username || !/^\/\d+\/?$/.test(dsn.pathname))
      throw new Error("Invalid UCB_SENTRY_DSN");
    const projectId = dsn.pathname.replace(/\//g, "");
    const endpoint = `${dsn.origin}/api/${projectId}/store/`;
    const response = await fetch(endpoint, {
      method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", "X-Sentry-Auth":
        `Sentry sentry_version=7,sentry_client=medveda-ucb/1,sentry_key=${dsn.username}` },
      body: JSON.stringify({ event_id: crypto.randomUUID().replace(/-/g, ""),
        timestamp: new Date().toISOString(), level: "error", platform: "javascript",
        message, tags: { component: "ucb-backend" }, extra: { orderId } }),
    });
    if (!response.ok) throw new Error(`Sentry ${response.status}`);
  } catch (error) { console.error("UCB Sentry alert failed", { message, orderId, error: String(error) }); }
}
