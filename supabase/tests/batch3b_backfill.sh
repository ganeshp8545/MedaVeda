#!/usr/bin/env bash
# Batch 3b: buyers that exist BEFORE the migration are back-filled into first_purchase_identities,
# so an existing customer who deletes and re-signs up is caught from day one.
# usage: supabase/tests/batch3b_backfill.sh   (PRE_DB = Batch 1 + 3 applied, 3b NOT applied; default ap_pre3b)
root=$(cd "$(dirname "$0")/../.." && pwd); P="psql -h 127.0.0.1 -p 54329 -U postgres -w -At"
PRE=${PRE_DB:-ap_pre3b}; fails=0
ok(){ if [ "$1" = 0 ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails+1)); fi; }
$P -d postgres -c "drop database if exists ap_bf" -c "create database ap_bf template $PRE" >/dev/null
$P -d ap_bf -q >/dev/null <<'SQL'
insert into auth.users(id,email) values ('ba000000-0000-0000-0000-000000000001','Buyer.One@gmail.com'),('ba000000-0000-0000-0000-000000000002','refunded@example.com'),('ba000000-0000-0000-0000-000000000003','never_bought@example.com');
update public.profiles set phone='+919333300001' where id='ba000000-0000-0000-0000-000000000001';
insert into public.years(id,title,course_id) values ('bfy','y','bams');
insert into public.subjects(id,title,year_id) values ('bfs','s','bfy');
insert into public.chapters(id,title,subject_id) values ('bfc','c','bfs');
insert into public.products(id,title,scope,price,chapter_id,active,product_type) values ('bfp','p','chapter',100,'bfc',true,'notes');
insert into public.purchases(user_id,scope,course_id,product_id,status) values
  ('ba000000-0000-0000-0000-000000000001','chapter','bams','bfp','success'),
  ('ba000000-0000-0000-0000-000000000002','chapter','bams','bfp','refunded');
SQL
$P -d ap_bf -v ON_ERROR_STOP=1 -q -f $root/supabase/migrations/20260927130000_batch3b_antifarming.sql 2>&1 | grep ERROR
n1=$($P -d ap_bf -c "select count(*) from public.first_purchase_identities where account_id='ba000000-0000-0000-0000-000000000001'")
[ "$n1" = 2 ]; ok $? "an existing buyer (email + phone) is back-filled: 2 hashes (got $n1)"
n2=$($P -d ap_bf -c "select count(*) from public.first_purchase_identities where account_id='ba000000-0000-0000-0000-000000000002'")
[ "$n2" = 1 ]; ok $? "a buyer whose purchase was refunded still counts (email only: no phone) (got $n2)"
n3=$($P -d ap_bf -c "select count(*) from public.first_purchase_identities where account_id='ba000000-0000-0000-0000-000000000003'")
[ "$n3" = 0 ]; ok $? "a user who never bought is not recorded (got $n3)"
# and the deleted-then-re-signed-up existing buyer is caught
$P -d ap_bf -q >/dev/null <<'SQL'
delete from public.purchases where user_id='ba000000-0000-0000-0000-000000000001';
delete from public.profiles where id='ba000000-0000-0000-0000-000000000001'; delete from auth.users where id='ba000000-0000-0000-0000-000000000001';
insert into auth.users(id,email) values ('ba000000-0000-0000-0000-000000000009','buyerone+again@gmail.com');
SQL
r=$($P -d ap_bf -c "select public.has_prior_purchase_identity('ba000000-0000-0000-0000-000000000009')")
[ "$r" = t ]; ok $? "a back-filled buyer who deletes and re-signs up is recognised"
r=$($P -d ap_bf -c "select public.has_prior_purchase_identity('ba000000-0000-0000-0000-000000000003')")
[ "$r" = f ]; ok $? "a genuinely new account is not"
$P -d ap_bf -v ON_ERROR_STOP=1 -q -f $root/supabase/migrations/20260927130000_batch3b_antifarming.sql 2>&1 | grep ERROR; ok $([ -z "$($P -d ap_bf -v ON_ERROR_STOP=1 -q -f $root/supabase/migrations/20260927130000_batch3b_antifarming.sql 2>&1 | grep ERROR)" ] && echo 0 || echo 1) "the migration is re-runnable"
echo "$fails FAIL"; exit $fails
