-- ============================================================================
-- F7 checks: the legacy e-mail admin path and is_admin() are gone; admins (by id) lose nothing.
-- Run AFTER 20260927100000_f7_drop_legacy_admin_policies.sql:  psql "$DB_URL" -f supabase/tests/f7_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL".
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table f7_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into f7_results values (p_name, coalesce(p_ok, false), p_detail) $$;
-- run a statement as a role, with an e-mail claim; returns rows affected, or ERR
create function pg_temp.dml(p_role text, p_uid uuid, p_email text, p_sql text) returns text
language plpgsql as $$
declare res text; n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'email', p_email)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; res := n::text;
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
create function pg_temp.q(p_role text, p_uid uuid, p_email text, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role, 'email', p_email)::text, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into res; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return coalesce(res, '<null>');
end $$;
create function pg_temp.exec(p_sql text) returns text
language plpgsql as $$ begin execute p_sql; return 'OK'; exception when others then return 'ERR: ' || sqlerrm; end $$;

\o /dev/null
insert into auth.users(id, email) values
  ('bb000000-0000-0000-0000-000000000001', 'f7_admin@example.com'),     -- a real admin (by id)
  ('bb000000-0000-0000-0000-000000000002', 'f7_student@example.com'),
  ('bb000000-0000-0000-0000-000000000003', 'f7_lookalike@example.com'); -- NOT an admin, but will carry the admin's e-mail in its JWT
insert into public.admins(id, email) values ('bb000000-0000-0000-0000-000000000001', 'f7_admin@example.com');
\set ADM '''bb000000-0000-0000-0000-000000000001'''
\set STU '''bb000000-0000-0000-0000-000000000002'''
\set FAKE '''bb000000-0000-0000-0000-000000000003'''
insert into public.years(id, title, course_id) values ('f7y', 'F7 year', 'bams');
insert into public.subjects(id, title, year_id) values ('f7s', 'F7 subject', 'f7y');
insert into public.chapters(id, title, subject_id) values ('f7c', 'F7 chapter', 'f7s');
insert into public.products(id, title, scope, price, chapter_id, active, product_type) values ('f7p', 'F7 product', 'chapter', 100, 'f7c', true, 'notes');
insert into public.videos(id, title, youtube_url, subject_id, year_id) values ('f7v', 'F7 video', 'https://y/x', 'f7s', 'f7y');
insert into public.quiz_tests(id, title, subject_id, year_id) select 'f7q', 'F7 quiz', 'f7s', 'f7y' where exists (select 1 from information_schema.columns where table_name = 'quiz_tests' and column_name = 'year_id');
insert into public.notifications(id, title, body, active) values ('f7n', 't', 'b', true);
select pg_temp.exec($$insert into public.app_settings(id) values (1) on conflict (id) do nothing$$);
select pg_temp.exec($$update public.orders set id = id where false$$);
\set AE 'f7_admin@example.com'

-- ---- the legacy path is gone -----------------------------------------------------------
select pg_temp.chk('A1 is_admin() no longer exists', to_regprocedure('public.is_admin()') is null);
select pg_temp.chk('A2 no policy in public / storage refers to is_admin() or to admins.e-mail',
  (select count(*) from pg_policies where schemaname in ('public', 'storage')
     and coalesce(qual, '') || coalesce(with_check, '') ~ '(is_admin\(\)|admins\.email)') = 0);
select pg_temp.dml('authenticated', :FAKE::uuid, :'AE', $$update public.products set price = 1 where id = 'f7p'$$) as r \gset
select pg_temp.chk('A3 a signed-in user whose JWT e-mail EQUALS the admin''s but whose id is not in admins gets NO admin rights (products)', :'r' = '0', :'r');
select pg_temp.dml('authenticated', :FAKE::uuid, :'AE', $$update public.videos set title = 'x' where id = 'f7v'$$) as r \gset
select pg_temp.chk('A4 ... nor on videos', :'r' = '0', :'r');
select pg_temp.dml('authenticated', :FAKE::uuid, :'AE', $$update public.profiles set name = 'pwned' where id = 'bb000000-0000-0000-0000-000000000002'$$) as r \gset
select pg_temp.chk('A5 ... nor over another student''s profile', :'r' = '0', :'r');
select pg_temp.q('authenticated', :FAKE::uuid, :'AE', $$select count(*)::text from public.profiles$$) as r \gset
select pg_temp.chk('A6 ... and cannot read every profile (sees only its own)', :'r' = '1', :'r');
select pg_temp.dml('authenticated', :FAKE::uuid, :'AE', $$update public.app_settings set app_name = 'pwned'$$) as r \gset
select pg_temp.chk('A7 ... nor app_settings', :'r' = '0', :'r');

-- ---- real admins (by id) lose nothing ---------------------------------------------------
select pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.app_settings set app_name = 'ok'$$) as r \gset
select pg_temp.chk('B1 admin CAN update app_settings (the twin created first)', :'r' = '1', :'r');
select pg_temp.dml('authenticated', :STU::uuid, 'f7_student@example.com', $$update public.app_settings set app_name = 'no'$$) as r \gset
select pg_temp.chk('B2 a student cannot', :'r' = '0', :'r');
select pg_temp.chk('B3 admin can write products',    pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.products set price = 101 where id = 'f7p'$$) = '1');
select pg_temp.chk('B4 admin can write chapters',    pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.chapters set title = 'c2' where id = 'f7c'$$) = '1');
select pg_temp.chk('B5 admin can write subjects',    pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.subjects set title = 's2' where id = 'f7s'$$) = '1');
select pg_temp.chk('B6 admin can write years',       pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.years set title = 'y2' where id = 'f7y'$$) = '1');
select pg_temp.chk('B7 admin can write videos',      pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.videos set title = 'v2' where id = 'f7v'$$) = '1');
select pg_temp.chk('B8 admin can write quiz_tests',  pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.quiz_tests set title = 'q2' where id = 'f7q'$$) = '1');
select pg_temp.chk('B9 admin can write notifications', pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.notifications set title = 'n2' where id = 'f7n'$$) = '1');
select pg_temp.chk('B10 admin can insert a note', pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$insert into public.notes(id, title, pdf_url, chapter_id) values ('f7note', 'n', 'u', 'f7c')$$) = '1');
select pg_temp.chk('B11 admin can update a student''s profile (block/unblock)', pg_temp.dml('authenticated', :ADM::uuid, :'AE', $$update public.profiles set blocked = false where id = 'bb000000-0000-0000-0000-000000000002'$$) = '1');
select pg_temp.q('authenticated', :ADM::uuid, :'AE', $$select (count(*) >= 3)::text from public.profiles$$) as r \gset
select pg_temp.chk('B12 admin still reads every profile', :'r' = 'true', :'r');
select pg_temp.chk('B13 admin still passes am_i_admin()', pg_temp.q('authenticated', :ADM::uuid, :'AE', $$select public.am_i_admin()::text$$) = 'true');

-- ---- students and anon keep what they had -----------------------------------------------
select pg_temp.chk('C1 a student still reads their own profile', pg_temp.q('authenticated', :STU::uuid, 'f7_student@example.com', $$select count(*)::text from public.profiles$$) = '1');
select pg_temp.chk('C2 a student still reads active notifications', pg_temp.q('authenticated', :STU::uuid, 'f7_student@example.com', $$select (count(*) >= 1)::text from public.notifications$$) = 'true');
select pg_temp.chk('C3 anon still reads active notifications and courses',
  pg_temp.q('anon', null, '', $$select (count(*) >= 1)::text from public.notifications$$) = 'true'
  and pg_temp.q('anon', null, '', $$select (count(*) >= 1)::text from public.courses$$) = 'true');
select pg_temp.chk('C4 a student still reads own app_settings row (any signed-in user)', pg_temp.q('authenticated', :STU::uuid, 'f7_student@example.com', $$select count(*)::text from public.app_settings$$) = '1');
select pg_temp.chk('C5 a student still cannot write products', pg_temp.dml('authenticated', :STU::uuid, 'f7_student@example.com', $$update public.products set price = 1$$) = '0');

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail from f7_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from f7_results;
rollback;
