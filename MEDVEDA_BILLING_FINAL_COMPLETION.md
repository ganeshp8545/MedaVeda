# MedVeda billing local completion and release handoff

**Prepared:** 2026-10-17 UTC  
**Decision:** LOCAL IMPLEMENTATION READY FOR OWNER REVIEW; HOSTED DEPLOYMENT AND PRODUCTION RELEASE **NO-GO**. No hosted database, Google Play Console, Cloud account, EAS build, payment, or Git remote was changed in this work. Owner-reported hosted state remains unverified.

## COMPLETED LOCALLY

### Changes made in this completion pass

| File | Change |
| --- | --- |
| `supabase/migrations/20261016100000_play_catalog_sync.sql` | Removed the migration-wide exception for active legacy `other` products. Retained explicit notes-only queue and order gates, required a nonblank PDF path in the selected scope, added `pdf_url` to the notes queue trigger, and added an `order_id` index for Play payment jobs. This pending migration does not update product prices, active flags, purchases, orders or payment rows. |
| `supabase/tests/play_catalog_sync_checks.sql` | Added testing-product and blank-PDF checkout/queue exclusions. |
| `supabase/tests/play_catalog_migration_legacy_selftest.sh` | Added a disposable PostgreSQL test that seeds active `other` rows before the catalog migration and checks their preservation, queue exclusion and payment-job index. |
| `supabase/tests/ucb-cron-config-selftest.cjs` | Uses `PGHOST`, `PGPORT` and `PGUSER` instead of forcing TCP port 55437. |
| `supabase/functions/.env.example` | Documented the existing `PLAY_PAYMENT_CRON_SECRET` requirement. |
| `docs/PLAY_CATALOG_SYNC_SETUP.md` | Updated the owner handoff for the notes-only gate, legacy classification and both Play cron secrets. |
| `MEDVEDA_BILLING_FINAL_COMPLETION.md` | This release handoff. |

The existing local billing implementation was reviewed and retained: `create-play-order` checks classification before calling the database RPC; the RPC requires a current verified INR tier and snapshots the SKU, amount, BUY option and entitlement; the client refuses multiple/discount/rental/preorder offers and mismatched INR micros; ProductPurchaseV2 checks the SKU, option, quantity, region, hashes, completion time and refundability before atomic settlement; Play token uniqueness, consume retry, pending recovery, void/refund reversal and old-order V1 compatibility remain in place. No Razorpay behavior was edited in this pass.

### Classification and Admin behavior

- Only explicit `notes` products with chapter, subject or year scope, and explicit `notes_bundle` products with a valid bundle scope, can enter new Play checkout. The selected scope must contain an active, non-preview notes row with a nonblank `pdf_url`; a bundle requires such a row in each selected year. A physical Storage object and readable PDF still require a live check.
- `other` and `video` rows, testing products, and products without eligible paid PDFs are not queued or billable. An active `other` row does not stop the catalog migration. Existing prices, active flags, IDs and successful purchases are preserved. An already created Play order can still settle against its immutable snapshot after later classification changes.
- Admin Products already exposes classification, editable Admin price, billing status, SKU, BUY option, verified INR price, last sync, error and retry. The status is calculated per product. Classifying a valid notes product later queues its current Admin price; publishing its first valid paid PDF also queues it. No Admin user needs to create each price tier manually once the worker and permissions are live.
- The [read-only inventory](docs/PLAY_NOTES_CLASSIFICATION_INVENTORY.sql) is the owner review tool. For each legacy row, compare title, scope, target, paid PDF count, purchase history and actual intended sale. Change only a reviewed product's `product_type` through the Admin form: `notes` for chapter/subject/year, `notes_bundle` for bundle. Leave testing, ambiguous and nonbillable rows as `other`; use `video` only for a genuinely video-classified catalog row, which remains outside Play checkout. Do not mass-update classification or alter price/active fields as a shortcut.

### Catalog and payment readiness

The existing catalog worker checks for a matching Play One-time Product, creates a new versioned SKU if needed, creates the India INR BUY option, activates it, reads it back, and marks the tier ready only for a sole ACTIVE, AVAILABLE option at the exact amount. It does not reprice an old SKU; old tiers and pending order snapshots remain. Leased jobs, retry/backoff, logging and Admin retry handle duplicate work and API failures. A tier must be reverified within 24 hours for new checkout. The client SDK does not expose the purchase option ID, so sole-offer and sole-option checks are the current fail-closed safeguard. Licensed device behavior remains unverified.

The new `play_payment_jobs(order_id)` index is justified by order-id-only diagnostics and by its foreign key to `orders(id)`; the existing `(kind, order_id)` primary key cannot efficiently serve an `order_id`-only lookup or parent-row foreign-key check. The migration adds it without changing payment data.

### Test ledger

| Test | Final result | Limit |
| --- | --- | --- |
| Disposable PostgreSQL 18 curated migration with pre-existing active `other` rows, catalog SQL, Play payment SQL and entitlement snapshot SQL | PASS | Supabase stub and synthetic rows; no hosted schema proof. |
| Full `supabase/tests/run-all.sh` as local `postgres` role | PASS; all suites passed, including 0 FAIL/28 PASS UCB, 0 FAIL/17 PASS F8, and 23 webhook checks | Uses synthetic local database. The two separately flagged `20261014` migrations also apply in this disposable run; this does not approve them for hosted deployment. |
| Deno catalog unit/API/offer tests | PASS; 4 Deno tests and offer selftest output | Google API is mocked; `play-offer-selftest.ts` runs via import side effect and reports 0 Deno-registered tests. |
| `deno check` for create/verify/sync/payment/get-note functions | PASS | Type/static check only. |
| Admin production `npm run build` | PASS | No deployed browser test. |
| Mobile `npx tsc --noEmit` | PASS | No signed AAB or Play-installed test. |
| Play consume/worker/fairness/restore/provider mocks | PASS | Synthetic Google responses and orders. |
| Razorpay environment and refund mocks | PASS | No website payment or hosted regression transaction. |
| Cron configuration selftest using local PostgreSQL socket | PASS; all invalid Vault cases rejected and valid case accepted | Scratch database only; no hosted cron scheduled. |

**Failed attempts during test setup:** The first legacy fixture used a year-scope testing product without `year_id` and failed the existing products constraint; the fixture was corrected, then the final migration suite passed. The first full regression run used the scratch cluster owner rather than Supabase's expected `postgres` role and reported F8's new-table default-grant check as 1 FAIL/16 PASS; rerunning as `postgres` passed 0 FAIL/17 PASS and the entire suite. Local PostgreSQL initially could not bind a socket inside the sandbox; the temporary local socket was started with the approved sandbox escalation. These failures are not hidden as passed runs.

**Unavailable/skipped:** Supabase CLI and EAS CLI were not installed here; no hosted migration list, `db push --dry-run`, Edge deployment, AAB build, signed artifact inspection, Play API read-back, licensed purchase, real consume, pending completion, refund, void, or cross-device restore was run. No live access claim follows from the local tests.

## REQUIRES OWNER ACTION

### Curated migration and deployment order

1. Confirm the intended Supabase project and the installed app's endpoint. Read migration history with `supabase migration list --linked` and the hosted `supabase_migrations.schema_migrations` table. Compare PostgreSQL version, exact definitions, PK/indexes, RLS/grants, existing tiers, pending/paid Play orders and recovery jobs. The owner has reported versions through `20261015120000` applied; this has not been independently checked.
2. Confirm prerequisite `20261015100000_play_payment_jobs.sql` and `20261015120000_play_entitlement_order_snapshot.sql` are actually present. If the hosted migration history differs, stop and prepare a separately reviewed dependency list. Do not use `supabase db push` from the full repository: `20261014100000_payment_audit_capture_inbox.sql` and `20261014110000_payment_job_leases.sql` were previously flagged for separate hosted review.
3. Prepare an isolated Supabase release directory with the same `config.toml` and only reviewed migrations needed by the confirmed project. If all prerequisites are applied, the **exact new SQL order** is `20261016090000_free_video_access.sql`, then `20261016100000_play_catalog_sync.sql`. Compare file hashes to this checkout. From that isolated directory, run `supabase migration list --linked`, then `supabase db push --dry-run`; require the preview to list exactly those two versions. Apply `supabase db push` only after explicit owner approval and a database backup. Do not use `migration repair` to mark an unapplied file as applied. [Supabase migration CLI](https://supabase.com/docs/reference/cli/supabase-migration-list), [deployment workflow](https://supabase.com/docs/guides/local-development/cli-workflows).
4. Check post-migration product price/active snapshots, counts of orders/payments/purchases, and RLS/grants against preflight. A failed migration transaction should roll back its DDL; after any successful live transaction, use a reviewed **forward** correction. Do not drop tier/option columns or old SKUs while installed clients or outstanding orders depend on them. To pause new catalog work, stop the catalog cron and diagnose; preserve settlement and recovery workers for existing orders.
5. Verify Supabase Edge secret **names** and values privately: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`, `PLAY_CATALOG_CRON_SECRET`, `PLAY_PAYMENT_CRON_SECRET`, and Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The package value must match `in.medveda.app`; each cron secret must be distinct and at least 32 characters. Preserve existing Razorpay secrets. No credential belongs in the app or this report.
6. After migration approval, deploy `create-play-order`, `verify-play-purchase`, `sync-play-catalog`, and `play-payment-worker` with `supabase functions deploy <function-name> --project-ref <confirmed-ref>`. Verify the deployed source/version and `config.toml` JWT modes: purchase functions `true`, two cron workers `false` with their own header secrets. Confirm `get-note-url` is deployed and the notes bucket is private. [Supabase Edge deployment](https://supabase.com/docs/guides/functions/deploy).
7. In Supabase Vault, verify or create exactly one `play_project_url`, one `play_catalog_cron_secret` matching `PLAY_CATALOG_CRON_SECRET`, and one `play_payment_cron_secret` matching `PLAY_PAYMENT_CRON_SECRET`. Confirm `pg_cron`, `pg_net`, Vault and the four jobs. Only after worker deployment and owner approval, run the reviewed `supabase/play_catalog_cron_setup.sql` for `play-catalog-sync` and, if absent, `supabase/play_payment_cron_setup.sql` for `play-consume`, `play-reconcile`, `play-voids`. Each is scheduled once per minute. Review existing jobs before running either script to avoid duplicates.
8. In Google Play Console and Cloud, verify Android Publisher API access for the configured service account, app-scoped catalog management and purchase/order permissions, the `in.medveda.app` app, India availability, payment profile and quota. Use a read-only product/API check first. After approved sync starts, compare each Admin paid-note price with the sole BUY option, ACTIVE state, India AVAILABLE, exact INR price and read-back timestamp. Inspect failed sync reasons before retry; do not change an old SKU's price.

### New Android AAB and internal testing

The mobile offer-selection and display changes already present in this checkout require a new Play-installed AAB. The source declares app version `1.2.0`, package `in.medveda.app`, and EAS `internal-testing` as `app-bundle` with remote auto-increment; the actual next `versionCode` is **unknown** until a build is made. Before building, confirm that the profile's EAS environment resolves to the intended hosted Supabase endpoint and that Play is the payment provider. From `mobile-app/`, after approval, run `eas build --platform android --profile internal-testing`. Download the produced AAB, then use a locally installed `bundletool` to inspect it:

```sh
bundletool dump manifest --bundle=/path/to/new-medveda.aab
bundletool dump manifest --bundle=/path/to/new-medveda.aab --xpath=/manifest/@package
bundletool dump manifest --bundle=/path/to/new-medveda.aab --xpath=/manifest/@android:versionCode
jarsigner -verify -verbose -certs /path/to/new-medveda.aab
```

Require package `in.medveda.app`, a versionCode above the currently uploaded one, Billing permission in the merged manifest, matching signing certificate, intended endpoint/profile and release commit. Inspect build dependency output for the resolved Billing Library; the manifest alone does not prove its version. Upload that exact AAB in Play Console **Testing > Internal testing**, review release details and publish only to approved testers. AABs must be installed through Play for this licensed billing test. [Expo AAB guidance](https://docs.expo.dev/build-reference/apk/), [Expo internal testing upload](https://docs.expo.dev/tutorial/eas/android-production-build/), [bundletool dump command](https://github.com/google/bundletool/blob/master/src/main/java/com/android/tools/build/bundletool/commands/DumpCommand.java).

## REQUIRES LIVE TESTING

Use an India license tester on the Play-installed internal build. Test one paid chapter, subject, year and bundle purchase at the Admin-defined price; verify the exact SKU/BUY option in the receipt, one payment and one entitlement, PDF access inside the bought scope and denial outside it. Verify free videos play without payment. Test cancellation, pending completion, process death/restore, duplicate callback/token, price change to a new tier, shared-tier reuse, Google API/permission failure, wrong or extra offer refusal, consume retry, refund/void reversal and old purchase access. Check both the paid-note signed URL gate and direct Storage URL denial for an unentitled user. Confirm website Razorpay checkout still works in its own approved test environment. Record redacted order statuses and timing, never tokens or credentials.

## BLOCKED

- The owner-reported hosted migration/function/secret/catalog state and ten active legacy `other` rows have no direct live verification here. The local migration no longer requires classifying all ten before deployment; individual owner classification remains pending.
- No Google Play ProductDetails response, Play API create/activation/read-back, licensed successful purchase, payment recovery, real refund/void, or AAB identity has been verified. The owner's reported confirmation error remains uncorrelated with an order. Resolve any paid-but-unentitled order as an incident before a wider test.
- The installed `expo-iap` offer shape still lacks a purchase option ID. Local sole-offer/sole-option checks and V2 server validation reduce ambiguity, but a Console edit between read-back and purchase and actual Play offer behavior require licensed verification. If multiple legitimate offers appear, checkout must stay closed until option identity is exposed reliably.
- The normal repository migration directory still contains the two separately flagged `20261014` files. A full local synthetic pass does not clear their hosted deployment risk. Use the curated release directory and reviewed history.

**Exact next owner action:** approve a read-only hosted migration/catalog/order inventory against the intended project and review the curated two-migration release package. After that evidence matches, separately approve the hosted migration, function/cron deployment, catalog creation and internal AAB upload. No live change was made here.

**GO / NO-GO:** GO for review of the completed local package; **NO-GO for live billing rollout or production** until the hosted checks and licensed end-to-end payment, access, recovery and refund tests pass.
