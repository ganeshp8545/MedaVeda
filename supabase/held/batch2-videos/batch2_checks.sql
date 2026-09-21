-- ============================================================================
-- Batch 2 checks: paid videos are not readable by students.
-- Run AFTER the (renamed) batch2 migration (min_app_version must already be >= 1.2.0):
--   psql "$DB_URL" -f supabase/tests/batch2_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL".
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table b2_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into b2_results values (p_name, coalesce(p_ok, false), p_detail) $$;
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
\o /dev/null
insert into auth.users(id, email) values
  ('b5000000-0000-0000-0000-000000000001', 'v_stud@example.com'),   -- no purchase
  ('b5000000-0000-0000-0000-000000000002', 'v_buyer@example.com'),  -- bought subject s1
  ('b5000000-0000-0000-0000-000000000003', 'v_blocked@example.com'),
  ('b5000000-0000-0000-0000-000000000004', 'v_adm@example.com');
insert into public.admins(id, email) values ('b5000000-0000-0000-0000-000000000004', 'v_adm@example.com');
\set S '''b5000000-0000-0000-0000-000000000001'''
\set B '''b5000000-0000-0000-0000-000000000002'''
\set X '''b5000000-0000-0000-0000-000000000003'''
\set ADM '''b5000000-0000-0000-0000-000000000004'''
insert into public.years(id, title, course_id) values ('vy', 'V year', 'bams');
insert into public.subjects(id, title, year_id) values ('vs1', 'V subject 1', 'vy'), ('vs2', 'V subject 2', 'vy');
insert into public.videos(id, title, youtube_url, subject_id, year_id, "order", is_free_preview) values
  ('v_free',  'free lecture', 'https://youtu.be/FREEURL', 'vs1', 'vy', 1, true),
  ('v_paid1', 'paid 1 (s1)',  'https://youtu.be/PAIDURL1', 'vs1', 'vy', 2, false),
  ('v_paid2', 'paid 2 (s2)',  'https://youtu.be/PAIDURL2', 'vs2', 'vy', 1, false);
insert into public.purchases(user_id, scope, subject_id, course_id, status, product_id)
  values (:B, 'subject', 'vs1', 'bams', 'success', null);
update public.profiles set blocked = true where id = :X;
insert into public.purchases(user_id, scope, subject_id, course_id, status) values (:X, 'subject', 'vs1', 'bams', 'success');

-- ---- the leak itself ----------------------------------------------------------
select pg_temp.q('authenticated', :S::uuid, $$select string_agg(youtube_url, ',' order by id) from public.videos$$) as r \gset
select pg_temp.chk('V1 a student with NO purchase can read only the free-preview URL from the table', :'r' = 'https://youtu.be/FREEURL', :'r');
select pg_temp.q('authenticated', :S::uuid, $$select count(*)::text from public.videos where youtube_url like '%PAIDURL%'$$) as r \gset
select pg_temp.chk('V2 ... and can read NO paid URL, even by filtering on it', :'r' = '0', :'r');
select pg_temp.q('authenticated', :B::uuid, $$select string_agg(id, ',' order by id) from public.videos$$) as r \gset
select pg_temp.chk('V3 a BUYER also gets paid videos only through the server paths (table shows the free one only)', :'r' = 'v_free', :'r');
select pg_temp.q('authenticated', :ADM::uuid, $$select count(*)::text from public.videos$$) as r \gset
select pg_temp.chk('V4 an admin still reads every row (the admin panel keeps working)', :'r' = '3', :'r');
select pg_temp.q('anon', null, $$select count(*)::text from public.videos$$) as r \gset
select pg_temp.chk('V5 anon reads nothing', :'r' = '0', :'r');

-- ---- the list -----------------------------------------------------------------
select pg_temp.q('authenticated', :S::uuid, $$select string_agg(id || ':' || can_play, ',' order by id) from public.get_videos()$$) as r \gset
select pg_temp.chk('V6 non-buyer: all three lectures are listed, only the free one is playable', :'r' = 'v_free:true,v_paid1:false,v_paid2:false', :'r');
select pg_temp.q('authenticated', :B::uuid, $$select string_agg(id || ':' || can_play, ',' order by id) from public.get_videos()$$) as r \gset
select pg_temp.chk('V7 buyer of subject 1: its lectures are playable, subject 2 is not', :'r' = 'v_free:true,v_paid1:true,v_paid2:false', :'r');
select pg_temp.q('authenticated', :B::uuid, $$select string_agg(id, ',' order by id) from public.get_videos('vs2')$$) as r \gset
select pg_temp.chk('V8 the subject filter works', :'r' = 'v_paid2', :'r');
select pg_temp.q('authenticated', :B::uuid, $$select string_agg(distinct course_id, ',') from public.get_videos(null, 'bams')$$) as r \gset
select pg_temp.chk('V9 the course filter works (search index)', :'r' = 'bams', :'r');
select pg_temp.chk('V10 the list has no URL column at all',
  pg_get_function_result(to_regprocedure('public.get_videos(text,text)')) not ilike '%youtube%'
  and pg_get_function_result(to_regprocedure('public.get_videos(text,text)')) not ilike '%url%');
select pg_temp.q('authenticated', :X::uuid, $$select string_agg(id || ':' || can_play, ',' order by id) from public.get_videos()$$) as r \gset
select pg_temp.chk('V11 a BLOCKED student cannot play even what they bought', :'r' not like '%true%' or :'r' = 'v_free:false,v_paid1:false,v_paid2:false', :'r');
select pg_temp.attempt('anon', null, $$select * from public.get_videos()$$) as r \gset
select pg_temp.chk('V12 anon cannot call get_videos', :'r' like 'ERR:%permission denied%', :'r');
select pg_temp.chk('V13 the entitlement function itself stays server-only',
  not has_function_privilege('authenticated', 'public.user_can_access_video(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.user_can_access_video(uuid,text)', 'execute'));

-- ---- writes are unchanged ------------------------------------------------------
select pg_temp.attempt('authenticated', :S::uuid, $$update public.videos set title = 'hacked'$$) as r \gset
select pg_temp.chk('V14 a student still cannot edit videos',
  (select count(*) from public.videos where title = 'hacked') = 0, :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, $$update public.videos set youtube_url = 'https://youtu.be/NEWURL' where id = 'v_paid1'$$) as r \gset
select pg_temp.chk('V15 an admin can still edit a video (admin panel write path)', :'r' = 'OK'
  and (select youtube_url from public.videos where id = 'v_paid1') = 'https://youtu.be/NEWURL', :'r');

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail from b2_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from b2_results;
rollback;
