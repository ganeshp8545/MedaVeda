# Play payment recovery worker implementation report

Date: 2026-10-15 (UTC). Scope: local source only. No production connection, migration, function deployment, or cron activation was performed.

## Result

`play-payment-worker` is a Play-only Edge Function with three authenticated cron phases: `consume`, `reconcile`, and `voids`. It uses a separate queue, separate void cursor, and retained void-token inbox. It does not import Razorpay code or access Razorpay payment tables. The existing `create-play-order`, `verify-play-purchase`, Play settlement RPC, and entitlement-granting behavior were left unchanged.

## Files

| File | Change |
| --- | --- |
| `supabase/functions/play-payment-worker/index.ts` | New bounded worker; Google consumption retry, Play purchase reconciliation, void sweep, reversal, monitoring. |
| `supabase/migrations/20261015100000_play_payment_jobs.sql` | New additive Play-only queue, void-token inbox, cursor, metrics, and service-role RPCs. |
| `supabase/play_payment_cron_setup.sql` | New **inactive** scheduling script for three minute jobs; running it would enable those jobs. |
| `supabase/tests/play-payment-worker-selftest.cjs` | New mock Edge Function and static SQL invariant checks. |
| `supabase/functions/_shared/googlePlay.ts` | Optional bounded void page size (defaults to the existing 200). |
| `supabase/config.toml` | Explicit `verify_jwt = false` for the cron-only worker; its own header secret authenticates requests. |

The two flagged `20261014` migrations and existing Razorpay functions, routing, settlement, and webhook logic were not changed.

## Migration and dependencies

Migration: `20261015100000_play_payment_jobs.sql`. Its schema dependencies are only those present through `20261013110000_play_void_cursor`: `orders` Play columns, `play_last_checked_at`, the Play settlement/reversal model, and standard PostgreSQL UUID generation. It adds `play_last_attempt_at`; it does not use `payment_jobs`, `payment_compensations`, `provider_events`, or any object introduced by the two flagged migrations. `play_void_tokens` is service-role-only and retains token identities so a void observed before local settlement is still actionable later.

The queue claims at most 20 orders per phase with `FOR UPDATE SKIP LOCKED`, four workers run concurrently, leases last three minutes, and completion checks both lease ID and unexpired lease. Failures back off from one minute to one hour and park after 12 attempts. Finished reconciliation jobs reopen only after the last successful check is at least two hours old. The void phase fetches one Google page of at most 40 entries per call. Its cursor also has a fenced lease and retry backoff. Google void history is limited; a cursor older than 29 days fails visibly instead of silently skipping history.

## Secrets and authentication

Required Edge secret names: `PLAY_PAYMENT_CRON_SECRET`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_PACKAGE_NAME`. Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `UCB_SENTRY_DSN` is used for best-effort alerts and should be configured for monitoring.

Required Vault secret names for the optional schedule: `play_project_url`, `play_payment_cron_secret`. The latter must match `PLAY_PAYMENT_CRON_SECRET`. The endpoint accepts only POST and requires a dedicated 32+ character secret in `x-play-payment-cron-secret`; it accepts no user-supplied order ID or purchase token.

## Tests and checks

Passed locally:

- New worker harness: successful consumption, failed consumption and retry, duplicate job/token behavior, concurrent claims, expired lease reclaim, 12-attempt parking, Google failure retry, refunded purchase reversal, void deduplication, void-before-settlement recovery, stale job/cursor leases, void API retry, direct verification race and Google 409 confirmation, Razorpay isolation, cron authentication, and migration isolation assertions.
- Existing `play-consumption-selftest.cjs`, `play-reconcile-fairness-selftest.cjs`, and `google-reporting-selftest.cjs`.
- `deno check` on the worker and Google helper, `deno lint` and `deno fmt --check` on the worker, and `git diff --check` on tracked changes.

Not run: PostgreSQL migration/RPC integration suites. `pg_isready` reported no local PostgreSQL server. The new concurrency and lease tests use mocks; they do not replace a real PostgreSQL transactional test. The repository-wide `run-all.sh` currently loads every pending migration, including the two flagged `20261014` files, so it is not an acceptable release gate until those files have a safe disposition.

## Deployment prerequisites and known risks

1. Keep `20261014100000_payment_audit_capture_inbox.sql` and `20261014110000_payment_job_leases.sql` out of any migration push. A plain `supabase db push` would include them. Review the migration history strategy before applying the new migration; restoring those older pending files after a later migration is applied also creates an ordering problem.
2. Test the new migration and RPCs on an isolated PostgreSQL 15+ database built only through `20261013110000`, including actual concurrent claims, expiry, duplicate tokens, reversal, and grants. Refresh/check the PostgREST schema cache after migration.
3. Validate service-account access to the Play Developer API and package `in.medveda.app`; test an actual license-test purchase and refund in a non-production environment.
4. Deploy the Edge Function, configure the named secrets and monitoring, then review the inactive cron SQL. Before enabling the Play schedule, retire only the old `ucb-consume` and `ucb-reconcile` jobs if present; keep unrelated Razorpay/UCB jobs unchanged. Do not run both recovery implementations for the same Play phases.
5. Watch `play_recovery_metrics`, `play_payment_jobs` parked rows, cursor lag, Sentry alerts, and Edge logs. Parked jobs need an explicit operator review and retry procedure. A void cursor stalled beyond Google's history window needs manual investigation; the worker intentionally will not advance it blindly.

## Recommendation

**NO-GO for production deployment now.** The local implementation and mock/static checks are complete, but the unapplied flagged migrations make an unfiltered migration push unsafe, and real PostgreSQL plus Play sandbox integration tests remain outstanding. Proceed to staging only after isolating the migration chain and running those checks.
