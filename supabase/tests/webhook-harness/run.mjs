// Drives the REAL razorpay-webhook/index.ts + _shared/settle.ts (Node 22, no Deno) against a scratch DB.
// Only Razorpay's API and the supabase client are replaced (see the *.mock.ts files). Use run.sh.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
let handler; globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => process.env[k] } };
globalThis.__rzp = { payments: {}, disputes: {}, orders: {} };
await import("./razorpay-webhook/index.ts");
const db = process.env.WH_DB ?? "ap_wh";
const q = (s) => execFileSync("psql", ["-h", process.env.PGHOST ?? "127.0.0.1", "-p", process.env.PGPORT ?? "54329", "-U", process.env.PGUSER ?? "postgres", "-w", "-d", db, "-Atc", s]).toString().trim();
const ok = (c, m) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
let n = 0;
const send = async (body, { sign = true, sig } = {}) => {
  const raw = JSON.stringify(body);
  const headers = { "x-razorpay-event-id": `evt_h${++n}` };
  if (sign) headers["x-razorpay-signature"] = sig ?? createHmac("sha256", "whsec_test").update(raw).digest("hex");
  const r = await handler(new Request("http://x/razorpay-webhook", { method: "POST", headers, body: raw }));
  return r.status;
};
const PAY = "pay_WhTest0001", DISP = "disp_WhTest0001";
const access = () => q(`select public.user_can_access_note('b4000000-0000-0000-0000-000000000001','wh_note')`);
const pstatus = () => q(`select status from public.purchases where user_id='b4000000-0000-0000-0000-000000000001' order by created_at limit 1`);
const ostatus = () => q(`select status from public.orders where razorpay_payment_id='${PAY}'`);
const amount = Number(q(`select round(amount*100) from public.orders where razorpay_payment_id='${PAY}'`));
globalThis.__rzp.payments[PAY] = { id: PAY, order_id: "order_x", status: "captured", amount, currency: "INR", amount_refunded: 0, refund_status: null };
const refundEvt = () => ({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: PAY } }, payment: { entity: { id: PAY } } } });
const dispEvt = (event, status) => ({ event, payload: { dispute: { entity: { id: DISP, payment_id: PAY, status } }, payment: { entity: { id: PAY } } } });

ok(access() === "t" && pstatus() === "success", "baseline: paid, access granted");
ok(await send(dispEvt("payment.dispute.created", "open"), { sign: false }) === 400, "dispute event without signature -> 400 (never processed)");
ok(await send(dispEvt("payment.dispute.created", "open"), { sig: "0".repeat(64) }) === 401, "dispute event with a wrong signature -> 401");
ok(access() === "t", "... and access is untouched by unsigned events");

// partial refund must NOT revoke
globalThis.__rzp.payments[PAY] = { ...globalThis.__rzp.payments[PAY], amount_refunded: 100, refund_status: "partial" };
ok(await send(refundEvt()) === 204 && access() === "t" && pstatus() === "success" && ostatus() === "paid", "PARTIAL refund -> 204, access and purchase untouched");

// disputes
globalThis.__rzp.disputes[DISP] = { id: DISP, payment_id: PAY, status: "open", phase: "chargeback", amount };
ok(await send(dispEvt("payment.dispute.created", "open")) === 204 && access() === "f" && pstatus() === "disputed", "dispute created -> access suspended");
ok(await send(dispEvt("payment.dispute.action_required", "open")) === 204 && pstatus() === "disputed", "action_required -> still suspended, no error");
globalThis.__rzp.disputes[DISP].status = "closed";
ok(await send(dispEvt("payment.dispute.closed", "closed")) === 204 && pstatus() === "disputed", "closed -> no automatic change (left for a manual decision)");
globalThis.__rzp.disputes[DISP].status = "won";
ok(await send(dispEvt("payment.dispute.won", "won")) === 204 && access() === "t" && pstatus() === "success", "dispute won -> access restored");
// the payload is not trusted: Razorpay says 'won', so a forged-looking 'lost' event does not revoke
ok(await send(dispEvt("payment.dispute.lost", "lost")) === 204 && access() === "t", "event says lost but Razorpay says won -> Razorpay wins, access kept");
ok(await send({ event: "payment.dispute.created", payload: { dispute: { entity: { id: "not-an-id" } } } }) === 400, "malformed dispute id -> 400");
delete globalThis.__rzp.disputes[DISP];
ok(await send(dispEvt("payment.dispute.created", "open")) === 500 && access() === "t", "Razorpay lookup fails -> 500 (Razorpay retries), access untouched");
globalThis.__rzp.disputes[DISP] = { id: DISP, payment_id: PAY, status: "lost", phase: "chargeback", amount };
ok(await send(dispEvt("payment.dispute.lost", "lost")) === 204 && access() === "f" && pstatus() === "chargeback" && ostatus() === "refunded", "dispute lost -> chargeback, access gone, order refunded");
ok(await send(dispEvt("payment.dispute.lost", "lost")) === 204 && pstatus() === "chargeback", "replayed lost event -> idempotent");

// full refund on a fresh purchase
q(`update public.purchases set status='success' where status='chargeback'; update public.orders set status='paid' where razorpay_payment_id='${PAY}'`);
globalThis.__rzp.payments[PAY] = { ...globalThis.__rzp.payments[PAY], amount_refunded: amount, refund_status: "full" };
ok(access() === "t", "fixture reset: access back");
ok(await send(refundEvt()) === 204 && access() === "f" && pstatus() === "refunded" && ostatus() === "refunded", "FULL refund -> access revoked, purchase refunded");
ok(await send(refundEvt()) === 204 && pstatus() === "refunded", "replayed refund -> idempotent");
