-- ============================================================================
-- Phase 1A: already-released app builds must keep working.
-- Replays what the Play Store build (versionCode 3, source commit 580db0a and
-- later July builds) does against the backend, AS a signed-in student:
--   reads   years/subjects/chapters/notes/videos/quiz_tests/products (active),
--           own orders / purchases / profile, notifications
--   writes  orders insert + status update, profiles update (name/phone/college/
--           photo_url), quiz_scores upsert, push_tokens upsert/delete,
--           analytics_events insert (also anon)
--   auth    signup with metadata {"name": ...}
--   notes   opens a PDF via a signed URL (needs storage SELECT on the object)
--   delete  delete_my_account() RPC (old RPC contract)
-- Run after Phase 1A:  psql "$DB_URL" -f supabase/tests/phase1a_old_build_compat.sql
-- One transaction, rolled back. Every row must be PASS.
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table cr(name text, ok boolean, detail text);
create function pg_temp.attempt(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; res := 'OK';
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into cr values (p_name, coalesce(p_ok, false), p_detail) $$;
create function pg_temp.cnt(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  execute p_sql into n;
  execute 'reset role';
  return n;
end $$;
\o /dev/null

-- fixtures: a released-build student = course bams, NO year (backfilled legacy student)
insert into auth.users(id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'oldbuild_student@example.com'),
  ('c1000000-0000-0000-0000-000000000002', 'oldbuild_buyer@example.com'),
  ('c1000000-0000-0000-0000-000000000003', 'oldbuild_admin@example.com');
insert into public.admins(id, email) values ('c1000000-0000-0000-0000-000000000003', 'oldbuild_admin@example.com');
insert into public.years(id, title, course_id) values ('oc_y1', 'Y1', 'bams'), ('oc_y2', 'Y2', 'bams');
insert into public.subjects(id, title, year_id) values ('oc_s1', 'S1', 'oc_y1'), ('oc_s2', 'S2', 'oc_y2');
insert into public.chapters(id, title, subject_id) values ('oc_c1', 'C1', 'oc_s1'), ('oc_c2', 'C2', 'oc_s2');
insert into public.notes(id, title, pdf_url, chapter_id) values
  ('oc_n1', 'N1', 'https://x.supabase.co/storage/v1/object/public/notes/oc_1.pdf', 'oc_c1'),
  ('oc_n2', 'N2', 'https://x.supabase.co/storage/v1/object/public/notes/oc_2.pdf', 'oc_c2');
insert into public.videos(id, title, youtube_url, subject_id) values ('oc_v1', 'V1', 'https://youtu.be/x', 'oc_s1');
insert into public.quiz_tests(id, title, subject_id) values ('oc_q1', 'Q1', 'oc_s1');
insert into public.products(id, title, scope, price, chapter_id, active) values ('oc_p', 'P', 'chapter', 49, 'oc_c1', true);
insert into public.products(id, title, scope, price, year_id, active) values ('oc_pyear', 'PY', 'year', 999, 'oc_y2', true);
insert into storage.buckets(id, name, public) values ('notes', 'notes', true) on conflict do nothing;
insert into storage.objects(bucket_id, name) values ('notes', 'oc_1.pdf'), ('notes', 'oc_2.pdf');
select set_config('app.allow_profile_admin_fields', 'true', true) as _b \gset
update public.profiles set course_id = 'bams', year_id = null where id in ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002');
select set_config('app.allow_profile_admin_fields', 'false', true) as _b \gset
-- a buyer of oc_p via the real settlement path
insert into public.orders(id, user_id, product_id, amount, status, scope, chapter_id, razorpay_order_id)
  values ('oc_o1', 'c1000000-0000-0000-0000-000000000002', 'oc_p', 49, 'created', 'chapter', 'oc_c1', 'order_OCOLDBUILD0001');
insert into public.payment_sessions(id, order_id, user_id, product_id, expires_at, used)
  values (gen_random_uuid(), 'oc_o1', 'c1000000-0000-0000-0000-000000000002', 'oc_p', now() + interval '1h', true);
select public.grant_razorpay_payment('e_oc', 'order_OCOLDBUILD0001', 'pay_OCOLDBUILD0001', 4900);

-- ---- reads as the released build's student ---------------------------------
select pg_temp.chk('C1 student (bams, no year) still sees all active years',
  pg_temp.cnt('authenticated', 'c1000000-0000-0000-0000-000000000001', $$select count(*) from public.years where id like 'oc\_%'$$) = 2);
select pg_temp.chk('C2 ... subjects, chapters, notes, videos, quizzes, products',
  pg_temp.cnt('authenticated', 'c1000000-0000-0000-0000-000000000001', $$select (select count(*) from public.subjects where id like 'oc\_%') + (select count(*) from public.chapters where id like 'oc\_%') + (select count(*) from public.notes where id like 'oc\_%') + (select count(*) from public.videos where id like 'oc\_%') + (select count(*) from public.quiz_tests where id like 'oc\_%') + (select count(*) from public.products where id like 'oc\_%')$$) = 2+2+2+1+1+2);
select pg_temp.chk('C3 embedded selects still unambiguous (exactly one FK between each pair)',
  (select bool_and(n = 1) from (
     select count(*) n from pg_constraint c
     where c.contype = 'f' and (c.conrelid::regclass::text, c.confrelid::regclass::text) in
       (('subjects','years'),('chapters','subjects'),('chapters','years'),('videos','subjects'),('videos','years'),
        ('quiz_tests','subjects'),('quiz_tests','years'),('products','subjects'),('products','years'))
     group by c.conrelid, c.confrelid) x)
  and (select count(*) from (select distinct conrelid, confrelid from pg_constraint c where c.contype='f'
         and (c.conrelid::regclass::text, c.confrelid::regclass::text) in
       (('subjects','years'),('chapters','subjects'),('chapters','years'),('videos','subjects'),('videos','years'),
        ('quiz_tests','subjects'),('quiz_tests','years'),('products','subjects'),('products','years'))) y) = 9);
select pg_temp.chk('C4 buyer sees own purchase, order and profile',
  pg_temp.cnt('authenticated', 'c1000000-0000-0000-0000-000000000002', $$select (select count(*) from public.purchases) + (select count(*) from public.orders) + (select count(*) from public.profiles)$$) = 3);

-- ---- writes ----------------------------------------------------------------
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$insert into public.orders(user_id, product_id, scope, amount, status, chapter_id) values ('c1000000-0000-0000-0000-000000000001','oc_p','chapter',49,'created','oc_c1')$$) as r \gset
select pg_temp.chk('C5 order insert with the released build''s exact payload succeeds', :'r' = 'OK', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$update public.orders set status='failed', updated_at=now() where user_id='c1000000-0000-0000-0000-000000000001' and product_id='oc_p'$$) as r \gset
select pg_temp.chk('C6 marking an unpaid order failed still works (app''s cancel path)', :'r' = 'OK'
  and (select status from public.orders where user_id='c1000000-0000-0000-0000-000000000001' and product_id='oc_p') = 'failed', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$update public.profiles set name='Old Build', phone='+919999900001', college='C', photo_url='u' where id='c1000000-0000-0000-0000-000000000001'$$) as r \gset
select pg_temp.chk('C7 EditProfile update (name/phone/college/photo_url) succeeds', :'r' = 'OK'
  and (select name from public.profiles where id='c1000000-0000-0000-0000-000000000001') = 'Old Build', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$insert into public.quiz_scores(id,user_id,email,subject_id,subject_title,test_id,test_title,score,total,percentage) values ('oc_qs','c1000000-0000-0000-0000-000000000001','e@x.com','oc_s1','S1','oc_q1','Q1',3,5,60) on conflict (id) do update set score=excluded.score$$) as r \gset
select pg_temp.chk('C8 quiz_scores upsert succeeds', :'r' = 'OK', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$insert into public.push_tokens(user_id, expo_push_token, platform) values ('c1000000-0000-0000-0000-000000000001','ExponentPushToken[oc]','android') on conflict (expo_push_token) do update set updated_at=now()$$) as r \gset
select pg_temp.chk('C9 push token upsert succeeds', :'r' = 'OK', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000001',
  $$insert into public.analytics_events(name, params, user_id) values ('screen_view','{}','c1000000-0000-0000-0000-000000000001')$$) as r \gset
select pg_temp.chk('C10 analytics insert (signed in) succeeds', :'r' = 'OK', :'r');
select pg_temp.attempt('anon', null, $$insert into public.analytics_events(name, params) values ('screen_view','{}')$$) as r \gset
select pg_temp.chk('C11 analytics insert (anon) succeeds', :'r' = 'OK', :'r');

-- ---- signup with the released build's metadata ------------------------------
insert into auth.users(id, email, raw_user_meta_data) values ('c1000000-0000-0000-0000-000000000009', 'oldbuild_new@example.com', '{"name":"New Student"}');
select pg_temp.chk('C12 signup with {name} creates a profile with the name, default course bams, a referral code',
  (select name from public.profiles where id='c1000000-0000-0000-0000-000000000009') = 'New Student'
  and (select course_id from public.profiles where id='c1000000-0000-0000-0000-000000000009') = 'bams'
  and (select referral_code from public.profiles where id='c1000000-0000-0000-0000-000000000009') is not null);

-- ---- notes -----------------------------------------------------------------
select pg_temp.chk('C13 buyer can create a signed URL for a purchased PDF (storage SELECT allowed)',
  pg_temp.cnt('authenticated', 'c1000000-0000-0000-0000-000000000002', $$select count(*) from storage.objects where bucket_id='notes' and name='oc_1.pdf'$$) = 1);
select pg_temp.chk('C14 free-preview behaviour of the released build is UNCHANGED in 1A (non-buyer can still open the first PDF)',
  pg_temp.cnt('authenticated', 'c1000000-0000-0000-0000-000000000001', $$select count(*) from storage.objects where bucket_id='notes' and name='oc_1.pdf'$$) = 1);

-- ---- delete_my_account (old RPC contract) ------------------------------------
select pg_temp.attempt('anon', null, $$select public.delete_my_account()$$) as r \gset
select pg_temp.chk('C15 anon cannot call delete_my_account', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000003', $$select public.delete_my_account()$$) as r \gset
select pg_temp.chk('C16 admin accounts are refused by delete_my_account', :'r' ilike 'ERR:%admin%' and exists (select 1 from auth.users where id='c1000000-0000-0000-0000-000000000003'), :'r');
select pg_temp.attempt('authenticated', 'c1000000-0000-0000-0000-000000000002', $$select public.delete_my_account()$$) as r \gset
select pg_temp.chk('C17 a student can delete their own account through the old RPC',
  :'r' = 'OK' and not exists (select 1 from auth.users where id='c1000000-0000-0000-0000-000000000002')
  and not exists (select 1 from public.profiles where id='c1000000-0000-0000-0000-000000000002'), :'r');
select pg_temp.chk('C18 ... and payment/order records are retained, anonymised',
  exists (select 1 from public.orders where id='oc_o1' and user_id is null)
  and exists (select 1 from public.payments where order_id='oc_o1' and user_id is null));

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else detail end as detail from cr order by length(name), name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from cr;
rollback;
