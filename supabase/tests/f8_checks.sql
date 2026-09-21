-- ============================================================================
-- F8 checks: excess table privileges are gone, needed ones stay, new tables inherit the safe defaults.
-- Run AFTER 20260927110000_f8_revoke_excess_grants.sql:  psql "$DB_URL" -f supabase/tests/f8_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL".
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table f8_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into f8_results values (p_name, coalesce(p_ok, false), p_detail) $$;
create function pg_temp.dml(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text; n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; res := n::text;
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
create function pg_temp.exec(p_sql text) returns text
language plpgsql as $$ begin execute p_sql; return 'OK'; exception when others then return 'ERR: ' || sqlerrm; end $$;
\o /dev/null
insert into auth.users(id, email) values ('bc000000-0000-0000-0000-000000000001', 'f8_admin@example.com'), ('bc000000-0000-0000-0000-000000000002', 'f8_student@example.com');
insert into public.admins(id, email) values ('bc000000-0000-0000-0000-000000000001', 'f8_admin@example.com');
\set ADM '''bc000000-0000-0000-0000-000000000001'''
\set STU '''bc000000-0000-0000-0000-000000000002'''
insert into public.years(id, title, course_id) values ('f8y', 'y', 'bams');
insert into public.subjects(id, title, year_id) values ('f8s', 's', 'f8y');

-- ---- privileges --------------------------------------------------------------------------
select pg_temp.chk('P1 no public table lets anon or authenticated TRUNCATE / REFERENCES / TRIGGER',
  (select count(*) from pg_class t, unnest(array['anon', 'authenticated']) r, unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p') and has_table_privilege(r, t.oid, p)) = 0);
select pg_temp.chk('P2 anon can write NOTHING except analytics_events (INSERT)',
  (select count(*) from pg_class t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p
    where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p') and has_table_privilege('anon', t.oid, p)
      and not (t.relname = 'analytics_events' and p = 'INSERT')) = 0
  and has_table_privilege('anon', 'public.analytics_events', 'INSERT'));
select pg_temp.chk('P3 service_role keeps everything (TRUNCATE included: the server may need it)',
  (select count(*) from pg_class t where t.relnamespace = 'public'::regnamespace and t.relkind in ('r', 'p') and not has_table_privilege('service_role', t.oid, 'INSERT')) = 0
  and has_table_privilege('service_role', 'public.courses', 'TRUNCATE'));
select pg_temp.chk('P4 authenticated keeps what the app and the admin panel need',
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE') and has_table_privilege('authenticated', 'public.push_tokens', 'INSERT')
  and has_table_privilege('authenticated', 'public.quiz_scores', 'INSERT') and has_table_privilege('authenticated', 'public.analytics_events', 'INSERT')
  and has_table_privilege('authenticated', 'public.chapters', 'INSERT') and has_table_privilege('authenticated', 'public.chapters', 'DELETE')
  and has_table_privilege('authenticated', 'public.products', 'UPDATE') and has_table_privilege('authenticated', 'public.referral_settings', 'UPDATE')
  and has_table_privilege('authenticated', 'public.orders', 'SELECT'));
select pg_temp.chk('P5 the money tables are still read-only for clients (as before)',
  not has_table_privilege('authenticated', 'public.orders', 'INSERT') and not has_table_privilege('authenticated', 'public.purchases', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.wallet_ledger', 'INSERT'));
select pg_temp.chk('P6 an actual TRUNCATE is refused for a student (permission, not just a foreign-key error)',
  pg_temp.dml('authenticated', :STU::uuid, $$truncate public.push_tokens$$) like 'ERR: permission denied%');

-- ---- tables created LATER inherit the safe defaults ---------------------------------------
create table public.f8_probe (id int);
select pg_temp.chk('D1 a NEW public table: no TRUNCATE / REFERENCES / TRIGGER for anon or authenticated, no DML for anon',
  not has_table_privilege('anon', 'public.f8_probe', 'TRUNCATE') and not has_table_privilege('authenticated', 'public.f8_probe', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.f8_probe', 'REFERENCES') and not has_table_privilege('authenticated', 'public.f8_probe', 'TRIGGER')
  and not has_table_privilege('anon', 'public.f8_probe', 'INSERT') and not has_table_privilege('anon', 'public.f8_probe', 'UPDATE') and not has_table_privilege('anon', 'public.f8_probe', 'DELETE'));

-- ---- the real client paths still work ------------------------------------------------------
select pg_temp.chk('F1 anon can still log a pre-login analytics event', pg_temp.dml('anon', null, $$insert into public.analytics_events(name) values ('pre_login')$$) = '1');
select pg_temp.chk('F2 anon can still read courses / app_config', pg_temp.dml('anon', null, $$select 1 from public.courses$$) is not null
  and pg_temp.dml('anon', null, $$select 1 from public.app_config$$) not like 'ERR:%');
select pg_temp.chk('F3 anon still cannot write anything else', pg_temp.dml('anon', null, $$insert into public.profiles(id, email) values (gen_random_uuid(), 'x@x')$$) like 'ERR:%');
select pg_temp.chk('F4 a student can still update their own profile', pg_temp.dml('authenticated', :STU::uuid, format($$update public.profiles set name = 'N' where id = %L$$, :STU)) = '1');
select pg_temp.chk('F5 a student can still register a push token',
  pg_temp.dml('authenticated', :STU::uuid, format($$insert into public.push_tokens(user_id, expo_push_token, platform) values (%L, 'ExponentPushToken[f8-test-token-01]', 'android')$$, :STU)) = '1');
select pg_temp.chk('F6 a student can still save a quiz score',
  pg_temp.dml('authenticated', :STU::uuid, format($$insert into public.quiz_scores(id, user_id, score, total, percentage) values ('f8q', %L, 1, 2, 50)$$, :STU)) = '1');
select pg_temp.chk('F7 a student can still log an event as themselves',
  pg_temp.dml('authenticated', :STU::uuid, format($$insert into public.analytics_events(name, user_id) values ('x', %L)$$, :STU)) = '1');
select pg_temp.chk('F8 an admin can still write chapters and products (the admin panel is an authenticated session)',
  pg_temp.dml('authenticated', :ADM::uuid, $$insert into public.chapters(id, title, subject_id) values ('f8c', 'c', 'f8s')$$) = '1'
  and pg_temp.dml('authenticated', :ADM::uuid, $$delete from public.chapters where id = 'f8c'$$) = '1');
select pg_temp.chk('F9 an admin can still edit referral settings', pg_temp.dml('authenticated', :ADM::uuid, $$update public.referral_settings set enabled = enabled$$) = '1');
select pg_temp.chk('F10 the SECURITY DEFINER RPCs students use still run',
  pg_temp.dml('authenticated', :STU::uuid, $$select public.get_my_wallet()$$) not like 'ERR:%');

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail from f8_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from f8_results;
rollback;
