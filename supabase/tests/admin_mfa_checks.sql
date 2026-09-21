-- Admin MFA / AAL2 (migration 20261001100000): am_i_admin() and the RPC/RLS built on it.
begin;
create temp table res(name text, ok boolean);
grant all on res to public;
create or replace function pg_temp.check(n text, ok boolean) returns void language sql as $$ insert into res values (n, coalesce(ok,false)) $$;
-- run a query as a role with a chosen uid and JWT aal claim; returns 'null' text on success or the error
create or replace function pg_temp.scalar(p_role text, p_uid uuid, p_aal text, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text,''), true);
  perform set_config('request.jwt.claims', case when p_uid is null then '{}'
     else json_build_object('sub', p_uid, 'role', p_role, 'aal', p_aal)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into r; exception when others then r := 'ERR ' || sqlstate; end;
  reset role;
  return r;
end $$;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','student@example.com'),
  ('adadadad-0000-0000-0000-00000000000d','admin1@example.com'),
  ('adadadad-0000-0000-0000-00000000000e','admin2@example.com') on conflict do nothing;
insert into public.admins (id, email) values
  ('adadadad-0000-0000-0000-00000000000d','admin1@example.com'),
  ('adadadad-0000-0000-0000-00000000000e','admin2@example.com') on conflict do nothing;

do $$
declare s constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
        a1 constant uuid := 'adadadad-0000-0000-0000-00000000000d';
        a2 constant uuid := 'adadadad-0000-0000-0000-00000000000e';
        q constant text := 'select public.am_i_admin()';
        w constant text := 'select count(*) from public.order_review_flags';
        r text;
begin
  -- 0. shipped default: requirement OFF -> nothing changes for existing admins (no lock-out)
  perform pg_temp.check('default: require_mfa is false', (select require_mfa from public.admin_settings) = false);
  perform pg_temp.check('OFF: admin at aal1 is still admin', pg_temp.scalar('authenticated', a1, 'aal1', q) = 'true');
  perform pg_temp.check('OFF: student is not admin', pg_temp.scalar('authenticated', s, 'aal1', q) = 'false');
  perform pg_temp.check('OFF: anonymous is not admin', pg_temp.scalar('anon', null, null, q) = 'false');

  -- 1. cannot switch on while an admin has no verified factor
  begin perform public.set_admin_mfa_required(true); r := 'switched'; exception when others then r := 'refused'; end;
  perform pg_temp.check('cannot enable while admins have no verified factor', r = 'refused');
  insert into auth.mfa_factors (user_id, status) values (a1, 'verified'), (a2, 'unverified');
  begin perform public.set_admin_mfa_required(true); r := 'switched'; exception when others then r := 'refused'; end;
  perform pg_temp.check('an UNVERIFIED factor does not count', r = 'refused');
  update auth.mfa_factors set status = 'verified' where user_id = a2;
  perform pg_temp.check('enables once every admin has a verified factor', public.set_admin_mfa_required(true) like '%REQUIRED');

  -- 2. requirement ON
  perform pg_temp.check('ON: admin WITHOUT aal2 (aal1) -> denied', pg_temp.scalar('authenticated', a1, 'aal1', q) = 'false');
  perform pg_temp.check('ON: admin with no aal claim -> denied', pg_temp.scalar('authenticated', a1, null, q) = 'false');
  perform pg_temp.check('ON: admin WITH aal2 -> allowed', pg_temp.scalar('authenticated', a1, 'aal2', q) = 'true');
  perform pg_temp.check('ON: student at aal2 -> denied', pg_temp.scalar('authenticated', s, 'aal2', q) = 'false');
  perform pg_temp.check('ON: student at aal1 -> denied', pg_temp.scalar('authenticated', s, 'aal1', q) = 'false');
  perform pg_temp.check('ON: anonymous -> denied', pg_temp.scalar('anon', null, null, q) = 'false');
  perform pg_temp.check('ON: forged aal claim value is not accepted (aal3/AAL2/true)',
     pg_temp.scalar('authenticated', a1, 'AAL2', q) = 'false' and pg_temp.scalar('authenticated', a1, 'true', q) = 'false');

  -- 3. the policies built on am_i_admin follow it (notifications: admin-only writes)
  perform pg_temp.check('ON: RLS write as admin aal1 -> denied',
     pg_temp.scalar('authenticated', a1, 'aal1', $x$insert into public.notifications (title, body) values ('t','b') returning 'ok'$x$) = 'ERR 42501');
  perform pg_temp.check('ON: RLS write as admin aal2 -> allowed',
     pg_temp.scalar('authenticated', a1, 'aal2', $x$insert into public.notifications (title, body) values ('t','b') returning 'ok'$x$) = 'ok');
  perform pg_temp.check('ON: RLS write as student aal2 -> denied',
     pg_temp.scalar('authenticated', s, 'aal2', $x$insert into public.notifications (title, body) values ('t','b') returning 'ok'$x$) = 'ERR 42501');
  perform pg_temp.check('ON: is_admin_account() still true for admin at aal1 (panel can route to MFA)', pg_temp.scalar('authenticated', a1, 'aal1', 'select public.is_admin_account()') = 'true');
  perform pg_temp.check('is_admin_account() false for student, not callable by anon',
     pg_temp.scalar('authenticated', s, 'aal2', 'select public.is_admin_account()') = 'false' and pg_temp.scalar('anon', null, null, 'select public.is_admin_account()') = 'ERR 42501');

  -- 4. no API role can read or flip the switch
  perform pg_temp.check('clients cannot read/write admin_settings',
     pg_temp.scalar('authenticated', a1, 'aal2', 'select require_mfa::text from public.admin_settings') = 'ERR 42501'
     and pg_temp.scalar('authenticated', a1, 'aal2', 'update public.admin_settings set require_mfa = false') = 'ERR 42501'
     and pg_temp.scalar('anon', null, null, 'select require_mfa::text from public.admin_settings') = 'ERR 42501');
  perform pg_temp.check('clients cannot call set_admin_mfa_required / admin_mfa_required',
     pg_temp.scalar('authenticated', a1, 'aal2', 'select public.set_admin_mfa_required(false)') = 'ERR 42501'
     and pg_temp.scalar('anon', null, null, 'select public.set_admin_mfa_required(false)') = 'ERR 42501'
     and pg_temp.scalar('authenticated', a1, 'aal2', 'select public.admin_mfa_required()') = 'ERR 42501');

  -- 5. break-glass: owner can switch it off again, admins at aal1 are back in
  perform pg_temp.check('owner can switch it off', public.set_admin_mfa_required(false) like '%OFF');
  perform pg_temp.check('OFF again: admin at aal1 allowed', pg_temp.scalar('authenticated', a1, 'aal1', q) = 'true');
end $$;

select case when ok then 'PASS  ' else 'FAIL  ' end || name from res order by ok, name;
select (select count(*) from res where not ok) || ' FAIL, ' || (select count(*) from res where ok) || ' PASS';
rollback;
