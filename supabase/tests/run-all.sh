#!/usr/bin/env bash
# Builds a fresh database from support/supabase_stub.sql + every migration + support/seed.sql, then
# runs every current SQL suite and the edge-function harnesses. Exits non-zero on the first suite
# that reports a failure, after running all of them.
#
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres [PGPASSWORD=...] supabase/tests/run-all.sh
#
# Needs: psql, a reachable PostgreSQL 15+ superuser, and (for the harnesses) Node 22 + Deno.
# Retired suites live in tests/legacy/ and are not run. The scratch database is dropped at the end
# unless KEEP_DB=1.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres}
DB=ap_ci_$$
P="psql -X -q -At -v ON_ERROR_STOP=1"
fail=0

$P -d postgres -c "drop database if exists $DB" -c "create database $DB" || { echo "cannot create database"; exit 2; }
trap '[ -n "${KEEP_DB:-}" ] || psql -X -q -d postgres -c "drop database if exists $DB" >/dev/null 2>&1' EXIT

echo "== build: stub + migrations + seed"
$P -d $DB -f "$here/support/supabase_stub.sql" >/dev/null || { echo "stub failed"; exit 2; }
for f in $(ls "$root"/supabase/migrations/*.sql | sort); do
  base=$(basename "$f"); [[ "$base" =~ ^[0-9]{8,14}_ ]] || continue     # the CLI skips names without a timestamp
  if ! $P -d $DB -f "$f" >/dev/null 2>/tmp/ap_ci_err.$$; then echo "MIGRATION FAILED: $base"; cat /tmp/ap_ci_err.$$; exit 2; fi
done
$P -d $DB -f "$here/support/seed.sql" >/dev/null || { echo "seed failed"; exit 2; }

# Run with the pristine seed; older suites may mutate fixture eligibility.
for s in play_catalog_queue_regression_checks play_catalog_failure_access_checks play_duplicate_settlement_checks; do
  if $P -d $DB -f "$here/$s.sql"; then echo "PASS  $s";
  else fail=1; fi
done

# Suites that end with "N FAIL, M PASS" (or a "<n> FAIL" line): pass only at 0 FAIL and with tests present.
for s in f7_checks f8_checks batch1_checks batch3_checks batch3b_checks phase2_referral_wallet_checks \
         referral_limits_checks referral_off_wallet_checks high_phone_and_notes_checks medium_db_checks low_grants_checks admin_mfa_checks ucb_checks verified_content_checks; do
  out=$(psql -X -q -At -d $DB -f "$here/$s.sql" 2>&1)
  line=$(echo "$out" | grep -E '[0-9]+ FAIL, [0-9]+ PASS' | tail -1 | tr -d ' ')
  if [[ "$line" =~ ^0FAIL,[1-9][0-9]*PASS$ ]]; then printf "PASS  %-36s %s\n" "$s" "$line"
  else printf "FAIL  %-36s %s\n" "$s" "${line:-no summary line}"; echo "$out" | grep -E 'FAIL|ERROR' | head -8; fail=1; fi
done

# Older suites: they RAISE (psql exits non-zero) or print a line starting with FAIL.
for s in account_deletion_checks critical_fixes_checks app_config_checks null_year_fallback_checks \
         course_wide_browsing_checks content_publication_checks quiz_answer_and_admin_mfa_checks payment_queue_checks referral_switch_off_paths play_catalog_sync_checks play_payment_pg_checks play_entitlement_snapshot_checks; do
  out=$(psql -X -q -At -v ON_ERROR_STOP=1 -d $DB -f "$here/$s.sql" 2>&1); rc=$?
  if [ $rc -eq 0 ] && ! echo "$out" | grep -qE '(^|[^A-Za-z])FAIL'; then printf "PASS  %s\n" "$s"
  else printf "FAIL  %s (exit %s)\n" "$s" "$rc"; echo "$out" | tail -6; fail=1; fi
done

echo "== edge-function harnesses"
export TEMPLATE_DB=$DB
if out=$(deno test --allow-env "$here/play_catalog_unit_test.ts" "$here/play_catalog_api_test.ts" 2>&1); then
  echo "PASS  Play catalog unit + API regressions";
else echo "FAIL  Play catalog unit + API regressions"; echo "$out" | tail -15; fail=1; fi
if out=$(deno test "$here/pdf-validation-test.ts" "$here/upload-body-test.ts" "$here/note-pdf-hash-test.ts" 2>&1); then echo "PASS  pdf-validation + upload-body + note-pdf-hash (9 cases)";
else echo "FAIL  pdf-validation-test"; echo "$out" | tail -8; fail=1; fi
if out=$(bash "$here/wallet-concurrency.sh" 2>&1); then echo "$out";
else echo "$out"; fail=1; fi
if out=$(bash "$here/discount-concurrency.sh" 2>&1); then echo "$out";
else echo "$out"; fail=1; fi
if out=$(bash "$here/payment-concurrency.sh" 2>&1); then echo "$out";
else echo "$out"; fail=1; fi
for test in settle-timestamp-selftest.cjs f10-coverage-selftest.cjs google-reporting-selftest.cjs play-consumption-selftest.cjs recovery-selftest.cjs \
            play-reconcile-fairness-selftest.cjs compensation-worker-selftest.cjs ucb-cron-config-selftest.cjs \
            play-payment-worker-selftest.cjs play-cron-config-selftest.cjs play-catalog-worker-selftest.cjs play-catalog-creation-selftest.cjs \
            play-service-account-diagnostic-selftest.cjs play-order-selftest.cjs play-verification-selftest.cjs \
            razorpay-routing-selftest.cjs content-url-publication-selftest.cjs; do
  if out=$(cd "$root" && node "$here/$test" 2>&1); then echo "$out" | grep '^PASS';
  else echo "$out" | tail -8; fail=1; fi
done
if out=$(cd "$root" && deno run "$here/payment-gate-selftest.ts" 2>&1); then echo "$out" | grep '^PASS';
else echo "$out" | tail -8; fail=1; fi
for test in razorpay-env-selftest.ts razorpay-refund-selftest.ts payment-backlog-load-selftest.ts; do
  if out=$(cd "$root" && deno run --allow-env "$here/$test" 2>&1); then echo "$out" | grep '^PASS';
  else echo "$out" | tail -8; fail=1; fi
done
if command -v node >/dev/null && command -v deno >/dev/null; then
  out=$(bash "$here/webhook-harness/run.sh" 2>&1); n_fail=$(echo "$out" | grep -c '^FAIL'); n_pass=$(echo "$out" | grep -c '^PASS')
  if [ "$n_fail" -eq 0 ] && [ "$n_pass" -gt 0 ]; then echo "PASS  webhook-harness ($n_pass checks)"; else echo "FAIL  webhook-harness"; echo "$out" | tail -8; fail=1; fi
else
  echo "SKIP  webhook-harness (needs node and deno)"
fi

[ $fail -eq 0 ] && echo "ALL SUITES PASSED" || echo "SOME SUITES FAILED"
exit $fail
