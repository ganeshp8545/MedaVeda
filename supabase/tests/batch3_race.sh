#!/usr/bin/env bash
# F12: two friends apply the same referrer's code at the SAME instant with the cap at 1.
# Session 1 applies and holds its transaction open for 3s; session 2 applies 1s later.
# Correct: session 2 waits for session 1, then sees the cap reached -> exactly 1 referral.
# Old code: session 2 counts 0 (session 1 has not committed) -> 2 referrals, cap exceeded.
# usage: supabase/tests/batch3_race.sh   (TEMPLATE_DB = a DB with Batch 1-3 applied; default ap_b3)
P="psql -h 127.0.0.1 -p 54329 -U postgres -w -At"
T=${TEMPLATE_DB:-ap_b3}
$P -d postgres -c "drop database if exists ap_race" -c "create database ap_race template $T" >/dev/null
$P -d ap_race -q >/dev/null <<'SQL'
insert into auth.users(id,email) values ('b7000000-0000-0000-0000-000000000001','race_r@example.com'),('b7000000-0000-0000-0000-000000000002','race_f1@example.com'),('b7000000-0000-0000-0000-000000000003','race_f2@example.com');
do $$ begin
  update public.profiles set mobile_verified = true where id::text like 'b7000000%';
  update public.referral_settings set enabled = true, max_referrals_per_user = 1, apply_window_days = 2 where id = true;
end $$;
SQL
code=$($P -d ap_race -c "select referral_code from public.profiles where id='b7000000-0000-0000-0000-000000000001'")
apply(){ # $1 friend uuid, $2 sleep after
  $P -d ap_race -c "begin; select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true); set local role authenticated; select public.apply_referral_code('$code')->>'status'; select pg_sleep($2); commit;" 2>&1 | grep -E "success|limit|invalid|already|error" | head -1
}
apply b7000000-0000-0000-0000-000000000002 3 > /tmp/race1.$$ &
sleep 1
r2=$(apply b7000000-0000-0000-0000-000000000003 0)
wait; r1=$(cat /tmp/race1.$$); rm -f /tmp/race1.$$
n=$($P -d ap_race -c "select count(*) from public.referrals where referrer_id='b7000000-0000-0000-0000-000000000001'")
echo "session1=$r1 session2=$r2 referrals=$n"
if [ "$n" = "1" ] && [ "$r1" = "success" ] && [ "$r2" = "referrer_limit_reached" ]; then echo "PASS cap of 1 holds under a concurrent apply"; exit 0; else echo "FAIL cap exceeded or wrong outcome"; exit 1; fi
