// Drives the REAL razorpay-webhook/index.ts + _shared/settle.ts (Node 22, no Deno) against a scratch DB.
// Only Razorpay's API and the supabase client are replaced (see the *.mock.ts files). Use run.sh.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
let handler; globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => process.env[k] } };
globalThis.__rzp = { payments: {}, refunds: {}, disputes: {}, orders: {} };
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
globalThis.__rzp.refunds.rfnd_1 = { id: "rfnd_1", payment_id: PAY, amount: 100, currency: "INR", status: "processed", created_at: 1600000000 };
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
globalThis.__rzp.refunds.rfnd_1.amount = amount;
ok(access() === "t", "fixture reset: access back");
ok(await send(refundEvt()) === 204 && access() === "f" && pstatus() === "refunded" && ostatus() === "refunded", "FULL refund -> access revoked, purchase refunded");
ok(await send(refundEvt()) === 204 && pstatus() === "refunded", "replayed refund -> idempotent");

// Authenticated reversal events must be durable before an order/payment links.
const makeOrder = (suffix) => {
  const user = `b4000000-0000-0000-0000-0000000000${suffix}`;
  q(`insert into auth.users(id,email) values ('${user}','wh_${suffix}@example.com')`);
  const raw = q(`select public.create_priced_order('${user}','wh_p',false)::text`);
  const result = JSON.parse(raw);
  const oid = `order_WhTest${suffix}`;
  q(`update public.orders set razorpay_order_id='${oid}' where id='${result.order_id}'`);
  const paise = Number(q(`select round(amount*100) from public.orders where id='${result.order_id}'`));
  globalThis.__rzp.orders[oid] = { id:oid,amount:paise,currency:'INR',status:'paid' };
  return { id:result.order_id, oid, paise };
};
const captureEvent = (paymentId,order) => ({ event:'payment.captured',
  created_at:Math.floor(Date.now()/1000)-25*3600,
  payload:{payment:{entity:{id:paymentId,order_id:order.oid,amount:order.paise,status:'captured'}}} });
const refundEvent = (paymentId,refundId) => ({event:'refund.processed',payload:{
  refund:{entity:{id:refundId,payment_id:paymentId}},payment:{entity:{id:paymentId}}}});
const noGrant = order => Number(q(`select count(*) from public.purchases where order_id='${order.id}' and status='success'`))===0;
const earlyRefund=makeOrder('02'), earlyPay='pay_WhEarly002', earlyRfnd='rfnd_WhEarly002';
globalThis.__rzp.payments[earlyPay]={id:earlyPay,order_id:earlyRefund.oid,status:'refunded',amount:earlyRefund.paise,
  currency:'INR',amount_refunded:earlyRefund.paise,refund_status:'full'};
globalThis.__rzp.refunds[earlyRfnd]={id:earlyRfnd,payment_id:earlyPay,amount:earlyRefund.paise,
  currency:'INR',status:'processed',created_at:Math.floor(Date.now()/1000)};
ok(await send(refundEvent(earlyPay,earlyRfnd))===204
  && Number(q(`select count(*) from public.provider_events where payment_id='${earlyPay}' and status='pending'`))===1,
  'F01 refund-before-link persists authenticated pending event');
ok(await send(captureEvent(earlyPay,earlyRefund))===204 && noGrant(earlyRefund)
  && q(`select status from public.payment_captures where payment_id='${earlyPay}'`)==='reversed',
  'F01 refund-before-capture cannot grant access');
ok(q(`select (payment_provider_time < now()-interval '24 hours'
  and payment_completed_at > now()-interval '2 minutes'
  and payment_time_fallback=false)::text from public.orders where id='${earlyRefund.id}'`)==='true',
  'F05 authenticated capture event time remains 25h before receipt/settlement');

const earlyDispute=makeOrder('03'), disputePay='pay_WhDispute03', disputeId='disp_WhDispute03';
globalThis.__rzp.payments[disputePay]={id:disputePay,order_id:earlyDispute.oid,status:'captured',
 amount:earlyDispute.paise,currency:'INR',amount_refunded:0};
globalThis.__rzp.disputes[disputeId]={id:disputeId,payment_id:disputePay,status:'open',amount:earlyDispute.paise};
ok(await send({event:'payment.dispute.created',payload:{dispute:{entity:{id:disputeId,payment_id:disputePay}}}})===204
  && Number(q(`select count(*) from public.provider_events where payment_id='${disputePay}' and status='pending'`))===1,
  'F01 dispute-before-capture persists pending event');
ok(await send(captureEvent(disputePay,earlyDispute))===204 && noGrant(earlyDispute),
  'F01 dispute-before-capture cannot grant access');

const interleaved=makeOrder('04'), racePay='pay_WhRace004', raceRefund='rfnd_WhRace004';
globalThis.__rzp.payments[racePay]={id:racePay,order_id:interleaved.oid,status:'captured',
 amount:interleaved.paise,currency:'INR',amount_refunded:interleaved.paise,refund_status:'full'};
globalThis.__rzp.refunds[raceRefund]={id:raceRefund,payment_id:racePay,amount:interleaved.paise,
 currency:'INR',status:'processed',created_at:Math.floor(Date.now()/1000)};
globalThis.__rzp.beforeOrderFetch=async()=>{
  await send(refundEvent(racePay,raceRefund));
};
ok(await send(captureEvent(racePay,interleaved))===204 && noGrant(interleaved)
  && Number(q(`select count(*) from public.provider_events where payment_id='${racePay}' and event_type='refund.processed'`))===1,
  'F01 real interleaving: refund webhook between authoritative GET and settlement blocks grant');
