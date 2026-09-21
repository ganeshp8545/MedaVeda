#!/usr/bin/env bash
# Batch 2 version gate: the migration must REFUSE until app_config.min_app_version >= 1.2.0.
# usage: supabase/tests/batch2_guard.sh   (scratch Postgres on :54329; TEMPLATE_DB = a DB with Batch 1 applied)
root=$(cd "$(dirname "$0")/../../.." && pwd)
P="psql -h 127.0.0.1 -p 54329 -U postgres -w -At"
T=${TEMPLATE_DB:-ap_b1}; M=$root/supabase/held/batch2-videos/99990101000000_batch2_videos_free_preview_only.sql
fails=0
ok(){ if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails+1)); fi; }
mk(){ $P -d postgres -c "drop database if exists ap_guard" -c "create database ap_guard template $T" >/dev/null; }
run(){ $P -d ap_guard -v ON_ERROR_STOP=1 -q -f "$M" 2>&1; }
policy(){ $P -d ap_guard -c "select count(*) from pg_policies where tablename='videos' and policyname='$1'"; }
setv(){ $P -d ap_guard -c "insert into public.app_config(key,value) values ('min_app_version','$1') on conflict (key) do update set value=excluded.value" >/dev/null; }

mk; out=$(run); rc=$?; ok $([ $rc -ne 0 ] && echo 0 || echo 1) "refuses with the default min_app_version"; echo "$out" | grep -q "BATCH 2 REFUSED" ; ok $? "... and says why"
[ "$(policy videos_public_read_active)" = 1 ]; ok $? "... and changed NOTHING (old policy still there)"
for v in 1.1.0 1.1.9 1.0.99; do setv $v; out=$(run); rc=$?; ok $([ $rc -ne 0 ] && echo 0 || echo 1) "refuses at min_app_version=$v"; done
$P -d ap_guard -c "delete from public.app_config where key='min_app_version'" >/dev/null; out=$(run); rc=$?; ok $([ $rc -ne 0 ] && echo 0 || echo 1) "refuses when min_app_version is missing"
setv 1.2.0; out=$(run); rc=$?; ok $rc "applies at min_app_version=1.2.0"
[ "$(policy videos_public_read_active)" = 0 ] && [ "$(policy videos_read_free_preview)" = 1 ]; ok $? "... and swaps the policy"
out=$(run); ok $? "is re-runnable"
mk; setv 1.10.0; run >/dev/null; ok $? "1.10.0 counts as newer than 1.2.0 (numeric, not string, compare)"
mk; setv 2; run >/dev/null; ok $? "'2' (major only) is accepted"
echo "$fails FAIL"; exit $fails
