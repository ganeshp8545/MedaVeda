-- MEDIUM fixes (migration 20260930100000): pinned search_path, EXECUTE grants, RLS rewrite,
-- FK indexes, abuse limits, register_push_token, phone-verified sync. One rolled-back transaction.
begin;
-- (hosted Supabase already grants this; a plain local restore does not)
grant usage on schema auth to anon, authenticated;
grant insert on public.analytics_events to anon;   -- live has this (F8 keeps it)
create temp table res(name text, ok boolean);
grant all on res to public;
create or replace function pg_temp.check(n text, ok boolean) returns void language sql as $$ insert into res values (n, coalesce(ok,false)) $$;
create or replace function pg_temp.as_user(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare err text;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true);
  set local role authenticated;
  begin execute p_sql; err := null; exception when others then err := sqlstate || ':' || sqlerrm; end;
  reset role;
  return err;
end $$;
create or replace function pg_temp.count_as(p_role text, p_uid uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text,''), true);
  execute format('set local role %I', p_role);
  execute p_sql into n;
  reset role;
  return n;
end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','ta@example.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','tb@example.com') on conflict do nothing;

-- an admin account (a fresh database has none)
insert into auth.users (id, email) values ('adadadad-0000-0000-0000-00000000000d','admin@example.com') on conflict do nothing;
insert into public.admins (id, email) values ('adadadad-0000-0000-0000-00000000000d','admin@example.com') on conflict do nothing;

-- 1 search_path -------------------------------------------------------------------------
select pg_temp.check('search_path pinned on all 5 flagged functions',
  (select count(*) from pg_proc p where pronamespace='public'::regnamespace
     and proname in ('normalize_phone','app_config_touch_updated_at','orders_immutable_columns','wallet_ledger_append_only','wallet_ledger_no_truncate')
     and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')) = 5);
select pg_temp.check('normalize_phone still works', public.normalize_phone('+91 98765-43210') = '+919876543210');

-- 2 EXECUTE -------------------------------------------------------------------------------
select pg_temp.check('no trigger function in public is executable by anon/authenticated',
  not exists (select 1 from pg_proc p where pronamespace='public'::regnamespace and prorettype in ('trigger'::regtype,'event_trigger'::regtype)
              and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))));
select pg_temp.check('anon cannot execute set_my_course_year / my_course_id / has_content_access',
  not has_function_privilege('anon','public.set_my_course_year(text,text)','execute')
  and not has_function_privilege('anon','public.my_course_id()','execute')
  and not has_function_privilege('anon','public.has_content_access(text,text)','execute'));
select pg_temp.check('authenticated still can', has_function_privilege('authenticated','public.set_my_course_year(text,text)','execute')
  and has_function_privilege('authenticated','public.has_content_access(text,text)','execute'));
select pg_temp.check('anon keeps am_i_admin + user_owns_chapter (used by public-role RLS)',
  has_function_privilege('anon','public.am_i_admin()','execute') and has_function_privilege('anon','public.user_owns_chapter(text)','execute'));
select pg_temp.check('anon can still read courses / years / notifications (policies still evaluate)',
  pg_temp.count_as('anon', null, 'select count(*) from public.courses') >= 0
  and pg_temp.count_as('anon', null, 'select count(*) from public.years') >= 0
  and pg_temp.count_as('anon', null, 'select count(*) from public.notifications') >= 0
  and pg_temp.count_as('anon', null, 'select count(*) from public.app_config') >= 0);
select pg_temp.check('a new signup still creates a profile (handle_new_user trigger fires without EXECUTE)',
  exists (select 1 from public.profiles where id='aaaaaaaa-0000-0000-0000-00000000000a'));

-- 3-4 RLS rewrite / duplicates -----------------------------------------------------------------
select pg_temp.check('no policy left with a bare auth.uid()',
  not exists (select 1 from pg_policies where schemaname='public'
    and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\.uid\(\)'
    and (coalesce(qual,'')||coalesce(with_check,'')) !~* 'select auth\.uid\(\)'));
select pg_temp.check('duplicate policies gone',
  (select count(*) from pg_policies where policyname in ('Admins can view all orders','Users can view own orders','Admins can view all payments',
     'Admins can view all purchases','Users can view own purchases','Users manage their own push tokens','user write own quiz_scores')) = 0);
do $$
declare v_buyer uuid; v_n_own bigint; v_n_all bigint; v_n_other bigint;
begin
  select user_id into v_buyer from public.purchases where user_id is not null and not exists (select 1 from public.admins a where a.id=user_id) limit 1;
  select count(*) into v_n_all from public.purchases where user_id = v_buyer;
  v_n_own := pg_temp.count_as('authenticated', v_buyer, 'select count(*) from public.purchases');
  v_n_other := pg_temp.count_as('authenticated', 'bbbbbbbb-0000-0000-0000-00000000000b', 'select count(*) from public.purchases');
  perform pg_temp.check('student sees exactly their own purchases', v_n_own = v_n_all and v_n_all > 0);
  perform pg_temp.check('another student sees none of them', v_n_other = 0);
  perform pg_temp.check('student sees only own orders', pg_temp.count_as('authenticated', v_buyer, 'select count(*) from public.orders where user_id is distinct from auth.uid()') = 0);
  perform pg_temp.check('admin still sees all purchases',
    pg_temp.count_as('authenticated', (select id from public.admins limit 1), 'select count(*) from public.purchases') = (select count(*) from public.purchases));
  perform pg_temp.check('student can read own profile only',
    pg_temp.count_as('authenticated', 'bbbbbbbb-0000-0000-0000-00000000000b', 'select count(*) from public.profiles') = 1);
end $$;

-- 5 FK indexes ----------------------------------------------------------------------------------
select pg_temp.check('every single-column foreign key has an index',
  not exists (select 1 from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1
     and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])));

-- 6 quiz_scores limit --------------------------------------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b'; i int; e text; okc int := 0;
begin
  for i in 1..120 loop
    e := pg_temp.as_user(a, format($q$insert into public.quiz_scores (user_id, score, total, percentage) values (%L, 1, 2, 50)$q$, a));
    if e is null then okc := okc + 1; end if;
  end loop;
  perform pg_temp.check('quiz_scores: 120 inserts per hour allowed', okc = 120);
  e := pg_temp.as_user(a, format($q$insert into public.quiz_scores (user_id, score, total, percentage) values (%L, 1, 2, 50)$q$, a));
  perform pg_temp.check('quiz_scores: 121st refused (54000)', e like '54000:%');
  e := pg_temp.as_user(b, format($q$insert into public.quiz_scores (user_id, score, total, percentage) values (%L, 1, 2, 50)$q$, b));
  perform pg_temp.check('quiz_scores: another user unaffected', e is null);
  e := pg_temp.as_user(b, format($q$insert into public.quiz_scores (user_id, score, total, percentage) values (%L, 1, 2, 50)$q$, a));
  perform pg_temp.check('quiz_scores: still cannot write for someone else', e is not null);
end $$;

-- 6 analytics limit -------------------------------------------------------------------------------------
do $$
declare i int; n bigint; e text;
begin
  delete from public.analytics_events;
  set local role anon;
  for i in 1..320 loop insert into public.analytics_events (name, params, user_id) values ('e', '{}', null); end loop;
  reset role;
  select count(*) into n from public.analytics_events;
  perform pg_temp.check('analytics: anon flood capped at 300/min, no error raised', n = 300);
  e := pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a',
     $q$insert into public.analytics_events (name, params, user_id) values ('x','{}','aaaaaaaa-0000-0000-0000-00000000000a')$q$);
  perform pg_temp.check('analytics: signed-in user can still log',
     e is null and exists (select 1 from public.analytics_events where user_id='aaaaaaaa-0000-0000-0000-00000000000a'));
end $$;

-- 6-7 push tokens ---------------------------------------------------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b'; e text; i int; n bigint;
begin
  e := pg_temp.as_user(a, $q$insert into public.push_tokens (user_id, expo_push_token, platform) values ('aaaaaaaa-0000-0000-0000-00000000000a','garbage','android')$q$);
  perform pg_temp.check('push_tokens: junk token refused by table constraint', e like '23514:%');
  e := pg_temp.as_user(a, $q$select public.register_push_token('ExponentPushToken[abcdefghij1234]','android')$q$);
  perform pg_temp.check('register_push_token: A registers a device', e is null and (select user_id from public.push_tokens where expo_push_token='ExponentPushToken[abcdefghij1234]') = a);
  e := pg_temp.as_user(b, $q$select public.register_push_token('ExponentPushToken[abcdefghij1234]','android')$q$);
  perform pg_temp.check('register_push_token: shared device -> token moves to B, A no longer gets B''s pushes',
     e is null and (select user_id from public.push_tokens where expo_push_token='ExponentPushToken[abcdefghij1234]') = b
     and (select count(*) from public.push_tokens where user_id = a) = 0);
  e := pg_temp.as_user(a, $q$select public.register_push_token('nope','android')$q$);
  perform pg_temp.check('register_push_token: invalid token refused', e like '22023:%');
  e := pg_temp.as_user(a, $q$select public.register_push_token('ExponentPushToken[abcdefghij9999]','desktop')$q$);
  perform pg_temp.check('register_push_token: invalid platform refused', e like '22023:%');
  for i in 1..12 loop
    perform pg_temp.as_user(a, format($q$select public.register_push_token('ExponentPushToken[device%s-0123456789]','android')$q$, lpad(i::text,2,'0')));
  end loop;
  select count(*) into n from public.push_tokens where user_id = a;
  perform pg_temp.check('register_push_token: keeps at most 10 devices per user', n = 10);
  e := pg_temp.as_user(a, $q$insert into public.push_tokens (user_id, expo_push_token, platform) values ('aaaaaaaa-0000-0000-0000-00000000000a','ExponentPushToken[direct-insert-000]','android')$q$);
  perform pg_temp.check('push_tokens: direct insert beyond the cap refused', e like '54000:%');
  begin set local role anon; perform public.register_push_token('ExponentPushToken[abcdefghij0000]','android'); reset role; perform pg_temp.check('anon cannot register tokens', false);
  exception when others then reset role; perform pg_temp.check('anon cannot register tokens', true); end;
end $$;

-- 8 phone verified sync ------------------------------------------------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a'; b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
begin
  update auth.users set phone = '919876500001', phone_confirmed_at = now() where id = a;
  perform pg_temp.check('Auth-confirmed phone -> profile phone set and mobile_verified = true',
    (select phone = '+919876500001' and mobile_verified from public.profiles where id = a));
  perform pg_temp.check('bypass flag not left on', pg_temp.as_user(a, $q$update public.profiles set mobile_verified = false where id='aaaaaaaa-0000-0000-0000-00000000000a'$q$) like '42501:%');
  -- a squatter (B) holds +919876500003 unverified on the profile; the real owner (C) confirms it through Auth
  update public.profiles set phone = '+919876500003' where id = b;
  insert into auth.users (id, email) values ('cccccccc-0000-0000-0000-00000000000c','tc@example.com');
  update auth.users set phone = '919876500003', phone_confirmed_at = now() where id = 'cccccccc-0000-0000-0000-00000000000c';
  perform pg_temp.check('number held by another profile -> confirmation does not error, C stays unverified, B keeps it unverified',
    (select not mobile_verified from public.profiles where id = 'cccccccc-0000-0000-0000-00000000000c')
    and (select not mobile_verified and phone = '+919876500003' from public.profiles where id = b));
  update auth.users set phone = '919876500002', phone_confirmed_at = null where id = b;
  perform pg_temp.check('unconfirmed phone changes nothing', (select not mobile_verified from public.profiles where id = b));
end $$;

select format('%s: %s', case when ok then 'PASS' else 'FAIL' end, name) from res where not ok;
select (select count(*) from res where not ok) || ' FAIL, ' || (select count(*) from res where ok) || ' PASS';
rollback;
