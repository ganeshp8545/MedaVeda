-- ============================================================================
-- Tests for 20260920130000_app_config.sql
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/app_config_checks.sql
-- One transaction, rolled back. Same conventions as multi_course_checks.sql.
-- ============================================================================
begin;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-2222-0000-0000-00000000000a', '_test_cfg_student@example.test', 'authenticated', 'authenticated'),
  ('cccccccc-2222-0000-0000-00000000000c', '_test_cfg_admin@example.test', 'authenticated', 'authenticated');
insert into public.admins (id, email) values ('cccccccc-2222-0000-0000-00000000000c', '_test_cfg_admin@example.test');

-- C1. Seeded, and readable by anon.
do $$
declare v text; u text;
begin
  perform pg_temp.act_as_anon();
  select value into v from public.app_config where key = 'min_app_version';
  select value into u from public.app_config where key = 'store_url';
  if v is null or u is null then raise exception 'anon cannot read seeded app_config (min=%, url=%)', v, u; end if;
  perform pg_temp.back();
  raise notice 'PASS C1: anon can read min_app_version (%) and store_url', v;
end $$;

-- C2. Anon cannot write.
do $$
declare failed boolean := false; n int;
begin
  perform pg_temp.act_as_anon();
  begin update public.app_config set value = '99.0.0' where key = 'min_app_version';
        get diagnostics n = row_count; if n > 0 then raise exception 'anon updated a row'; end if;
  exception when insufficient_privilege then failed := true; end;
  perform pg_temp.back();
  if (select value from public.app_config where key = 'min_app_version') = '99.0.0' then
    raise exception 'anon changed min_app_version'; end if;
  raise notice 'PASS C2: anon cannot update app_config';
end $$;

-- C3. A student can read but not update / insert / delete (RLS filters or rejects).
do $$
declare n int; failed boolean;
begin
  perform pg_temp.act_as('aaaaaaaa-2222-0000-0000-00000000000a');
  select count(*) into n from public.app_config where key in ('min_app_version','store_url');
  if n <> 2 then raise exception 'student cannot read app_config'; end if;

  update public.app_config set value = '99.0.0' where key = 'min_app_version';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'student updated % row(s)', n; end if;

  failed := false;
  begin insert into public.app_config (key, value) values ('_test_key', 'x');
  exception when others then failed := true; end;
  if not failed then raise exception 'student inserted into app_config'; end if;

  delete from public.app_config where key = 'store_url';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'student deleted % row(s)', n; end if;

  perform pg_temp.back();
  if (select value from public.app_config where key = 'min_app_version') = '99.0.0' then
    raise exception 'student changed min_app_version'; end if;
  raise notice 'PASS C3: a student can read but cannot insert, update or delete app_config';
end $$;

-- C4. An admin can update, insert and delete; updated_at moves.
do $$
declare v text; t0 timestamptz; t1 timestamptz;
begin
  select updated_at into t0 from public.app_config where key = 'min_app_version';
  perform pg_temp.act_as('cccccccc-2222-0000-0000-00000000000c');
  update public.app_config set value = '1.2.3' where key = 'min_app_version';
  insert into public.app_config (key, value) values ('_test_key', 'x');
  delete from public.app_config where key = '_test_key';
  perform pg_temp.back();
  select value, updated_at into v, t1 from public.app_config where key = 'min_app_version';
  if v <> '1.2.3' then raise exception 'admin update did not apply (got %)', v; end if;
  if exists (select 1 from public.app_config where key = '_test_key') then raise exception 'admin delete did not apply'; end if;
  if t1 <= t0 then raise exception 'updated_at did not advance'; end if;
  raise notice 'PASS C4: an admin can insert, update and delete app_config; updated_at advances';
end $$;

-- C5. Malformed versions / non-https store URLs are rejected even for an admin.
do $$
declare failed boolean;
begin
  perform pg_temp.act_as('cccccccc-2222-0000-0000-00000000000c');
  failed := false;
  begin update public.app_config set value = 'v1.x' where key = 'min_app_version';
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'malformed min_app_version accepted'; end if;
  failed := false;
  begin update public.app_config set value = 'http://evil' where key = 'store_url';
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'non-https store_url accepted'; end if;
  perform pg_temp.back();
  raise notice 'PASS C5: malformed min_app_version and non-https store_url are rejected';
end $$;

rollback;
