# MedVeda Play catalog synchronization: setup and release handoff

**Prepared 2026-10-16. Review only.** No hosted migration, service secret, function, cron, Console product, production setting, or payment was changed by this work. Existing `products.price` and `products.active` values are not updated by the migration. The hosted `play_price_sync` and `play_price_tiers` tables are reported empty; the Play Console catalog has not been verified here.

**17 October business-rule update:** All educational videos are free. The Play catalog sells chapter, subject, year and bundle access to paid notes/PDFs only. Existing first-note previews stay free. Do not put video playback behind Play Billing or the older purchase-checking `get-video-url` function. Admin Panel prices and the website Razorpay integration remain unchanged. Local offer selection and catalog read-back now refuse ambiguous multiple offers/options because the installed `expo-iap` one-time offer type does not expose a purchase option ID; receipt verification still checks the order's exact option. These local changes are not deployed or verified on a Play-installed device.

**17 October local fix:** the pending catalog migration now queues only explicit `notes` and `notes_bundle` products with an active paid PDF in the selected scope. The order RPC applies the same gate. Active legacy `other` rows no longer abort the migration and never enter Play checkout, even if they have adjacent PDFs. Their IDs, prices, active flags and existing purchases remain unchanged. Inventory and classify them later using [the read-only inventory](PLAY_NOTES_CLASSIFICATION_INVENTORY.sql); keep [the historical paid-video batch](../supabase/held/batch2-videos/README.md) held.

## What the code does

- An insert or price/active/classification update to an eligible Admin notes product queues its exact positive INR selling price. Publishing a paid PDF under an already classified product also queues it. Products sharing the same price share one consumable Play SKU. Prices use up to two decimal places, matching `products.price numeric(10,2)`; zero stays in the Admin catalog but cannot enter Play checkout. Google can reject values outside its current country or catalog limits, and the Admin row stays unchanged with a visible sync error.
- `sync-play-catalog` is a server-only cron endpoint. It claims one leased price job, reads an existing SKU, or creates a versioned One-time Product through `monetization.onetimeproducts.patch` with `allowMissing=true`. It creates a BUY option for India, calls `purchaseOptions:batchUpdateStates` to activate it, then reads the product again. Only an ACTIVE BUY option that is AVAILABLE in India at the exact INR amount becomes a verified tier. Google documents these endpoints and fields in the [OneTimeProduct resource](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts), [patch method](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts/patch), and [purchase-option state method](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.onetimeproducts.purchaseOptions/batchUpdateStates).
- A changed or colliding previously used SKU is never repriced. A fresh versioned SKU is reserved; old tier rows and all order/payment/purchase snapshots remain. Lease IDs, unique candidates, bounded retries, and append-only sync logs protect against duplicate workers. The worker checks ready tiers again every 24 hours; stale or unsynchronized tiers cannot create new Play orders. Checkout readiness does not change `products.active` or the Razorpay path.
- The Admin Products table shows status, SKU, option, synced price/currency, last check, error and retry. The mobile Play screen displays `formattedPrice` from Play ProductDetails and compares the selected full-price offer with the server order amount. The client accepts exactly one standard offer; the worker marks a tier ready only when Play read-back contains exactly one matching BUY option. The Edge Function verifies new tokens with ProductPurchaseV2, including SKU, BUY option, quantity, refundable state, region, user/order hashes and completion time, before the existing atomic settlement and server consume. Google exposes purchase option identity in [ProductPurchaseV2](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2). Old orders retain their v1 purchase verification route.

## Required setup, in order

1. **Confirm target project and protect existing records.** Identify the Supabase project used by the installed AAB, its applied migration versions, live `products` prices, `product_type`, scope and active flags, `play_price_tiers`, pending Play orders, paid but unconsumed orders, and recovery jobs. Compare a read-only snapshot before and after any later deployment. The migration does not alter product price/active fields or delete orders, tokens, purchases, or tiers.
2. **Review migration history.** Review [`20261016100000_play_catalog_sync.sql`](../supabase/migrations/20261016100000_play_catalog_sync.sql) and the new SQL suite. The existing `20261014100000_payment_audit_capture_inbox.sql` and `20261014110000_payment_job_leases.sql` were previously flagged as unsafe to deploy without separate review. Do not run a blanket `supabase db push` from this tree. Build a curated migration plan for the confirmed project, preview it, and require an exact version list before applying after approval.
3. **Google Cloud.** In the intended Cloud project, enable **Google Play Developer API / Android Publisher API**. Create a dedicated service account and a JSON key held only as a Supabase Edge Function secret. Google says Cloud project linking to Play Console is no longer required, but service account invitation and Play permissions are required. See [Google's API setup](https://developers.google.com/android-publisher/getting_started).
4. **Google Play Console.** In **Users and permissions**, invite that service account and scope it to `in.medveda.app`. Grant **View app information (read-only)**, **Manage store presence** (catalog/price edit), **View financial data, orders, and cancellation survey responses** (purchases API), and **Manage orders and subscriptions** (consume/refund operations). Do not grant app release or account-wide admin permissions unless separately needed. The [Play Console permission guide](https://support.google.com/googleplay/android-developer/answer/9844686?hl=en) describes catalog rights; [Google's API setup](https://developers.google.com/android-publisher/getting_started) specifies purchase permissions. Confirm the app can sell one-time products in India and has a payments profile. Record any existing product IDs/options before enabling the worker.
5. **Supabase secrets and functions.** In the confirmed project, verify `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME=in.medveda.app`, and distinct 32+ character `PLAY_CATALOG_CRON_SECRET` and `PLAY_PAYMENT_CRON_SECRET` under Edge Function Secrets. Keep Razorpay secrets intact. Deploy `sync-play-catalog`, the updated `create-play-order` and `verify-play-purchase`, and `play-payment-worker`. The two worker functions must have `verify_jwt=false` in `config.toml` because each authenticates its own cron secret; purchase endpoints retain JWT verification. [Supabase secret setup](https://supabase.com/docs/guides/functions/secrets).
6. **Schedule only after review.** In project `xbvenkfmesugrbjuufyw`, confirm exactly one `play_catalog_cron_secret` and `play_payment_cron_secret` in Vault, each matching its Edge secret. The reviewed SQL pins both POST URLs to this project and reads authentication values from Vault at execution time. It schedules `play-catalog-sync`, `play-consume`, `play-reconcile`, and `play-voids` once per minute by stable name; repeating it updates these jobs. `play_project_url` is no longer needed for these jobs. After approval, use the exact command below from the repository root with `DATABASE_URL` set privately to this project's direct or session-pooler Postgres connection. Do not activate UCB or change Razorpay configuration.
7. **Read-back and testing.** Wait for each distinct live positive Admin paid-note price to reach `ready` in the Admin view; confirm SKU, sole `buy` option, India AVAILABLE, ACTIVE, exact INR amount and timestamp in Console. A tier remains pending/failed on Google API permission, pricing, currency, regional, option or catalog-limit errors. Use a Play-installed internal AAB and an India license tester. Test success, decline, cancel, pending completion, process death/restore, duplicate token, price edit to a new value, shared-price reuse, consume retry, refund/void reversal, unexpected extra offer refusal, paid-note access limited to the purchased scope, and free-video playback without purchase. Also verify the hosted `notes` bucket is private and `get-note-url` denies an unentitled user. License tester methods avoid real charges, and Google recommends these scenarios in its [billing test guide](https://developer.android.com/google/play/billing/test). Do not claim production readiness until these tests pass.

## Operational checks

The observed empty `play_price_sync` and `play_price_tiers` tables have a direct code-path explanation: tiers are written only after a queued price passes Google read-back, and the catalog worker has nothing to claim while the queue is empty. The catalog migration backfills only active, positive-price `notes`/`notes_bundle` products with an active paid PDF in the selected scope. Existing legacy `other` products are excluded. The empty queue is consistent with zero eligible products at migration/backfill time; it does not prove that classification is the sole cause. Run this read-only diagnostic in the confirmed project before scheduling:

```sql
select version from supabase_migrations.schema_migrations
where version='20261016100000';
select count(*) as products,
  count(*) filter (where active and price>0) as active_positive_price,
  count(*) filter (where active and price>0 and product_type in ('notes','notes_bundle'))
    as classified_paid_notes,
  count(*) filter (where public.play_notes_product_eligible(p)) as eligible_paid_notes
from public.products p;
select billing_status,count(*) from public.admin_play_billing_status group by billing_status;
```

If the migration is absent, the helper and queue triggers are absent too. If the migration is present but `eligible_paid_notes` is zero, review the [classification inventory](PLAY_NOTES_CLASSIFICATION_INVENTORY.sql) and the PDF/scope eligibility conditions without editing prices or product mappings. If eligible products exist while the queue is empty, investigate migration backfill and trigger state before scheduling; an empty queue cannot be repaired by Cron alone. No catalog table contents should be changed during this diagnosis.

After review, the exact scheduling command is:

```bash
psql "$DATABASE_URL" -X --single-transaction -v ON_ERROR_STOP=1 -f supabase/play_catalog_cron_setup.sql -f supabase/play_payment_cron_setup.sql
```

```sql
-- Read-only in the confirmed hosted project after migration.
select billing_status, count(*) from public.admin_play_billing_status group by billing_status;
select price_inr,status,attempts,last_synced_at,last_error from public.play_price_sync order by price_inr;
select price_inr,play_sku,event,created_at from public.play_price_sync_logs order by id desc limit 30;
select price_inr,play_sku,purchase_option_id,active,verified_at from public.play_price_tiers order by price_inr,created_at;
select jobname,active from cron.job where jobname in ('play-catalog-sync','play-consume','play-reconcile','play-voids');
```

`play_price_sync_logs` is service-role-only by default; review it in the Dashboard SQL Editor with an authorized operator. Never copy service account JSON, purchase tokens, JWTs or cron headers into tickets. The old manual tier seed script is retired; it cannot verify a Console BUY option.

## Local validation performed

On 17 October, a disposable PostgreSQL 18 database under `/tmp` applied the curated migration chain with active pre-existing `other` fixtures, then ran the catalog, Play payment and entitlement SQL suites successfully. The legacy rows retained their price, active flag and classification and created no Play jobs. Four Deno catalog tests, Edge Function checks, Admin production build, mobile TypeScript check, Play worker mocks, Razorpay mocks and the cron configuration selftest passed locally. These checks did not call Google or hosted Supabase; see [the final completion report](../MEDVEDA_BILLING_FINAL_COMPLETION.md) for the full test ledger.

On 18 October, `node supabase/tests/play-cron-config-selftest.cjs` passed against a disposable PostgreSQL 18 instance. It verified four stable jobs across two installations, correct POST payloads and Vault headers through a local `pg_net` stub, no embedded credential values in job commands, and rejection of short or duplicate Vault entries. `deno check` passed for both worker functions, and the Play payment worker selftest passed. No hosted Cron job was activated.

## Release blockers

- Confirm the intended hosted project, current migration state, Console catalog, tester and the reported failed attempt's status. An existing paid but unentitled purchase must be reconciled through the existing incident procedure before catalog rollout.
- Review existing `product_type='other'` rows individually before making any of them billable. Leave testing and ambiguous rows unchanged; no mass classification or price edit is needed to apply the catalog migration.
- Approve and apply the curated migration; resolve the two previously flagged migration files; configure the Cloud API, service account permissions and server secrets; deploy/schedule the sync and payment workers; verify every tier by Google read-back.
- Build and upload a new Android AAB because the purchase screen and Play price/offer behavior changed. Check its package, versionCode, Billing permission, resolved Billing library and Supabase endpoint against the Play-installed artifact.
- Complete licensed, end-to-end Play success, pending, failed, recovery, duplicate, refund/void, and entitlement-isolation tests. Local SQL and mock tests do not prove Play propagation, API permission, live settlement, or installed-build behavior.
