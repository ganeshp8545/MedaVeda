-- LOW fix (migration 20260930110000): removed grants, and everything that must still work.
begin;
create temp table res(name text, ok boolean);
grant all on res to public;
create or replace function pg_temp.check(n text, ok boolean) returns void language sql as $$ insert into res values (n, coalesce(ok,false)) $$;
create or replace function pg_temp.run(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $$
declare err text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text,''), true);
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; err := null; exception when others then err := sqlstate || ':' || sqlerrm; end;
  reset role;
  return err;
end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','ta@example.com'),
  ('adadadad-0000-0000-0000-00000000000d','admin@example.com') on conflict do nothing;
insert into public.admins (id, email) values ('adadadad-0000-0000-0000-00000000000d','admin@example.com') on conflict do nothing;

do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; adm constant uuid := 'adadadad-0000-0000-0000-00000000000d'; e text;
begin
  -- removed: a student (or admin session) cannot write these tables, even for an admin the privilege is gone
  perform pg_temp.check('student cannot INSERT into admins', pg_temp.run('authenticated', a, $q$insert into public.admins (id,email) values (gen_random_uuid(),'x@x')$q$) like '42501:%');
  perform pg_temp.check('admin session cannot write admins either (managed in SQL/dashboard)', pg_temp.run('authenticated', adm, $q$delete from public.admins$q$) like '42501:%');
  perform pg_temp.check('student cannot INSERT/UPDATE referrals', pg_temp.run('authenticated', a, $q$update public.referrals set status='rewarded'$q$) like '42501:%'
     and pg_temp.run('authenticated', a, $q$insert into public.referrals (id) values (gen_random_uuid())$q$) like '42501:%');
  perform pg_temp.check('an admin can still write notifications (kept on purpose)', pg_temp.run('authenticated', adm, $q$insert into public.notifications (title, body) values ('x','y')$q$) is null
     and pg_temp.run('authenticated', a, $q$insert into public.notifications (title, body) values ('x','y')$q$) like '42501:%');
  perform pg_temp.check('analytics_events cannot be updated or deleted by a client', pg_temp.run('authenticated', a, $q$delete from public.analytics_events$q$) like '42501:%'
     and pg_temp.run('authenticated', a, $q$update public.analytics_events set name='x'$q$) like '42501:%');
  perform pg_temp.check('profiles cannot be inserted or deleted by a client', pg_temp.run('authenticated', a, $q$delete from public.profiles$q$) like '42501:%'
     and pg_temp.run('authenticated', a, $q$insert into public.profiles (id, email) values (gen_random_uuid(),'x@x')$q$) like '42501:%');
  perform pg_temp.check('referral_settings cannot be inserted/deleted', pg_temp.run('authenticated', adm, $q$delete from public.referral_settings$q$) like '42501:%');

  -- still works: everything the apps do
  perform pg_temp.check('student can still update own profile name', pg_temp.run('authenticated', a, $q$update public.profiles set name='N' where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$) is null);
  perform pg_temp.check('student can still log analytics', pg_temp.run('authenticated', a, $q$insert into public.analytics_events (name, params, user_id) values ('e','{}','aaaaaaaa-0000-0000-0000-00000000000a')$q$) is null);
  perform pg_temp.check('sync engine upsert on quiz_scores still works (INSERT then replay = UPDATE)',
     pg_temp.run('authenticated', a, $q$insert into public.quiz_scores (id, user_id, score, total, percentage) values ('qs1','aaaaaaaa-0000-0000-0000-00000000000a',1,2,50) on conflict (id) do update set score = excluded.score$q$) is null
     and pg_temp.run('authenticated', a, $q$insert into public.quiz_scores (id, user_id, score, total, percentage) values ('qs1','aaaaaaaa-0000-0000-0000-00000000000a',2,2,100) on conflict (id) do update set score = excluded.score$q$) is null);
  perform pg_temp.check('legacy direct push-token upsert still works', pg_temp.run('authenticated', a, $q$insert into public.push_tokens (user_id, expo_push_token, platform) values ('aaaaaaaa-0000-0000-0000-00000000000a','ExponentPushToken[legacy-upsert-0001]','android') on conflict (expo_push_token) do update set updated_at = now()$q$) is null);
  perform pg_temp.check('admin can still edit content and settings',
     pg_temp.run('authenticated', adm, $q$update public.courses set active = active$q$) is null
     and pg_temp.run('authenticated', adm, $q$update public.referral_settings set enabled = enabled where id = true$q$) is null
     and pg_temp.run('authenticated', adm, $q$update public.profiles set blocked = false where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$) is null
     and pg_temp.run('authenticated', adm, $q$update public.app_config set value = value$q$) is null);
  perform pg_temp.check('admin can still call the referral / flag RPCs (execute kept)',
     has_function_privilege('authenticated','public.admin_reject_referral(uuid,text)','execute'));

  -- anon
  perform pg_temp.check('anon can still read what the app needs before login',
     pg_temp.run('anon', null, $q$select count(*) from public.courses$q$) is null
     and pg_temp.run('anon', null, $q$select count(*) from public.years$q$) is null
     and pg_temp.run('anon', null, $q$select count(*) from public.notifications$q$) is null
     and pg_temp.run('anon', null, $q$select count(*) from public.app_config$q$) is null);
  perform pg_temp.check('anon can still log a pre-login analytics event', pg_temp.run('anon', null, $q$insert into public.analytics_events (name, params, user_id) values ('pre_login','{}',null)$q$) is null);
  perform pg_temp.check('anon has no SELECT on private tables (permission denied, not just empty)',
     pg_temp.run('anon', null, $q$select 1 from public.profiles$q$) like '42501:%'
     and pg_temp.run('anon', null, $q$select 1 from public.orders$q$) like '42501:%'
     and pg_temp.run('anon', null, $q$select 1 from public.admins$q$) like '42501:%'
     and pg_temp.run('anon', null, $q$select 1 from public.purchases$q$) like '42501:%');
  perform pg_temp.check('no table outside the four public ones is readable by anon',
     not exists (select 1 from pg_class c where relnamespace='public'::regnamespace and relkind in ('r','p')
                 and relname not in ('courses','years','notifications','app_config') and has_table_privilege('anon', c.oid, 'select')));
  perform pg_temp.check('anon can list storage objects (public thumbnails bucket) without an error',
     pg_temp.run('anon', null, $q$select count(*) from storage.objects where bucket_id = 'thumbnails'$q$) is null
     and pg_temp.run('anon', null, $q$select count(*) from storage.objects where bucket_id = 'notes'$q$) is null);
  perform pg_temp.check('students still read their own rows (RLS unchanged)',
     pg_temp.run('authenticated', a, $q$select count(*) from public.profiles where id = auth.uid()$q$) is null);
end $$;

select format('%s: %s', case when ok then 'PASS' else 'FAIL' end, name) from res where not ok;
select (select count(*) from res where not ok) || ' FAIL, ' || (select count(*) from res where ok) || ' PASS';
rollback;
