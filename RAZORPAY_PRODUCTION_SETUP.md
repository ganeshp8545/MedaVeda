# Razorpay production setup

**Status: BLOCKED — OWNER ACTION REQUIRED.** The audit found `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on Supabase are not a valid live pair
(identical digests), and the webhook secret was rotated (the new value is only in the owner's scratchpad file). Nothing below has been done by Claude;
no credential is in the repo or in this file.

The code reads exactly these Edge Function secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
(optional `RAZORPAY_WEBHOOK_PREVIOUS_SECRET` for rotation). `ALLOW_TEST_MODE` must stay **unset** in production (a `rzp_test_` key then hard-fails every request).

1. **Live Key ID** — Razorpay Dashboard → switch to *Live* → Settings → API Keys → Generate. Then
   `supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxxxxxxx`
2. **Live Key Secret** — shown once at generation: `supabase secrets set RAZORPAY_KEY_SECRET=<secret>` (type it into the terminal; never commit or paste in chat).
3. **Generate a webhook secret** — `openssl rand -hex 32` (keep it in a password manager).
4. **Set it on Supabase** — `supabase secrets set RAZORPAY_WEBHOOK_SECRET=<that value>`
5. **Same secret in Razorpay** — Dashboard → Settings → Webhooks → Add/Edit → Secret = the identical value.
6. **Webhook URL** — `https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/razorpay-webhook`. Events: `payment.captured`, `refund.processed`, and the dispute events `payment.dispute.created`, `.under_review`,
   `.action_required`, `.won`, `.lost`, `.closed` (the function ignores any other event with 204).
7. **Controlled live test** — with the production app build, log in as a test student and buy the lowest-priced product (Razorpay minimum ₹1; if no product is that
   cheap, create a temporary ₹1 active product for a test course and deactivate it afterwards). Pay with your own UPI.
8. **Verify webhook** — Razorpay Dashboard → Webhooks → recent deliveries: `payment.captured` → HTTP 2xx. Supabase → Edge Functions → razorpay-webhook logs: no "invalid signature".
9. **Verify settlement** — `select status, amount, razorpay_payment_id from orders order by created_at desc limit 1` → `paid`; exactly one `success` row in `purchases` for it.
10. **Verify access** — the product opens in the app; `select * from purchases where order_id = ...` has one `success` row.
11. **Wallet / referral** — if the buyer was referred: exactly one referrer wallet credit (`wallet_ledger`) after settlement; re-send the webhook from Razorpay ("Retry") and confirm nothing is
    credited or granted twice. Issue a refund from the Razorpay Dashboard for the test payment and confirm access is revoked, the referral credit reversed once, and a replayed refund event changes nothing.

## What the code guarantees (reviewed 2026-09-21) and the test that proves it
| Requirement | Where | Evidence |
|---|---|---|
| Client cannot choose price / wallet amount | `create-order` reads only `productId` + boolean `useWallet`; price, discount, wallet decided in `create_priced_order()` | `phase2_referral_wallet_checks.sql` (P*, W*), `batch1_checks.sql` |
| Client cannot fake success | `verify-payment` needs the Razorpay HMAC **and** Razorpay's own API confirming captured/same order/INR/same amount (`_shared/settle.ts`) | `verify-signature-selftest.js`, SQL settle checks |
| Signature checked (client + webhook) | constant-time HMAC in `_shared/razorpay.ts` / `razorpay-webhook` (raw body) | webhook harness: unsigned → 400, wrong sig → 401 |
| Webhook idempotent; no duplicate wallet credit / referral reward / access | settlement keyed by event id + unique `razorpay_payment_id`, one purchase per order | `P6`, `P7`, `W11`, `E8`, `U7` (phase2 suite); harness replays |
| Refund / dispute reversals safe and once-only | `handle_payment_refund`, dispute handlers re-read Razorpay as source of truth | `F6`, `RW4`, `RW6`; harness (full/partial refund, dispute lifecycle) |
| Order belongs to the user | order row created for the JWT user; settlement uses the stored `user_id`, never the request | `batch1_checks.sql`, `critical_fixes_checks.sql` |
| Currency + amount validated server-side | `settle.ts`: payment and Razorpay order must be `INR` and equal the DB amount in paise | harness/SQL checks |
| Concurrent referral cap | row lock | `batch3_race.sh` (run 2026-09-21: PASS) |
Run everything with `PGHOST=127.0.0.1 PGPORT=<port> PGUSER=postgres supabase/tests/run-all.sh`.
