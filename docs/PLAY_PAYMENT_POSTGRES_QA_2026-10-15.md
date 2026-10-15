# Play payment PostgreSQL QA — 2026-10-15 UTC

**Decision: NO-GO for production.** The isolated SQL and mocked worker tests below passed. A hosted Supabase staging project, deployed Edge Function, licensed Play test purchase, real Google sandbox refund/void, and end-to-end timing have not been verified. No production connection, deployment, cron activation, or live credential was used.

## 1. Migration dependency validation

`20261015100000_play_payment_jobs.sql` applied successfully to a fresh PostgreSQL 17 cluster with `supabase/tests/support/supabase_stub.sql`, every migration through `20261013110000_play_void_cursor.sql`, and `supabase/tests/support/seed.sql`. Neither `20261014100000_payment_audit_capture_inbox.sql` nor `20261014110000_payment_job_leases.sql` was applied. This is executable evidence that its SQL objects resolve against the earlier schema in the stubbed environment. It adds `orders.play_last_attempt_at` itself, and uses `orders` Play columns introduced on 2026-10-12. It does not reference `payment_jobs`, `payment_compensations`, `provider_events`, or Razorpay identifiers.

The local build initially stopped at `20260924100000_critical1_lock_settlement_functions.sql` because the stand-in Supabase stub lacks the hosted `postgres` role. The disposable cluster was reset, that standard role was added locally, and the full allowlisted build then succeeded. This was a test-harness setup issue, not a migration change.

## 2. Safe migration deployment approach

The [Supabase migration documentation](https://supabase.com/docs/guides/deployment/database-migrations) says `db push` compares local files with `supabase_migrations.schema_migrations` and applies pending files in timestamp order. Therefore `supabase db push`, `supabase migration up`, `supabase db reset`, and this repo's `supabase/tests/run-all.sh` must **not** run from the current migration directory: both flagged files would be selected if absent from migration history. The CLI was not installed here, so no CLI dry run was performed.

For a future reviewed staging deployment:

1. Inventory the target project's migration history and schema **read only**. Confirm every baseline version through `20261013110000` is applied and the Play prerequisite columns and reversal RPC exist. If either flagged version is recorded as applied, stop and investigate the actual schema; do not rewrite history.
2. Build a separate release directory containing an unchanged copy of `config.toml`, all migration files with versions through `20261013110000`, and exactly `20261015100000_play_payment_jobs.sql`. Compare file hashes with this repository. Fail the build if either `20261014` file is present or any other later file appears. Do not edit or rename the flagged source files.
3. Against the **isolated staging project only**, use `supabase db push --dry-run` from that release directory. Require the preview to list exactly `20261015100000`; if it lists a baseline or either flagged version, stop. Run the reviewed push from the same release directory only after the preview and schema preflight match. This appends the new version through the CLI while preserving all existing migration-history rows. Never use `migration repair` to mark unsafe files applied.
4. Keep normal deployment from this repository blocked until the two unsafe migrations are resolved through a separately reviewed release process. A future `db push` from this directory could still apply them. Keep the curated release directory and its manifest for reproducibility.

No remote step above was executed in this QA pass.

## 3. PostgreSQL integration results

Disposable cluster: PostgreSQL 17.11, data directory `/tmp/medveda_play_pg_qa`, Unix socket `/tmp/.s.PGSQL.55432`, scratch database `medveda_play_qa`. No TCP listener. The local Supabase stub models roles/auth/storage but is not a hosted Supabase instance.

`supabase/tests/play_payment_pg_checks.sql` passed in a rollback transaction: Play-only enqueue, duplicate enqueue, consume and reconcile claims, unexpired/expired/stale lease fencing, retry backoff, 12-attempt parking, reconciliation reopening only when due, void-token deduplication, cursor lease/retry/page advancement, Play entitlement reversal and idempotent replay, and Razorpay order/payment isolation. Two real PostgreSQL sessions concurrently claimed one consume job exactly once. The suite used synthetic orders and tokens only.

The existing `supabase/tests/ucb_checks.sql` passed **0 FAIL, 28 PASS** against this same migration set. It covers Play settlement, replay, purchase and entitlement creation, refund reversal, and UCB/Razorpay behavior. These are database integration checks, with the Google API response controlled outside SQL.

## 4. Security and permissions results

The SQL suite verified no `anon` or `authenticated` DML on the new queue, void-token and cursor tables, no metrics-view `SELECT`, and no `EXECUTE` on all six new worker RPCs; it verified `service_role` execute grants. Direct `SET ROLE anon` and `SET ROLE authenticated` calls to `enqueue_play_payment_jobs()` failed with PostgreSQL permission errors. A direct `SET ROLE service_role` call succeeded. The worker mock also confirmed missing cron secret yields HTTP 401. Hosted API gateway and deployed secret configuration remain untested.

## 5. Google Play worker results

`deno check supabase/functions/play-payment-worker/index.ts` passed. `play-payment-worker-selftest.cjs` passed its mocked cases for consumption, failure/retry, duplicate and concurrent claims, expired leases, parking, reconciliation failures, refunded purchases, void deduplication, void-before-settlement, cursor failure, stale leases, direct-verification races, Razorpay exclusion, and cron authentication. Related Play/UCB tests passed: `play-consumption-selftest.cjs`, `play-reconcile-fairness-selftest.cjs`, `google-reporting-selftest.cjs`, `recovery-selftest.cjs`, `f10-coverage-selftest.cjs`, `settle-timestamp-selftest.cjs`, `payment-gate-selftest.ts`, and `payment-backlog-load-selftest.ts` (mocked 1,500-job load). No Google network request, licensed tester purchase, Play sandbox consume, refund, or void was made.

## 6. Razorpay isolation verification

The new migration has separate `play_payment_jobs`, `play_void_tokens`, and `play_recovery_cursor` objects. The worker imports no Razorpay settlement module and filters order reads/updates to `provider='play'`. SQL fixtures proved a paid Razorpay order was never enqueued or changed; the mocked worker proved it did not consume or reverse a Razorpay order. Existing `razorpay-env-selftest.ts`, `razorpay-refund-selftest.ts`, and `compensation-worker-selftest.cjs` passed. No Razorpay settlement source or either flagged migration was changed in this QA pass.

## 7. Remaining blockers

- Hosted Supabase compatibility, PostgREST permissions, function deployment, real scheduling, and provider timing need staging evidence. Local stub tests cannot establish these.
- No Play licensed tester purchase, actual consumption result, refund/void notification, or Google API recovery was exercised. Controlled mocks cover logic only.
- `run-all.sh` was intentionally not run because it applies both flagged migrations. `ucb-cron-config-selftest.cjs` was attempted without a local server at its hard-coded port 55437 and stopped at scratch-database creation; it was not passed or rerun, since its success path schedules cron jobs even in its scratch database.
- The flagged migrations remain in the normal migration directory. Any ordinary pending-migration command from that directory is unsafe until release packaging and history are reconciled as above.

## 8. Recommendation

**NO-GO.** Proceed only to an isolated hosted staging exercise with the curated migration release directory, controlled Play test credentials and licensed tester fixtures, read-only migration-history preflight, and explicit evidence of consume/refund/void recovery. Keep production migration, Edge Function deployment, and cron activation blocked.
