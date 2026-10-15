// Read-only endpoint probe. It sends no credentials and never creates orders.
// Usage: UCB_FUNCTIONS_BASE_URL=https://<ref>.supabase.co/functions/v1 node scripts/ucb-smoke-test.mjs
const base = process.env.UCB_FUNCTIONS_BASE_URL?.replace(/\/$/, "");
if (!base || !/^https:\/\/[^/]+\.supabase\.co\/functions\/v1$/.test(base)) {
  console.error("Set UCB_FUNCTIONS_BASE_URL to the deployed Supabase functions/v1 URL.");
  process.exit(2);
}
const userFunctions = ["create-order", "create-play-order", "verify-play-purchase", "attach-external-token"];
const serverFunctions = ["report-external-transaction", "razorpay-webhook", "verify-payment"];
const testJwt = process.env.UCB_TEST_USER_JWT;
const cronSecret = process.env.UCB_REPORT_CRON_SECRET;
let failures = 0;
async function probe(name, headers, expected) {
  try {
    const response = await fetch(`${base}/${name}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers },
      body: "{malformed", signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const statusOk = expected === "auth" ? [401, 403].includes(response.status)
      : response.status >= 400 && response.status < 500;
    const noLeak = !/(at\s+\S+\s*\([^\n]+:\d+:\d+\)|stack(trace)?|private_key|service_role|rzp_(live|test)_)/i.test(body);
    const ok = statusOk && noLeak;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${expected}: HTTP ${response.status}${noLeak ? "" : " (possible leak)"}`);
    if (!ok) failures++;
  } catch (error) {
    console.error(`FAIL ${name} ${expected}: ${error instanceof Error ? error.message : "network error"}`);
    failures++;
  }
}
for (const name of userFunctions) await probe(name, {}, "auth");
for (const name of serverFunctions) await probe(name, {}, name === "report-external-transaction" ? "auth" : "malformed");
if (testJwt) {
  for (const name of userFunctions) await probe(name, { Authorization: `Bearer ${testJwt}` }, "malformed");
} else {
  console.log("SKIP authenticated malformed-body probes: UCB_TEST_USER_JWT is unset.");
}
if (cronSecret) {
  await probe("report-external-transaction", { "x-ucb-cron-secret": cronSecret }, "malformed");
} else {
  console.log("SKIP cron-authenticated malformed-body probe: UCB_REPORT_CRON_SECRET is unset.");
}
process.exitCode = failures ? 1 : 0;
