-- ============================================================================
-- Batch 3 checks: F5 verified phone, F11 referral leak, F12 cap / rate limit / codes.
-- Run AFTER 20260927120000 (and Batch 1):   psql "$DB_URL" -f supabase/tests/batch3_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL". The concurrent-apply race is
-- in batch3_race.sh (needs two sessions).
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table b3_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into b3_results values (p_name, coalesce(p_ok, false), p_detail) $$;
create function pg_temp.attempt(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; res := 'OK'; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
create function pg_temp.q(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into res; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return coalesce(res, '<null>');
end $$;
create function pg_temp.srv(p_sql text) returns text
language plpgsql as $$
declare res text;
begin execute p_sql into res; return coalesce(res, '<null>'); exception when others then return 'ERR: ' || sqlerrm; end $$;
-- run a statement that returns nothing (UPDATE etc.); never aborts the transaction
create function pg_temp.exec(p_sql text) returns text
language plpgsql as $$ begin execute p_sql; return 'OK'; exception when others then return 'ERR: ' || sqlerrm; end $$;
create function pg_temp.apply(p_uid uuid, p_code text) returns text
language sql as $fn$ select coalesce(pg_temp.q('authenticated', p_uid, format($$select public.apply_referral_code(%L)->>'status'$$, p_code)), '<null>') $fn$;
create function pg_temp.mkorder(p_uid uuid, p_product text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.create_priced_order(p_uid, p_product, false);
  if (r->>'ok')::boolean then update public.orders set razorpay_order_id = 'order_' || replace(r->>'order_id', '-', '') where id = r->>'order_id'; end if;
  return r;
end $$;
create function pg_temp.pay(p_order text) returns text
language plpgsql as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform public.grant_razorpay_payment('evt_' || p_order, o.razorpay_order_id, 'pay_' || p_order, round(o.amount * 100)::bigint);
  return 'OK';
exception when others then return 'ERR: ' || sqlerrm; end $$;

\o /dev/null
insert into auth.users(id, email) select ('b6000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'b3_' || n || '@example.com' from generate_series(1, 30) n;
insert into auth.users(id, email) values ('b6000000-0000-0000-0000-000000000063', 'b3_adm@example.com');
insert into public.admins(id, email) values ('b6000000-0000-0000-0000-000000000063', 'b3_adm@example.com');
\set ADM '''b6000000-0000-0000-0000-000000000063'''
\set RV '''b6000000-0000-0000-0000-000000000001'''
\set RU '''b6000000-0000-0000-0000-000000000002'''
\set FV '''b6000000-0000-0000-0000-000000000003'''
\set FU '''b6000000-0000-0000-0000-000000000004'''
\set F2 '''b6000000-0000-0000-0000-000000000005'''
\set F3 '''b6000000-0000-0000-0000-000000000006'''
\set F4 '''b6000000-0000-0000-0000-000000000007'''
\set F5 '''b6000000-0000-0000-0000-000000000008'''
\set RT '''b6000000-0000-0000-0000-000000000009'''
\set S  '''b6000000-0000-0000-0000-000000000010'''
insert into public.years(id, title, course_id) values ('by', 'B3 year', 'bams');
insert into public.subjects(id, title, year_id) values ('bs', 'B3 subject', 'by');
insert into public.chapters(id, title, subject_id) select 'bc' || n, 'c' || n, 'bs' from generate_series(1, 8) n;
insert into public.products(id, title, scope, price, original_price, chapter_id, active, product_type)
  select 'bp' || n, 'notes ' || n, 'chapter', 500, 900, 'bc' || n, true, 'notes' from generate_series(1, 8) n;
update public.referral_settings set enabled = true, friend_discount_percent = 10, friend_discount_max = 100,
  referrer_credit_amount = 50, credit_hold_days = 7, wallet_max_percent = 50, apply_window_days = 2, max_referrals_per_user = null where id = true;
select pg_temp.exec($$update public.referral_settings set require_verified_phone = true where id = true$$);
-- verified: RV (referrer), FV, F2..F5, RT, S ; NOT verified: RU (referrer), FU (friend)
update public.profiles set mobile_verified = true where id in (:RV, :FV, :F2, :F3, :F4, :F5, :RT, :S);
select referral_code as rv_code from public.profiles where id = :RV \gset
select referral_code as ru_code from public.profiles where id = :RU \gset

-- ============================================================================
-- F5  verified phone on both sides
-- ============================================================================
select pg_temp.apply(:FU::uuid, :'rv_code') as r \gset
select pg_temp.chk('N1 an UNVERIFIED friend cannot apply a code', :'r' = 'phone_not_verified'
  and not exists (select 1 from public.referrals where referred_id = :FU), :'r');
select pg_temp.apply(:FV::uuid, :'ru_code') as r \gset
select pg_temp.chk('N2 a code of an UNVERIFIED referrer answers "invalid_code" (nobody can probe who is verified)', :'r' = 'invalid_code'
  and not exists (select 1 from public.referrals where referred_id = :FV), :'r');
select pg_temp.apply(:FV::uuid, :'rv_code') as r \gset
select pg_temp.chk('N3 verified friend + verified referrer: applied', :'r' = 'success'
  and exists (select 1 from public.referrals where referrer_id = :RV and referred_id = :FV and status = 'pending'), :'r');
select pg_temp.exec($$update public.referral_settings set require_verified_phone = false where id = true$$);
select pg_temp.apply(:FU::uuid, :'rv_code') as r \gset
select pg_temp.chk('N4 the switch works: with require_verified_phone off, an unverified friend can apply', :'r' = 'success', :'r');
select pg_temp.exec($$update public.referral_settings set require_verified_phone = true where id = true$$);
delete from public.referrals where referred_id = :FU;

-- credit at settlement
select pg_temp.mkorder(:FV::uuid, 'bp1') as o1 \gset
select pg_temp.pay(:'o1'::jsonb->>'order_id');
select pg_temp.chk('N5 control: both verified at purchase -> the referrer gets a pending credit of 50',
  (select count(*) from public.wallet_ledger where user_id = :RV and source = 'referral_reward' and status = 'pending' and amount = 50) = 1
  and (select status from public.referrals where referred_id = :FV) = 'qualified');
-- F2 applies while verified, then changes their phone (verification is dropped) and buys
select pg_temp.apply(:F2::uuid, :'rv_code') as r \gset
select pg_temp.attempt('authenticated', :F2::uuid, format($$update public.profiles set phone = '+919822200001' where id = %L$$, :F2)) as r2 \gset
select pg_temp.chk('N6a (setup) changing the phone dropped the friend''s verification', not (select mobile_verified from public.profiles where id = :F2), :'r2');
select pg_temp.mkorder(:F2::uuid, 'bp2') as o2 \gset
select pg_temp.pay(:'o2'::jsonb->>'order_id');
select pg_temp.chk('N6 friend unverified AT PURCHASE: access granted, but NO referrer credit; referral rejected with the reason',
  (select count(*) from public.purchases where order_id = (:'o2'::jsonb->>'order_id') and status = 'success') = 1
  and (select count(*) from public.wallet_ledger where order_id = (:'o2'::jsonb->>'order_id') and source = 'referral_reward') = 0
  and (select status || ':' || reject_reason from public.referrals where referred_id = :F2) = 'rejected:phone_not_verified_at_purchase');
-- referrer loses verification between apply and purchase
select pg_temp.apply(:F3::uuid, :'rv_code') as r \gset
update public.profiles set mobile_verified = false where id = :RV;
select pg_temp.mkorder(:F3::uuid, 'bp3') as o3 \gset
select pg_temp.pay(:'o3'::jsonb->>'order_id');
select pg_temp.chk('N7 REFERRER unverified at purchase: no credit',
  (select count(*) from public.wallet_ledger where order_id = (:'o3'::jsonb->>'order_id') and source = 'referral_reward') = 0
  and (select status from public.referrals where referred_id = :F3) = 'rejected');
update public.profiles set mobile_verified = true where id = :RV;

-- ============================================================================
-- F11  the referrals table is not readable by students
-- ============================================================================
select pg_temp.q('authenticated', :RV::uuid, $$select count(*)::text from public.referrals$$) as r \gset
select pg_temp.chk('L1 the REFERRER cannot select referrals rows (friend ids, order ids, reject_reason)', :'r' = '0', :'r');
select pg_temp.q('authenticated', :FV::uuid, $$select count(*)::text from public.referrals$$) as r \gset
select pg_temp.chk('L2 the FRIEND cannot select referrals rows either (referrer id, code)', :'r' = '0', :'r');
select pg_temp.q('authenticated', :ADM::uuid, $$select (count(*) >= 3)::text from public.referrals$$) as r \gset
select pg_temp.chk('L3 an admin still reads them (admin panel)', :'r' = 'true', :'r');
select pg_temp.q('authenticated', :RV::uuid, $$select count(*)::text from public.get_my_referrals()$$) as r \gset
select pg_temp.chk('L4 the RPC still lists the referrer''s own referrals', :'r'::int >= 3, :'r');
select pg_temp.q('authenticated', :RV::uuid, format($$select count(*)::text from public.get_my_referrals() where referred_id in (%L, %L, %L)$$, :FV, :F2, :F3)) as r \gset
select pg_temp.chk('L5 ... and it no longer returns the friends'' user ids', :'r' = '0', :'r');
select pg_temp.q('authenticated', :RV::uuid, $$select string_agg(referred_name, ',' order by referred_name) from public.get_my_referrals() where referred_name is not null$$) as r \gset
select pg_temp.chk('L6 ... still first names only (no surname, email, phone)', :'r' !~ '@' and :'r' !~ '\d', :'r');
select pg_temp.q('authenticated', :FV::uuid, $$select count(*)::text from public.get_my_referrals()$$) as r \gset
select pg_temp.chk('L7 the friend sees none of the referrer''s list', :'r' = '0', :'r');
select pg_temp.attempt('anon', null, $$select * from public.get_my_referrals()$$) as r \gset
select pg_temp.chk('L8 anon cannot call get_my_referrals', :'r' like 'ERR:%permission denied%', :'r');
select pg_temp.q('authenticated', :RV::uuid, $$select count(*)::text from public.get_my_referral_list()$$) as r \gset
select pg_temp.chk('L9 the current app''s RPC (get_my_referral_list) is unaffected', :'r'::int >= 3, :'r');
select pg_temp.attempt('authenticated', :RV::uuid, format($$update public.referrals set status = 'rewarded' where referrer_id = %L$$, :RV)) as r \gset
select pg_temp.chk('L10 nor can a student change referral rows', (select count(*) from public.referrals where status = 'rewarded') = 0, :'r');

-- ============================================================================
-- F12  cap, rate limit, codes
-- ============================================================================
update public.referral_settings set max_referrals_per_user = 1 where id = true;
select referral_code as rt_code from public.profiles where id = :RT \gset
select pg_temp.apply(:F4::uuid, :'rt_code') as r \gset
select pg_temp.chk('C1 cap 1: first friend is accepted', :'r' = 'success', :'r');
select pg_temp.apply(:F5::uuid, :'rt_code') as r \gset
select pg_temp.chk('C2 cap 1: second friend is refused', :'r' = 'referrer_limit_reached', :'r');
select id as rid from public.referrals where referred_id = :F4 \gset
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reject_referral(%L, 'fake')$$, :'rid')) as r \gset
select pg_temp.apply(:F5::uuid, :'rt_code') as r \gset
select pg_temp.chk('C3 a REJECTED referral does not use up a slot: the second friend can now apply', :'r' = 'success', :'r');
update public.referral_settings set max_referrals_per_user = null where id = true;

-- rate limit: 10 attempts / hour / user
select string_agg(pg_temp.apply(:S::uuid, 'ZZZZZZ' || n), ',' order by n) as rl from generate_series(1, 12) n \gset
select pg_temp.chk('E1 the 11th and 12th attempt within the hour are rate-limited',
  (string_to_array(:'rl', ','))[10] = 'invalid_code' and (string_to_array(:'rl', ','))[11] = 'rate_limited' and (string_to_array(:'rl', ','))[12] = 'rate_limited', :'rl');
select pg_temp.apply(:RV::uuid, :'rt_code') as r \gset
select pg_temp.chk('E2 the limit is per user (another user is unaffected)', :'r' <> 'rate_limited', :'r');

-- codes
select pg_temp.chk('E3 a generated code is 7 characters from the unambiguous 31-symbol alphabet',
  (select bool_and(referral_code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$') from public.profiles));
create temp table gen_codes as select public.generate_unique_referral_code() as c from generate_series(1, 3000);
select pg_temp.chk('E4 3000 fresh codes: all valid and all different',
  (select count(distinct c) = 3000 and bool_and(c ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{7}$') from gen_codes));
select pg_temp.chk('E5 the generator no longer uses random()', pg_get_functiondef('public.generate_unique_referral_code(integer)'::regprocedure) !~* '\mrandom\s*\(');
select pg_temp.chk('E6 the first character is spread over the alphabet (no modulo bias / stuck value)',
  (select count(distinct left(c, 1)) >= 25 from gen_codes));
select pg_temp.apply(:FV::uuid, lower(:'rv_code')) as r \gset
select pg_temp.chk('E7 lookup is case-insensitive on INPUT (exact match on the stored upper-case code)', :'r' in ('already_referred', 'success'), :'r');
select pg_temp.attempt('service_role', null, format($$update public.profiles set referral_code = lower(referral_code) where id = %L$$, :RT)) as r \gset
select pg_temp.chk('E8 the DB refuses a lower-case stored code (it would never match the exact lookup)', :'r' like 'ERR:%check%', :'r');
select pg_temp.chk('E9 the cap query no longer scans upper(referral_code): lookup uses the unique index',
  pg_get_functiondef('public.apply_referral_code(text)'::regprocedure) !~* 'upper\(referral_code\)');

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail from b3_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from b3_results;
rollback;
