# MedVeda independent payment-security audit

Report completed: **2026-10-14 UTC**. Tests executed during the preceding audit session, 2026-10-13 UTC. Target: working tree based on Git HEAD `281fa81`, including uncommitted and untracked payment changes, not merely HEAD.

**Play internal testing: NO-GO for release approval. Production: NO-GO.**

**8 findings: CRITICAL 0, HIGH 4, MEDIUM 3, LOW 1.** Zero confirmed critical findings is not proof that none exist. The passing repository suite does not establish payment correctness: one test explicitly accepts reuse of a first-purchase discount, and additional adversarial checks reproduced refund-ordering and reconciliation failures.

Source was not edited, formatted, committed, or deployed. This report is the only repository file changed by this audit. No production or remote database was accessed. Official Google documentation was fetched read-only. SQL ran against a newly initialized PostgreSQL 17 instance under `/tmp`, listening on `127.0.0.1:55437`, using scratch databases and the repository's Supabase stub. That stub does not reproduce hosted Auth, PostgREST, pg_net, Vault, or real cron execution.

Three fresh review agents were requested, as instructed. All stopped on a usage-limit error without returning substantive reviews. Findings below come from the primary auditor's code inspection and executed checks; they are not three independent endorsements. Earlier audit reports were not used as evidence. The pre-existing report was copied to `/tmp` before replacement. Temporary execution artifacts from the preceding session were no longer present on resumption; results recorded below are retained in the tool transcript, not claimed to remain available as log files. HEAD and the principal finding locations were checked again on resumption.

## Post-fix local verification — 2026-10-14 UTC

The findings below remain the independent audit's original evidence. The Fix status column records subsequent work in this working tree; no migration was applied remotely, no provider API was called, and no commit was made. The local scratch PostgreSQL at `127.0.0.1:55437` was the only database used.

- `KEEP_DB=1 bash supabase/tests/run-all.sh`: **ALL SUITES PASSED** with the required `PGHOST=127.0.0.1 PGPORT=55437 PGUSER=postgres`. The runner includes 13 summarized SQL suites (515 assertions), six additional SQL suites, wallet/discount/Play/Razorpay concurrency tests, server self-tests, Vault validation, and 23 signed webhook checks.
- Mobile `npx --no-install tsc --noEmit`: pass. `deno check` on all 27 Edge Function and shared TypeScript files: pass. All five mobile script self-tests: pass.
- F01 tests exercised refund-before-link, dispute-before-capture, capture-then-refund, and a refund webhook delivered between provider GET and capture settlement. F02 concurrent creation produced one discounted checkout and one list-price checkout; the stale discounted capture was compensated without access. F03 mocks verified UCB capture reporting, capture and compensation of a verified payment with no matching local order, retrying refund, stable refund marker recovery after a lost response, and Google refund queueing.
- F04 mock checked the eleventh refunded token despite ten permanent Google failures; SQL checked backoff, lease expiry recovery and parked-job metrics. F06's 1,500-item mocked Google model used 1.5-second latency and 5% first-attempt failures, draining in 41 minutes. It is a capacity model, not a live service-level guarantee.
- F05 uses the authenticated `payment.captured` webhook envelope's top-level `created_at` as provider event time. Razorpay documents `payment.captured` as triggered on successful capture, while payment entity `created_at` is payment creation time; see [payment webhook payloads](https://razorpay.com/docs/webhooks/payloads/payments/) and [payment API fields](https://razorpay.com/docs/api/payments/). If the capture event time is unavailable, the server flags and alerts the receipt-time fallback. The 25-hour delayed-capture test checked provider time, settlement time, Google's `transactionTime` and the queued report deadline separately.
- The referral/wallet switch-off check passed on both Razorpay and Play: list-price orders, no wallet reservation/debit and no referral reward. The exact release settings and **DECISION NEEDED** items are in [RELEASE_GATES.md](RELEASE_GATES.md).

**Still UNVERIFIED:** hosted migrations/secrets/cron delivery, live Razorpay refund idempotency and webhook timing, Google API throughput and 24-hour acceptance, Play RTDN delivery, real device/build purchase flows, deployed tax/business values, and customer-facing refund handling. Production and Play internal-testing release approval remain **NO-GO** until the release gates are completed.

## Findings

| ID | Severity | Lens | File:line | Concrete scenario | Recommended fix | Fix status |
|---|---|---|---|---|---|---|
| F01 | HIGH | 4, 6 | `supabase/migrations/20260926100000_batch1_refund_dispute_revoke_access.sql:192`; `supabase/functions/_shared/settle.ts:138`; `supabase/functions/razorpay-webhook/index.ts:147` | Refund/dispute arrives before capture settlement records the payment ID. It is acknowledged as unknown; a previously verified capture can subsequently grant access. | Persist authenticated provider events independently of entitlement linkage; associate using provider order/payment IDs; make reversal terminal and replay pending reversals during settlement. | FIXED (local): `batch1_checks.sql`, signed `webhook-harness` refund/dispute ordering and interleaving |
| F02 | HIGH | 2, 4, 7, 13 | `supabase/migrations/20261013100000_wallet_reservations.sql:242`, `:259`, `:347`; `supabase/tests/batch1_checks.sql:331` | Buyer creates multiple discounted orders before paying, then pays cancelled checkouts. More than one receives the first-purchase discount and access. | Reserve/consume discount eligibility atomically and compensate captured stale discounted payments without granting underpriced content. Change tests to reject duplicate discount entitlement. | FIXED (local): `batch1_checks.sql`, `phase2_referral_wallet_checks.sql`, `discount-concurrency.sh` |
| F03 | HIGH | 5, 7 | `supabase/migrations/20261013100000_wallet_reservations.sql:228`; `supabase/functions/_shared/settle.ts:71`; `supabase/functions/report-external-transaction/index.ts:54` | A captured stale wallet order lacks sufficient balance. Settlement rolls back, leaving no payment record or durable compensation flag; the UCB sweep excludes its cancelled/created status. | Durably record capture separately from entitlement, queue refund/compensation, and report actual external captures and subsequent refunds regardless of grant success. | FIXED (local): `batch1_checks.sql`, `settle-timestamp-selftest.cjs`, `compensation-worker-selftest.cjs`, `razorpay-refund-selftest.ts`; DECISION NEEDED: automatic refund policy |
| F04 | HIGH | 3, 6 | `supabase/functions/report-external-transaction/index.ts:177`, `:190`, `:193` | Ten persistently failing oldest Play tokens occupy every reconciliation batch. An eleventh refunded purchase is never checked by the fallback scan. | Track attempt time separately from successful check time; use retry scheduling, leases and fair pagination; keep failures retryable without blocking later tokens. Add RTDN or equivalent prompt reconciliation. | FIXED (local): `play-reconcile-fairness-selftest.cjs`, `payment_queue_checks.sql`; RTDN follow-up documented |
| F05 | MEDIUM | 5 | `supabase/migrations/20261013100000_wallet_reservations.sql:274`; `supabase/functions/_shared/externalReporting.ts:68` | Delayed capture processing reports local settlement time as transaction completion time, shifting both Google's transaction timestamp and the overdue alert clock. | Persist an authoritative completion/capture timestamp and retain processing time separately. Do not substitute payment creation time without establishing its semantics. | FIXED (local): `batch1_checks.sql`, `webhook-harness`, `google-reporting-selftest.cjs` |
| F06 | MEDIUM | 3, 5 | `supabase/functions/report-external-transaction/index.ts:55`, `:79`, `:88`; `supabase/ucb_cron_setup.sql:25` | After an outage, the scheduled report worker attempts only one transaction per minute; a 1,500-item backlog cannot clear inside 24 hours even with instant successful APIs. Retries consume capacity too. | Use bounded parallel workers with leases, next-attempt backoff, deadline prioritization and measured capacity; alert on backlog age and expected drain time. | FIXED (local model): `payment_queue_checks.sql`, `payment-backlog-load-selftest.ts` (1,500 items in 41 minutes) |
| F07 | MEDIUM | 10 | `supabase/functions/_shared/razorpay.ts:36` | Production receives a test Razorpay key plus `ALLOW_TEST_MODE=true`; the server accepts it and normal settlement can grant production entitlements for test payments. | Tie test mode to an independently verified staging project/environment and reject test credentials on production regardless of the opt-in flag. | FIXED (local): `razorpay-env-selftest.ts`; production `APP_ENV` setup remains a release gate |
| F08 | LOW | 5, 10 | `supabase/ucb_cron_setup.sql:18` | Missing Vault rows yield NULL. The validation `IF` is not true, so setup can schedule nonfunctional jobs instead of rejecting missing configuration. | Explicitly reject NULL/blank URL and secret, validate uniqueness, and verify a completed authenticated local/staging job before rollout. | FIXED (local): `ucb-cron-config-selftest.cjs` missing, blank, invalid and duplicate Vault cases |

### F01 — Reversal before payment linkage is lost

Evidence:

```sql
-- 20260926100000_batch1_refund_dispute_revoke_access.sql:192
if not exists (select 1 from public.orders where razorpay_payment_id = p_razorpay_payment_id) then
  return jsonb_build_object('status', 'unknown_payment');
end if;
```

`_shared/settle.ts:138` treats this result as `{ ok: true, outcome: ... }`. The webhook returns HTTP 204 at `razorpay-webhook/index.ts:148`. The analogous dispute handling also treats an unknown payment as a successful outcome. There is no durable inbox entry for these unknown reversals.

The important interleaving is: capture handler fetches an authoritative `captured` payment; refund occurs and its webhook runs before the capture SQL transaction; refund sees no `orders.razorpay_payment_id`; capture transaction then grants. Fetching the payment again before settlement narrows this window but does not remove it.

**Executed local reproduction:** created and bound a UCB order, called `handle_payment_refund('pay_Audit0001', true)` before `settle_razorpay_payment(...)`. Output was `{"status":"unknown_payment"}`, then order `paid`, purchase `success`. This demonstrates the database interleaving. The endpoint's 204 behavior is verified from code; a real concurrent Razorpay delivery was not performed. If the capture fetch instead happens after a full refund, its status check may reject the capture; that does not resolve the demonstrated ordering window or the lost accounting/reporting event.

Fix must preserve refund/dispute evidence before an entitlement exists and ensure later capture cannot override it. An unknown authenticated reversal should be durably queued or cause a retry, not be discarded as completed.

### F02 — First-purchase discount can be spent repeatedly

Evidence from the effective, latest settlement definition:

```sql
-- 20261013100000_wallet_reservations.sql:242
v_discount_dup := found and v_discount_owner is not null and v_discount_owner <> v_order.id;
-- :266, entitlement ignores v_discount_dup
case when v_owned_purchase is null then 'success' else 'duplicate' end
-- :347
if v_discount_dup then
  insert into public.order_review_flags ...
```

Creating another order cancels earlier unpaid orders (`:99`), but cancellation does not prevent payment at Razorpay. Settlement accepts cancelled/failed orders and flags them after granting. Create several different-product orders while first-purchase eligibility still applies, then pay them. Only one referrer reward is created, but that is a different invariant from allowing only one friend discount.

**Executed evidence:** the full suite passed `batch1_checks.sql`, whose `:336` assertion is literally `X1 the reused-discount order still GRANTS access`. Its companion assertions verify a ₹50 undercharge flag. Thus a passing test proves the unwanted behavior rather than disproving it. Correctness requires an atomic discount reservation plus a durable refund/compensation path for captures against invalidated discounts.

### F03 — Captured wallet shortfall has no durable payment outcome

```sql
-- 20261013100000_wallet_reservations.sql:227
if coalesce(v_balance,0)-v_other_reserved < v_order.wallet_amount then
  raise exception 'wallet shortfall: captured payment requires manual refund or compensation';
end if;
```

This exception is before the `payments` insert and rolls back settlement. `_shared/settle.ts:71` emits a best-effort alert and returns failure. No automatic refund or durable capture/compensation queue is written. The report sweep requires order status `paid` or `refunded` (`report-external-transaction/index.ts:54`). The refund handler also depends on payment ID linkage (F01).

**Executed evidence:** after the repository wallet-concurrency test, inspection of its three orders showed two paid orders and one cancelled order with wallet amount ₹250, **zero payment rows and zero review flags** for the rejected settlement. Which concurrent order loses is nondeterministic. Provider calls were simulated by the test; this proves the local persistence behavior, not a real charge.

Rejecting an underfunded grant is correct. Discarding durable knowledge of an already captured payment is not. Keep the failed entitlement separate from capture accounting, external reporting, and eventual compensation.

### F04 — Failed Play tokens starve reconciliation

```ts
// report-external-transaction/index.ts:177
.order("play_last_checked_at", { ascending: true, nullsFirst: true }).limit(10);
// :190 — only reached after successful API/reversal work
.update({ play_last_checked_at: new Date().toISOString() })
// :193 — catch alerts, but records no retry timestamp or cursor progress
console.error("UCB Play refund reconciliation failed", ...);
```

**Executed mock of the actual handler:** eleven unpaid-check timestamps; the first ten API lookups always throw, the eleventh would return a refunded purchase. Two `reconcile` invocations produced:

```json
{"calls":20,"uniqueTokens":10,"eleventhTokenChecked":false}
```

The separate void cursor is a useful independent path, but it does not establish coverage for refunds absent from that stream or older than its history window. The paid-token scan explicitly exists to cover those gaps. A persistent API error on ten old records defeats that fallback indefinitely. No RTDN endpoint is implemented in the inspected payment functions.

### F05 — Processing time is sent as completion time

```sql
-- 20261013100000_wallet_reservations.sql:274
then coalesce(payment_completed_at, clock_timestamp()) else payment_completed_at end
```

```ts
// _shared/externalReporting.ts:68
transactionTime: new Date(order.payment_completed_at).toISOString(),
```

The SQL stores when MedVeda handles settlement, not when the provider completed payment. `p_paid_at` is used for stale-order checks, not this timestamp; it currently represents Razorpay payment creation and is not automatically an appropriate capture timestamp either. A delayed callback can shift the timestamp by hours and postpone the alert based on that same column.

**Executed local check:** passed a timestamp 25 hours earlier to settlement; `payment_completed_at > now()-interval '1 minute'` returned true. This verifies that the supplied provider-related time does not determine the reported completion column. It is a controlled input test, not a claim that a newly created real order could have been paid yesterday.

Google defines this field as transaction completion time. See [ExternalTransaction schema](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions). Keep authoritative event time, receipt time and settlement time distinct.

### F06 — Retry capacity does not support the claimed deadline

```ts
// report-external-transaction/index.ts:55
.order("external_report_attempted_at", { ascending: true, nullsFirst: true }).limit(1);
// :79 — refund phase stops after one successful report
if (await reportExternalRefundEvent(item.refund_id) === "reported") break;
// :88 — consume phase also processes one item
.order("updated_at", { ascending: true }).limit(1);
```

`ucb_cron_setup.sql:25` schedules each phase once a minute. Direct successful settlement can report immediately, so this is specifically an **outage/retry backlog** defect. The scheduled report phase has a theoretical ceiling of 1,440 attempts/day; API latency and failures lower it. There is no exponential backoff/next-attempt policy, and permanent failures continue consuming attempts. The 20-hour alert helps detect some failures but cannot increase throughput.

Google requires reporting within 24 hours of completion: [official UCB flow](https://developer.android.com/google/play/billing/alternative/alternative-billing-with-user-choice-in-app). Capacity must be demonstrated against expected peaks and outage recovery; no such load test was found or run. This is a code-derived capacity bound, not a measured production incident.

### F07 — Test-mode escape hatch is not environment-bound

```ts
// _shared/razorpay.ts:36
if (keyId.startsWith("rzp_test_")) {
  const allowTestMode = Deno.env.get("ALLOW_TEST_MODE") === "true";
  if (!allowTestMode) { throw new Error(...); }
}
```

There is no independent production-project check in this function. An operator can accidentally configure the production service with both test values. The client displays the returned mode, but a label does not isolate production entitlement writes. The new `internal-testing` build guard is useful and tested; it does not protect server secrets or all other EAS profiles. This is an operator-misconfiguration path, **not** an unauthenticated ability to set environment variables. Actual deployed values remain UNVERIFIED.

### F08 — Cron setup's NULL check fails open

```sql
-- ucb_cron_setup.sql:18
select decrypted_secret into v_url from vault.decrypted_secrets where name='ucb_project_url';
select decrypted_secret into v_secret from vault.decrypted_secrets where name='ucb_report_cron_secret';
if v_url !~ '^https://[a-z0-9-]+\.supabase\.co/?$' or length(v_secret)<32 then
  raise exception 'Vault ucb_project_url or ucb_report_cron_secret is missing/invalid';
end if;
```

No matching row gives NULL. With both values missing the expression is NULL, which PL/pgSQL does not treat as true; with one missing and the other valid the same issue exists. Jobs can be registered with missing runtime URL/header data.

**Executed PostgreSQL expression check:** `(null::text !~ '^https://' or length(null::text)<32) is null` returned true. Actual pg_net/Vault scheduling is UNVERIFIED because the local stub deliberately does not implement it. Explicit `IS NULL` checks resolve the demonstrated validation defect.

## Checklist — all audit lenses

PASS means the stated, bounded check was verified by cited code or a local test. It does not certify a deployed environment or real provider operation. FAIL references an observed defect. UNVERIFIED identifies missing runtime or configuration evidence.

### 1. Authentication and authorization

| Check | Status | Evidence / limitation |
|---|---|---|
| User identity from verified JWT | PASS | `_shared/supabaseAdmin.ts:24` calls `auth.getUser(token)`; create-order, create-play-order, verify-play-purchase and attach-external-token use returned `user.id`, not a body UID. |
| Four user payment functions retain gateway JWT verification | PASS | `supabase/config.toml:19–29`; `scripts/ucb-deploy.sh` leaves their gateway verification enabled. Actual deployed flags UNVERIFIED. |
| verify-payment no-JWT decision | PASS | `verify-payment/index.ts:61` requires JWT plus owner for unsigned recovery; signed callback checks HMAC and stored Razorpay order at `:102`. Signature is the authentication capability for that path. |
| Webhook authentication and constant-width comparison | PASS | `razorpay-webhook/index.ts:44–69`: raw-body HMAC, 64-hex validation, full byte loop, optional previous secret; 17-check harness passed. |
| Cron secret and constant-width comparison | PASS | `report-external-transaction/index.ts:9–20`: minimum secret length and full comparison loop before processing. |
| Unauthenticated entitlement/refund/report mutation | PASS | Inspected entry points require JWT/owner, provider HMAC, or cron secret; SQL grants separately verified. Signed callbacks can complete an authentic purchase only for its stored owner. |
| CORS | PASS | `_shared/cors.ts:3` allows `*` without credentialed cookies; endpoint authorization remains required. Browser use of the custom app-version header is UNVERIFIED: it is absent from allowed headers. Android native fetch is the intended flow. |
| Error bodies and logs | UNVERIFIED | Payment handlers return generic error bodies on inspected paths; Google helper avoids provider bodies. Razorpay helpers include upstream error bodies in thrown errors (`razorpay.ts:92`, `:144`) that callers log. No leaked secret was demonstrated; real provider error/log redaction was not exercised. |

### 2. Price and product integrity

| Check | Status | Evidence / limitation |
|---|---|---|
| Client cannot set amount/discount/wallet debit/tax | PASS | `create-order/index.ts:31–35`, `:84` delegates to `create_priced_order`; latest SQL reads product/settings/balance. Client chooses only product, wallet opt-in, and billing state. |
| Server SKU derivation and missing tier error | PASS | `20261012100000_google_play_ucb.sql:136–142`; active price-tier lookup, `price_tier_missing`, server-created order SKU. UCB SQL suite passed. |
| Play receipt matches order SKU/product | PASS | `verify-play-purchase/index.ts:21–35`: stored order product/provider/SKU, API path built from stored SKU, optional returned product/token checked. |
| Razorpay amount/currency/order verification | PASS | `_shared/settle.ts:35–51`: safe integer paise and API payment/order INR/amount equality. SQL rechecks `round(amount*100)`. |
| Monetary rounding | PASS | Stored SQL `numeric(10,2)` and server paise conversion; external micros derived from validated paise. Arbitrary client float amounts are not accepted. |
| First-purchase discount cannot be reused | FAIL | F02; repository test explicitly accepts repeated discount entitlement. |
| Live SKU price, active products, offers, tax policy | UNVERIFIED | Client checks Play price (`playBillingService.ts:303`) but no Play Console/catalogue credentials were used. Do not treat that client check as independent server verification of Console pricing. |

### 3. Play verification

| Check | Status | Evidence / limitation |
|---|---|---|
| Fixed package and server OAuth scope | PASS | `_shared/googlePlay.ts:25` requires `com.medveda.app`; API path and androidpublisher scope are server-side. |
| Correct user AND order binding | PASS | `verify-play-purchase/index.ts:34–35` compares SHA-256 user/order IDs to both obfuscated Google fields; local UCB tests also check RPC ownership. |
| Purchased state, pending, quantity, region | PASS | `verify-play-purchase/index.ts:29–35`: pending returns without grant; requires purchased, quantity 1, IN, and nonzero refundable quantity. |
| Token reuse / replay | PASS | Unique token indexes on orders/payments; `settle_play_purchase` locks and rejects cross-order reuse. Independent-session token race passed with one grant. |
| Consume after grant and retry persistence | PASS | `verify-play-purchase/index.ts:40–59`; SQL sets pending consumption atomically, failure persisted; actual-handler consumption-outage mock passed. |
| Three-day acknowledgement safety in real operation | UNVERIFIED | Server uses consume, a valid completion mechanism for consumables; retry code exists, but production scheduling, backlog and Google acceptance were not exercised. F06 limits retry capacity. |
| Refund reconciliation after consumption | FAIL | F04 starvation. Happy-path reversal is implemented; it does not establish complete coverage. |
| Test purchases separated from production | UNVERIFIED | ProductPurchase handling does not inspect `purchaseType`; license testers and project separation must be controlled operationally. No live Console tester configuration inspected. |

### 4. Idempotency and races

| Check | Status | Evidence / limitation |
|---|---|---|
| Same Razorpay payment cannot grant twice | PASS | Unique provider payment ID and purchase order key; wallet advisory lock plus order `FOR UPDATE`; independent webhook/client SQL race passed. |
| Same Play token cannot grant twice | PASS | Unique token indexes and transaction rollback; concurrent different-user/order fixture resulted in one payment and one grant. |
| Double tap / concurrent checkout | PASS | Client guards plus server serialization; ownership checks prevent a second successful exact-product entitlement. Duplicate paid orders may still require a manual refund. |
| Refund/capture ordering | FAIL | F01. API reads and database settlement are not one atomic provider transaction. |
| Cancelled/stale order discount transition | FAIL | F02. Stale order flags do not prevent underpriced grant. |
| Admin cannot reset paid orders to created | PASS | `20260924110000_critical2_orders_server_only.sql:224–245`: admin RPC only cancels/fails unlinked created orders; direct writes revoked. |
| Exhaustive state-machine interleavings | UNVERIFIED | Capture races are covered; not every combination of refund, dispute, deletion, cancellation, product edit and provider timeout was executed. |

### 5. Google external reporting

| Check | Status | Evidence / limitation |
|---|---|---|
| Token attached to owned choice and bound to matching product/user | PASS | `attach_ucb_external_token` and `bind_ucb_razorpay_order`, `20261012100000_google_play_ucb.sql:151–205`; locks, token uniqueness, owner/product/provider checks. |
| Cancellation during Razorpay creation breaks binding | PASS | Rejected hypothesis: binding intentionally requires the choice status `cancelled`; local create/attach/bind reproduction returned `ok:true`. |
| One external transaction resource per successful order | PASS | Stable `medveda_` + UUID ID, unique index, GET/CREATE/reconcile and response comparison in `_shared/externalReporting.ts:42–99`. Exactly one network request is neither promised nor required. |
| Every real capture eventually reported | FAIL | F03 excludes captured-but-unsettled wallet failures. Missing-token orders are skipped (`externalReporting.ts:45`); rollout configuration must prevent new legacy checkouts where required. |
| Body field names, money, address | PASS | Field-by-field official-doc comparison below; tax/state snapshots validated before Google calls. |
| Correct transaction completion time | FAIL | F05. |
| 24-hour deadline / retry capacity / backoff | FAIL | F06; no measured outage recovery guarantee. |
| Alerting | UNVERIFIED | `ucbAlert.ts` posts to Sentry with timeout; failures and missing DSN only log. No real alert receipt or on-call workflow verified. |
| Missing state/tax/time | PASS | Creation/binding rejects invalid state; reporter marks missing tax/state/time failed before API call. Missing-time mock passed. Correctness of historical repaired timestamps remains F05. |
| Permanent Google rejection | PASS | Mock verifies failed state persists and no false success; remediation and deadline compliance remain UNVERIFIED/F06. |
| Partial/full refund request semantics and retry IDs | PASS | `_shared/googlePlay.ts:144–154`, durable `ucb_external_refunds`, serialized claim per order; mocked two sequential partial refunds passed. |
| End-to-end exactly-once partial refund across crash windows | UNVERIFIED | Claims and balance reconciliation exist; no real ambiguous-response, lease-expiry or concurrent Google refund exercise. Nonzero-GST cumulative rounding not covered by the zero-tax fixtures. |

### 6. Refunds, voids and chargebacks

| Check | Status | Evidence / limitation |
|---|---|---|
| Known full Razorpay refund revokes purchase | PASS | `reverse_payment`, full-refund branch, client success-only purchase filtering; SQL and webhook suites passed. |
| Partial Razorpay refund policy | PASS | `handle_payment_refund` explicitly returns `partial_refund_ignored` for local entitlement/wallet/reward. Partial goodwill refunds retain access; Google reporting is separately queued. This is not a proportional revocation implementation. |
| Dispute open/won/lost | PASS | `_shared/settle.ts:148–194` refetches dispute; SQL suspends/restores/reverses access. Webhook and batch1 suites cover these paths. |
| Refund/dispute arriving before grant | FAIL | F01. |
| Wallet restoration and referral reversal once | PASS | Unique refund credit/reversal keys; pending reward cancelled, available reward clamped to remaining balance. Local suites passed. Unrecoverable spent reward is flagged, not magically recovered. |
| Play refund/void revocation | PASS | `reverse_play_payment` service-only, order lock and refund status update; UCB SQL suite passed. Detection completeness is a separate FAIL, F04. |
| Durable paginated void cursor | PASS | `20261013110000_play_void_cursor.sql`; leased cursor and page checkpoint code; SQL lease contention/release checks passed. |
| Long outage and no RTDN coverage | FAIL | F04; rolling-history API plus fallback does not guarantee recovery when fallback starves. Live page-token expiry and crash resumption are UNVERIFIED. |
| Offline/downloaded access instantly revoked | UNVERIFIED | Server and purchase filters deny revoked access, but no installed device/offline cache exercise was performed. Downloaded content cannot be assumed recalled by a database update. |

### 7. Wallet and referral

| Check | Status | Evidence / limitation |
|---|---|---|
| Atomic wallet debit, balance/cap | PASS | Latest settlement locks user wallet then order, validates full funds, inserts debit transactionally; concurrency test passed without underfunded grant. |
| Reservation/failure/expiry behavior | PASS | Reservation is live only while linked order is created and reservation unexpired; failure/expiry fixture passed. Actual debit occurs at payment, not order creation. |
| Captured payment after reservation released | FAIL | F03: refusal protects balance but strands capture accounting/compensation. |
| First successful purchase reward once | PASS | Unique referral reward key and `first_order_id`; local referral suites and Play settlement implementation. |
| First-purchase friend discount once | FAIL | F02. |
| Hold days and shared-network hold | PASS | `release_due_wallet_credits` and server settings; referral suites passed. Network signals do not prove distinct humans. |
| Self-referral, caps, identity reuse | PASS | `apply_referral_code`, durable hashed purchase identity, verified checks in batch3/batch3b; independent referral-cap race and historical backfill tests also passed. |
| Complete fraud resistance | UNVERIFIED | New unverified phone/email identities and network changes are not proven unique people. Do not equate the tested rules with prevention of all farming. |
| Play: no friend discount/wallet, referral reward retained | PASS | `create_play_order` records list price and settlement rejects nonzero wallet/discount; referral reward section mirrors first-payment checks. Real Play purchase not exercised. |

### 8. Tax snapshot

| Check | Status | Evidence / limitation |
|---|---|---|
| Server-created tax-inclusive snapshot | PASS | `20261012100000_google_play_ucb.sql:46–59`: numeric rate, rounded pretax, tax as exact remainder. |
| Snapshot sum and immutability | PASS | Insert trigger plus immutability trigger; bind/report sum checks; UCB suite passed. Reporter reads snapshot rather than recalculating current GST. |
| State allowlist and required UCB address | PASS | `_shared/ucbStates.ts`, SQL binding allowlist, create-order check; UI selector. No phone/email/IP inference in this path. |
| GST rate, registration and actual tax treatment correct | UNVERIFIED | Repository defaults GST to zero; legal/business applicability was not established. Seller-state configuration and submitted invoices were not inspected. |
| Nonzero-GST partial-refund rounding | UNVERIFIED | Existing Google-refund mocks use zero GST. Need tiny partial, cumulative partial, and final residual tests with nonzero tax. |

### 9. Database security

| Check | Status | Evidence / limitation |
|---|---|---|
| RLS on payment tables | PASS | Queried actual local catalogue after every migration: orders, payments, purchases, payment_sessions, wallet_ledger, wallet_order_reservations, referrals/settings/audit, first_purchase_identities, order_review_flags, play_price_tiers, ucb_external_refunds, play_void_sweep_state all have RLS. Test-created race tables were excluded from product conclusions. |
| No anon/authenticated direct payment writes | PASS | Catalogue privilege queries and SQL suites confirm no INSERT/UPDATE/DELETE on orders/payments/purchases/wallet tables; server-only new UCB tables revoked entirely. |
| Own-row / admin read policies | PASS | Effective `pg_policies` inspected; orders/purchases/payment_sessions restrict owner or admin, payments owner/admin, wallet own/admin. Referral-settings admin update is intentional and protected by `am_i_admin()`. |
| SECURITY DEFINER search_path | PASS | All 74 effective public SECURITY DEFINER functions in the local catalogue had explicit `search_path`. |
| Server-only EXECUTE revocations | PASS | Effective create/settle/reverse/claim/tax RPCs denied to anon/authenticated. User/admin RPCs intentionally executable with internal auth checks; f7/f8/admin-MFA suites passed. |
| Views leak other users | PASS | New `play_void_sweep_metrics` explicitly revoked from clients; broader DB hardening suites passed. Hosted object drift is UNVERIFIED. |
| Migration order from empty schema | PASS | Entire timestamp-sorted chain applied successfully against stub. |
| Every migration safely re-runnable | UNVERIFIED | Historical antifarming migration rerun passed. The entire chain was not reapplied twice; fresh-chain success is not proof of universal idempotence. |
| Cron sweep indexes and production query cost | UNVERIFIED | Unique identity/token keys and refund queue/order indexes exist. Dedicated report/consumption/last-checked queue indexes were not found in targeted migration search; no representative-volume EXPLAIN/load evidence. |

### 10. Secrets and environment

| Check | Status | Evidence / limitation |
|---|---|---|
| Working tree and reachable Git history scanned | PASS | Pattern scan inspected 620 working-tree files and 1,269 reachable historical blobs, including ignored small text files; detected JWTs were decoded privately to identify service-role claims. Excluded dependency/build trees and blobs over 5 MB. |
| Confirmed service-account private key / service-role credential exposure | UNVERIFIED | None confirmed by the bounded scan. PEM marker in Google helper is parsing code, and current key matches were placeholders. Absence from this scan is not an exhaustive secret audit of unreachable objects, binary archives, external CI or remote branches. |
| Historical Razorpay key identifier | PASS | Non-placeholder test key ID found at historical blob `25d60ea95f`, `supabase/SECURITY_NOTICE.md:5`, prefix only `rzp_te`. A key ID is not the API secret; no matching secret was confirmed and rotation/revocation is UNVERIFIED. |
| Ignore coverage | PASS | Root `.gitignore` covers environment files, service-account JSON patterns, private keys, signing files and Supabase temp; mobile adds signing/native/local-env exclusions. Ignore rules cannot erase history. |
| Secret in mobile public config | PASS | Inspected EAS/mobile configuration uses public Supabase URL/anon key, not a confirmed service-role secret. Remote EAS variables and final bundle remain UNVERIFIED. |
| Test mode cannot affect production | FAIL | F07. |
| Log/token confidentiality | UNVERIFIED | No deliberate application log of purchase/service-account tokens found in inspected handlers. Native dependency/provider error payloads and shipped log behavior were not runtime-tested. |
| Internal-testing isolation | PASS | `check-staging-build.cjs` rejects missing/equal production URL/key when target is staging; staging self-tests passed. Real preview env and final AAB are UNVERIFIED. Other EAS preview/development profiles reference the same URL as production, so do not assume they are isolated. |

### 11. Client behavior

| Check | Status | Evidence / limitation |
|---|---|---|
| Android-only purchase guards | PASS | `usePurchase.ts`, `playBillingService.ts`, `OrderSummaryScreen.tsx` and paymentService enforce Android. |
| Official choice API integration in source | PASS | `playBillingService.ts:253–258` registers choice listener and enables user-choice billing; installed expo-iap native source maps this to its billing program. There is no custom Play/Razorpay choice replica in inspected checkout. Actual device sheet UNVERIFIED. |
| Cancel and pending handling | PASS | Choice/purchase listeners and PlayBillingScreen distinguish cancellation, pending and server success; no pending entitlement grant. |
| Already-owned / billing unavailable handling | UNVERIFIED | Generic error/retry and restore code exists; no device execution of these native error codes. |
| App killed/offline/launch recovery | UNVERIFIED | `App.tsx:51–66` restores on login/launch/resume; stored attempt plus server-order hash fallback at `playBillingService.ts:134`. No real process-kill/offline exercise. |
| Server-authoritative unlock | PASS | Play verifies on server before success; Razorpay callback goes through verify-payment; purchases repository filters `status='success'`. A local navigation success flag does not insert entitlement. |
| Restore cannot grant locally | PASS | `getAvailablePurchases()` routes through `handlePurchase` and server verification; paid-order recheck reads server order state. |
| Listener lifecycle | UNVERIFIED | Screen listeners unsubscribe and failed connection setup removes native subscriptions. Successful global native subscriptions live for the process; no explicit successful-connection teardown observed. No native lifecycle/leak test. |
| Old-version gate | PASS | Server `paymentGate` fails closed for missing config and requires version/choice when rollout enabled; eight gate checks passed. Current deployed rollout flag is UNVERIFIED and migration defaults it to false. |
| Debug flags in production artifact | UNVERIFIED | No local payment-unlock debug path observed; screenshot debug profile exists separately. Final signed artifact was not built or inspected. |

### 12. Compliance consistency

| Check | Status | Evidence / limitation |
|---|---|---|
| Provider/refund/state disclosures in source | PASS | PrivacyScreen `:39–48`, `:66–82`; TermsScreen `:59–82` describe both providers, billing state, verification/reporting, and provider-specific refunds. |
| DATA_SAFETY and listing consistency | PASS | UCB delta in `mobile-app/DATA_SAFETY_AUDIT.md` and `docs/PLAY_LISTING_DRAFT.md:23–27` acknowledge Play, Razorpay and manually selected billing state. They explicitly leave Console classification/verification pending. |
| Actual Console enrollment, submitted Data Safety and listing | UNVERIFIED | No Console session, uploaded AAB, listing snapshot, enrolled country/tester evidence, or submitted declarations inspected. |
| No policy-violating steering in actual app | UNVERIFIED | Inspected buy path uses official choice first and Razorpay only after token attachment. Legal/support links exist. Full device navigation and current policy applicability were not certified. |
| Website versus in-app policies | UNVERIFIED | Source policy references and mobile terms/privacy were inspected; served website contents, every generated variant, retention practice and legal adequacy were not end-to-end verified. |

### 13. Tests

| Check | Status | Evidence / limitation |
|---|---|---|
| Mobile TypeScript | PASS | `npx --no-install tsc --noEmit` in mobile-app exited 0. |
| All Edge Function TypeScript | PASS | `find supabase/functions -name '*.ts' -print0 \| xargs -0 deno check` completed, covering all 26 TypeScript files listed by Deno. |
| Local SQL + webhook runner | PASS | `PGHOST=127.0.0.1 PGPORT=55437 PGUSER=postgres KEEP_DB=1 bash supabase/tests/run-all.sh`: ALL SUITES PASSED. |
| Independent concurrency tests | PASS | Wallet, Play token reuse, Razorpay webhook/client race, and extra referral cap race executed. |
| Real provider acceptance/device mobile tests | UNVERIFIED | Standalone self-tests are not Android instrumentation, Play licensed-tester or Razorpay sandbox end-to-end tests. |
| Negative-case coverage establishes all invariants | FAIL | F02 test accepts discount reuse; F01/F03/F04 escaped green suite. Missing tests listed below. |

## Official Google API comparison

Fetched official references during this audit; no Google request-field names were assumed from memory. Failed initial URLs for external refund/create were replaced with the actual official `refundexternaltransaction` and `createexternaltransaction` references.

| Code request/response field | Comparison | Result |
|---|---|---|
| POST `/applications/{package}/externalTransactions`, query `externalTransactionId` | Correct endpoint/query. Generated `medveda_` + 32 hex characters is 40 allowed characters, non-PII and stable. | PASS |
| `originalPreTaxAmount`, `originalTaxAmount` | Both supplied as `{currency:'INR', priceMicros:string}` from immutable numeric snapshots. | PASS |
| `userTaxAddress.regionCode`, `administrativeArea` | `IN` plus documented Indian administrative-area strings, validated in SQL and TypeScript. | PASS |
| `oneTimeTransaction.externalTransactionToken` | Correct input field. Reconciliation only compares returned token if present; input-only token absence is not wrongly rejected. | PASS |
| `transactionTime` | RFC3339 serialization correct; provenance of Razorpay completion time incorrect, F05. | FAIL |
| Output-only package/id/state/current amounts | Not populated in create body; used to check response identity/state/amount. | PASS |
| Full refund `refundTime`, `fullRefund:{}` | Correct request structure. | PASS |
| Partial refund `partialRefund.refundId`, `refundPreTaxAmount` | Correct field names and stable refund ID, micros amount. Multiple-refund rounding/crash behavior needs more testing. | PASS for schema; UNVERIFIED for exhaustive behavior |
| Product GET package/SKU/token path | Encoded server package and stored SKU; purchase token from user is verified by Google. | PASS |
| `purchaseState`, `consumptionState`, quantity, region, account/profile IDs | Names and meanings match ProductPurchase. Optional returned token/product fields are conditionally checked. | PASS |
| Product consume POST with no body | Implemented after settlement; consumption fulfills the consumable processing requirement. | PASS for source; live acceptance UNVERIFIED |
| Voided purchases start/end milliseconds, `type=0`, `pageSelection.maxResults`, `pageSelection.token` | Names match current reference; pagination response `tokenPagination.nextPageToken` consumed. | PASS |
| Quantity-based partial voids | Multi-quantity purchases are rejected by verifier; endpoint does not request partial-quantity inclusion. Expanding quantity support requires revisiting this. | PASS for quantity-one scope |
| RTDN | Official notification types inspected; no corresponding receiver implemented. | UNVERIFIED as a live integration; polling gaps FAIL F04 |

Sources: [external transaction resource](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions), [create external transaction](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/createexternaltransaction?hl=en), [refund external transaction](https://developers.google.com/android-publisher/api-ref/rest/v3/externaltransactions/refundexternaltransaction?hl=en), [ProductPurchase](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products), [voided purchases list](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.voidedpurchases/list), [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference), [official UCB client flow](https://developer.android.com/google/play/billing/alternative/alternative-billing-with-user-choice-in-app), [purchase processing and acknowledgement](https://developer.android.com/google/play/billing/integrate).

## Tests I ran + results

- Mobile `npx --no-install tsc --noEmit`: exit 0. A user-scope bus warning appeared; no TypeScript diagnostics.
- Deno 2.9.7 check on all 26 function/shared/declaration `.ts` files: completed successfully.
- All five mobile script self-tests: checkout HTML/navigation, password policy, purchase status filtering, staging isolation, HMAC signature sample: exit 0. The HMAC sample tests its own formula, not the deployed function; stronger webhook tests are listed separately.
- Five Node server self-tests: timestamp presence, coverage-file existence, Google reporting, Play consumption failure, recovery auth/limiter: exit 0. `f10-coverage-selftest.cjs` only checks that files exist and is not behavioral coverage evidence.
- Deno payment-gate self-test: eight PASS checks.
- Complete `run-all.sh` suite: 13 summarized SQL suites, **609 assertions, zero failures**: f7 25, f8 17, batch1 74, batch3 30, batch3b 31, phase2 123, referral limits 65, referral-off 19, phone/notes 21, medium DB 34, low grants 19, admin MFA 23, UCB 28. Four additional suites passed: account deletion, critical fixes, app config, null-year fallback.
- Runner also executed wallet concurrency/release, Play token race, Razorpay settlement race, the standalone server tests, and **17 webhook harness checks**. Final output: `ALL SUITES PASSED`.
- Additional referral-cap race: one success, one `referrer_limit_reached`, exactly one referral; PASS.
- Historical antifarming backfill: built a pre-migration local database and ran six checks, including rerun; zero failures. These two older shell scripts hardcode port 54329; only their `/tmp` copies were adapted to audit port 55437 and the repository path. Source scripts were unchanged.
- Additional adversarial SQL, rolled back: confirmed F01 and F05; successful UCB bind disproved cancellation/binding suspicion. Post-concurrency read-only inspection confirmed F03 persistence gap.
- Actual reconciliation handler with mocked providers: two sweeps, 20 calls, ten unique failed tokens, eleventh token unchecked; confirms F04.
- PostgreSQL NULL-condition evaluation: confirms F08 validation behavior.
- `bash -n scripts/ucb-deploy.sh` and `node --check scripts/ucb-smoke-test.mjs`: syntax checks passed. Did **not** execute deployment or the remote smoke probes.
- `node supabase/seed/apply-play-price-tiers.mjs` without `--apply`: dry-run validated one inactive `notes_1` tier, no DB mutation. This does not prove usable live catalogue coverage.
- Secret scan: 620 files / 1,269 reachable historical blobs, bounded as stated above; no full secret values printed.

The sandbox initially prevented local socket access. The local PostgreSQL start was approved; the first automatic review for running the suite timed out, and its permitted retry succeeded. This was an execution-permission timeout, not evidence that the local test was unsafe. Docker socket access was unavailable, but installed PostgreSQL allowed the requested SQL checks to run. No outstanding approval is needed for the delivered report.

### Missing or inadequate tests

1. Refund/dispute before capture linkage, including an authoritative capture GET that races a reversal webhook; reversal must remain terminal.
2. Multiple stale discounted checkouts: assert at most one discounted entitlement, not the current expected undercharge.
3. Captured wallet-shortfall durable accounting, Google report, compensation retry and eventual provider refund.
4. Ten failing Play tokens followed by a refunded token, plus long outage, page expiry and worker lease-expiry/crash recovery.
5. Report/consume backlog after provider outage; demonstrate required deadlines at expected peak volume and under permanent errors.
6. Nonzero GST, many tiny partial refunds, ambiguous Google refund responses, duplicate refund IDs and final full residual refund.
7. Exact native cancel/pending/already-owned/unavailable paths, account switching, offline retry, process death, recovered purchase, listener lifecycle and consumption confirmation.
8. Real local HTTP tests for each Play endpoint's wrong user, wrong SKU, missing state, token mismatch and provider errors; SQL ownership tests and one mocked verification fixture do not cover every HTTP branch.
9. Production test-mode rejection and missing/duplicate Vault values.
10. Actual installed build, hosted JWT flags, pg_net/Vault scheduling and alert receipt. These require isolated staging evidence, not production probing during this audit.

## Claims I could not verify and why

- **Deployed configuration:** no remote DB or provider consoles accessed. Live migrations/RLS, function flags, service-role privileges, cron jobs, Vault values, webhook subscriptions, Sentry delivery and `require_ucb_for_razorpay` remain UNVERIFIED.
- **Provider end-to-end correctness:** official schemas were compared, but no real purchase, consume, external report, refund, chargeback or Google ambiguous-response reconciliation was performed.
- **Device and final build:** no AAB built, installed or inspected; no licensed tester, process-kill/offline/UPI round trip, native sheet, restore, OTA-channel or bundled-secret check.
- **Business and compliance:** actual GST treatment, Play enrollment, India availability, SKU/offer price inventory, licence testers, submitted Data Safety/listing, legal accuracy and retention practice remain UNVERIFIED.
- **Exhaustive source assurance:** all migrations were executed in order, effective public SECURITY DEFINER privileges and payment RLS were queried, and core payment implementations/tests were inspected. This is not a claim of a line-by-line proof of every historical superseded function, every script/document variant or all dependency code. Website deployment, exhaustive policy consistency, whole-chain rerun and representative-volume query plans remain UNVERIFIED.
- **Secrets:** no confirmed private credential surfaced in the bounded scan. Unreachable Git objects, excluded large/binary files, external CI logs/secrets, deployed logs, remote refs and actual key revocation remain UNVERIFIED. Historical key-ID disclosure is not mislabeled as API-secret disclosure.

## Top 5 things to fix first

1. **F01:** make refund/dispute ingestion durable before capture linkage; test both event orders and true interleaving.
2. **F02:** enforce one friend discount in settlement and replace the test that accepts repeated discounted grants.
3. **F03:** persist every real capture even when entitlement fails; add durable refund/compensation and UCB reporting for it.
4. **F04:** prevent failed-token starvation, then test long-outage and refund detection coverage.
5. **F05 + F06:** report authoritative completion time and size the retry system to meet the 24-hour deadline under backlog.

Before deployment, also close F07/F08, add the missing negative tests, rerun the complete local suite, and produce isolated Play internal-testing evidence for the official choice dialog, both payment methods, recovery, consumption, reporting and refunds. Keep staging and production credentials/data separate. A green unit/SQL run alone is insufficient to change either verdict to GO.
