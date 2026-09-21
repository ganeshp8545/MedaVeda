-- ============================================================================
-- Phase 1A security regression checks. Run AFTER 20260922100000 (Phase 1A) is
-- applied.   psql "$DB_URL" -f supabase/tests/phase1a_security_checks.sql
-- (Storage/bucket hardening is Phase 1B and is checked by phase1b_security_checks.sql.)
-- Everything runs in one transaction that is ROLLED BACK: it leaves no data.
-- Every line prints PASS or FAIL. The final row must read "0 FAIL".
-- Safe on production (fixtures are ph1_* rows created and rolled back), but
-- prefer running it on a copy first.
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;

create temp table ph1_results(name text, ok boolean, detail text);

-- attempt(role, user, sql): run sql as a role/user; returns 'OK' or 'ERR: msg'
create function pg_temp.attempt(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    res := 'OK';
  exception when others then
    res := 'ERR: ' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into ph1_results values (p_name, coalesce(p_ok, false), p_detail) $$;
\o /dev/null

-- ---- fixtures (rolled back) ------------------------------------------------
insert into auth.users(id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'ph1_student@example.com'),
  ('a1000000-0000-0000-0000-000000000002', 'ph1_admin@example.com'),
  ('a1000000-0000-0000-0000-000000000003', 'ph1_other@example.com');
insert into public.admins(id, email) values ('a1000000-0000-0000-0000-000000000002', 'ph1_admin@example.com');
insert into public.years(id, title, course_id) values ('ph1_y', 'PH1 year', 'bams');
insert into public.subjects(id, title, year_id) values ('ph1_s', 'PH1 subject', 'ph1_y');
insert into public.chapters(id, title, subject_id) values ('ph1_c', 'PH1 chapter', 'ph1_s');
insert into public.products(id, title, scope, price, chapter_id, active) values ('ph1_cheap', 'cheap', 'chapter', 49, 'ph1_c', true);
insert into public.products(id, title, scope, price, year_id, active) values ('ph1_big', 'big', 'year', 1999, 'ph1_y', true);
insert into public.notes(id, title, pdf_url, chapter_id)
  values ('ph1_n', 'n', 'https://x.supabase.co/storage/v1/object/public/notes/ph1_file.pdf', 'ph1_c');
insert into storage.buckets(id, name, public) values ('notes', 'notes', false) on conflict do nothing;
insert into storage.objects(bucket_id, name) values ('notes', 'ph1_file.pdf');

-- A legitimate paid order (created by the server the way pay/verify do)
insert into public.orders(id, user_id, product_id, amount, status, scope, chapter_id, razorpay_order_id)
  values ('ph1_ok', 'a1000000-0000-0000-0000-000000000001', 'ph1_cheap', 49, 'created', 'chapter', 'ph1_c', 'order_PH1OKOKOKOKOK1');
insert into public.payment_sessions(id, order_id, user_id, product_id, expires_at, used)
  values (gen_random_uuid(), 'ph1_ok', 'a1000000-0000-0000-0000-000000000001', 'ph1_cheap', now() + interval '1h', true);

-- ---- 1. settlement RPC is server-only -------------------------------------
select pg_temp.chk('T1 anon has no EXECUTE on grant_razorpay_payment',
  not has_function_privilege('anon', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute'));
select pg_temp.chk('T2 authenticated has no EXECUTE on grant_razorpay_payment',
  not has_function_privilege('authenticated', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute'));
select pg_temp.chk('T3 service_role has EXECUTE on grant_razorpay_payment',
  has_function_privilege('service_role', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute'));

select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$select public.grant_razorpay_payment('e','order_PH1OKOKOKOKOK1','pay_PH1OKOKOKOKOK1',4900)$$) as r \gset
select pg_temp.chk('T4 student calling the RPC directly is rejected', :'r' like 'ERR:%permission denied%', :'r');
select pg_temp.attempt('anon', null,
  $$select public.grant_razorpay_payment('e','order_PH1OKOKOKOKOK1','pay_PH1OKOKOKOKOK1',4900)$$) as r \gset
select pg_temp.chk('T5 anon calling the RPC directly is rejected', :'r' like 'ERR:%permission denied%', :'r');

-- ---- 2. the RPC defends itself even for the server ------------------------
-- forged order: no checkout session
insert into public.orders(id, user_id, product_id, amount, status, scope, year_id, razorpay_order_id)
  values ('ph1_forged', 'a1000000-0000-0000-0000-000000000001', 'ph1_big', 1, 'created', 'year', 'ph1_y', 'order_FORGEDFORGED01');
select pg_temp.attempt('service_role', null,
  $$select public.grant_razorpay_payment('e','order_FORGEDFORGED01','pay_FORGEDFORGED01',100)$$) as r \gset
select pg_temp.chk('T6 forged order (no checkout session) is refused even for service_role', :'r' like 'ERR:%no completed checkout session%', :'r');
-- product swapped after the session was created
insert into public.orders(id, user_id, product_id, amount, status, scope, year_id, razorpay_order_id)
  values ('ph1_swap', 'a1000000-0000-0000-0000-000000000001', 'ph1_big', 49, 'created', 'year', 'ph1_y', 'order_SWAPSWAPSWAP01');
insert into public.payment_sessions(id, order_id, user_id, product_id, expires_at, used)
  values (gen_random_uuid(), 'ph1_swap', 'a1000000-0000-0000-0000-000000000001', 'ph1_cheap', now() + interval '1h', true);
select pg_temp.attempt('service_role', null,
  $$select public.grant_razorpay_payment('e','order_SWAPSWAPSWAP01','pay_SWAPSWAPSWAP01',4900)$$) as r \gset
select pg_temp.chk('T7 product-swapped order is refused even for service_role', :'r' like 'ERR:%does not match its checkout session%', :'r');
-- legitimate flow still works and is idempotent
select pg_temp.attempt('service_role', null,
  $$select public.grant_razorpay_payment('e_ok','order_PH1OKOKOKOKOK1','pay_PH1OKOKOKOKOK1',4900)$$) as r \gset
select pg_temp.chk('T8 legitimate settlement by service_role succeeds', :'r' = 'OK', :'r');
select pg_temp.chk('T9 ... creates exactly one purchase and marks order paid',
  (select count(*) from public.purchases where order_id = 'ph1_ok') = 1
  and (select status from public.orders where id = 'ph1_ok') = 'paid');
select pg_temp.attempt('service_role', null,
  $$select public.grant_razorpay_payment('e_ok2','order_PH1OKOKOKOKOK1','pay_PH1OKOKOKOKOK1',4900)$$) as r \gset
select pg_temp.chk('T10 replayed settlement is idempotent',
  :'r' = 'OK' and (select count(*) from public.purchases where order_id = 'ph1_ok') = 1, :'r');

-- ---- 3. orders are immutable to students -----------------------------------
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$insert into public.orders(id,user_id,product_id,amount,status,scope) values ('ph1_paidins','a1000000-0000-0000-0000-000000000001','ph1_big',1,'paid','year')$$) as r \gset
select pg_temp.chk('T11 student cannot insert an order with status paid', :'r' like 'ERR:%', :'r');

select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$insert into public.orders(id,user_id,product_id,amount,status,scope,year_id,razorpay_order_id) values ('ph1_cheat','a1000000-0000-0000-0000-000000000001','ph1_big',1,'created','chapter',null,'order_CHEAT')$$) as r \gset
select pg_temp.chk('T12 student-written amount/scope/razorpay id are overridden from the product',
  :'r' = 'OK'
  and (select amount from public.orders where id = 'ph1_cheat') = 1999
  and (select scope from public.orders where id = 'ph1_cheat') = 'year'
  and (select razorpay_order_id from public.orders where id = 'ph1_cheat') is null, :'r');

select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set product_id='ph1_big' where id='ph1_swap'$$) as r \gset
select pg_temp.chk('T13 student cannot change product_id', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set amount=1 where id='ph1_swap'$$) as r \gset
select pg_temp.chk('T14 student cannot change amount', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set razorpay_order_id='order_X' where id='ph1_cheat'$$) as r \gset
select pg_temp.chk('T15 student cannot change razorpay_order_id', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set status='paid' where id='ph1_cheat'$$) as r \gset
select pg_temp.chk('T16 student cannot mark an order paid', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set status='failed' where id='ph1_ok'$$) as r \gset
select pg_temp.chk('T17 student cannot flip a PAID order to failed (the 2 flagged-orders bug)',
  :'r' like 'ERR:%' or (select status from public.orders where id='ph1_ok') = 'paid', :'r');
select pg_temp.chk('T17b ... and the paid order is still paid', (select status from public.orders where id='ph1_ok') = 'paid');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.orders set status='failed', updated_at=now() where id='ph1_cheat'$$) as r \gset
select pg_temp.chk('T18 student can still cancel/fail their own pending order (app compatibility)',
  :'r' = 'OK' and (select status from public.orders where id='ph1_cheat') = 'failed', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000003',
  $$update public.orders set status='cancelled' where id='ph1_swap'$$) as r \gset
select pg_temp.chk('T19 another student cannot touch someone else''s order',
  (select status from public.orders where id='ph1_swap') = 'created', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$insert into public.purchases(id,user_id,scope,status,order_id) values ('ph1_pu','a1000000-0000-0000-0000-000000000001','year','success','ph1_cheat')$$) as r \gset
select pg_temp.chk('T20 student cannot insert purchases', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$delete from public.orders where id='ph1_ok'$$) as r \gset
select pg_temp.chk('T21 student cannot delete orders', (select count(*) from public.orders where id='ph1_ok') = 1, :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$delete from public.purchases where order_id='ph1_ok'$$) as r \gset
select pg_temp.chk('T22 student cannot delete purchases', (select count(*) from public.purchases where order_id='ph1_ok') = 1, :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000002',
  $$update public.orders set status='refunded' where id='ph1_ok'$$) as r \gset
select pg_temp.chk('T23 admin can still change order status (refund)', :'r' = 'OK' and (select status from public.orders where id='ph1_ok') = 'refunded', :'r');

-- ---- 4. profiles -----------------------------------------------------------
select set_config('app.allow_profile_admin_fields', 'true', true) as _bypass \gset
update public.profiles set blocked = true where id = 'a1000000-0000-0000-0000-000000000001';
select set_config('app.allow_profile_admin_fields', 'false', true) as _bypass \gset
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.profiles set blocked=false where id='a1000000-0000-0000-0000-000000000001'$$) as r \gset
select pg_temp.chk('T24 student cannot unblock themselves',
  (select blocked from public.profiles where id='a1000000-0000-0000-0000-000000000001') = true, :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.profiles set referral_code='HACKED1' where id='a1000000-0000-0000-0000-000000000001'$$) as r \gset
select pg_temp.chk('T25 student cannot change their referral_code', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.profiles set name='New Name', college='X' where id='a1000000-0000-0000-0000-000000000001'$$) as r \gset
select pg_temp.chk('T26 student can still edit own name/college',
  :'r' = 'OK' and (select name from public.profiles where id='a1000000-0000-0000-0000-000000000001') = 'New Name', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000001',
  $$update public.profiles set name='Hijack' where id='a1000000-0000-0000-0000-000000000003'$$) as r \gset
select pg_temp.chk('T27 student cannot edit another user''s profile',
  (select name from public.profiles where id='a1000000-0000-0000-0000-000000000003') <> 'Hijack', :'r');
select pg_temp.attempt('authenticated', 'a1000000-0000-0000-0000-000000000002',
  $$update public.profiles set blocked=false where id='a1000000-0000-0000-0000-000000000001'$$) as r \gset
select pg_temp.chk('T28 admin can unblock a user',
  (select blocked from public.profiles where id='a1000000-0000-0000-0000-000000000001') = false, :'r');

-- ---- 5. storage is UNCHANGED by Phase 1A (bucket + legacy policy stay until 1B)
select pg_temp.chk('T29 1A leaves the legacy notes/thumbnails public-read policy in place (removed in 1B)',
  exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname = 'public read notes/thumbnails'));
select pg_temp.chk('T30 course-aware notes_read_if_purchased policy is present',
  exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname = 'notes_read_if_purchased'));
select pg_temp.chk('T31 thumbnails stay publicly readable',
  exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('public read thumbnails','public read notes/thumbnails')));
create function pg_temp.visible_objects(p_role text, p_uid uuid) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  select count(*) into n from storage.objects where bucket_id='notes' and name='ph1_file.pdf';
  execute 'reset role';
  return n;
end $$;
update public.orders set status='paid' where id='ph1_ok';   -- put fixture back (superuser)
select pg_temp.chk('T33 buyer can see the note file (signed URL works)',
  pg_temp.visible_objects('authenticated', 'a1000000-0000-0000-0000-000000000001') = 1);
select pg_temp.chk('T35 admin can see the note file',
  pg_temp.visible_objects('authenticated', 'a1000000-0000-0000-0000-000000000002') = 1);

-- ---- 6. no other privileged function is exposed ---------------------------
select pg_temp.chk('T36 erase_user_data / purge_* are not client-callable',
  not has_function_privilege('anon', 'public.erase_user_data(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.erase_user_data(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_old_payment_sessions()', 'execute')
  and not has_function_privilege('authenticated', 'public.purge_old_analytics_events()', 'execute'));
select pg_temp.chk('T37 delete_my_account() kept for old builds: signed-in only, not anon',
  to_regprocedure('public.delete_my_account()') is not null
  and has_function_privilege('authenticated', 'public.delete_my_account()', 'execute')
  and not has_function_privilege('anon', 'public.delete_my_account()', 'execute'));

-- ---- report ----------------------------------------------------------------
\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else detail end as detail
from ph1_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from ph1_results;
rollback;
