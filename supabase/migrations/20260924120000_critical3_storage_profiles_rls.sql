-- ============================================================================
-- CRITICAL 3 — remaining RLS holes: notes bucket, profiles, "paid" rows
-- ============================================================================
--   A. `notes` storage bucket becomes PRIVATE. Every client-facing read policy
--      on that bucket is dropped; paid PDFs are only reachable through the
--      `get-note-url` Edge Function, which checks entitlement and returns a
--      120 s signed URL. Admin read/write on the bucket is kept.
--      (Thumbnails stay public - they are marketing images.)
--   B. profiles: a student can update only their own row and can never change
--      is_blocked/blocked, role, is_admin, status, verification flags, course /
--      year, or referral_code. Enforced by a BEFORE trigger (role-aware, so
--      service_role, SECURITY DEFINER RPCs and admins are unaffected).
--   C. "Students cannot create or set an order/purchase to paid" is closed by
--      20260924100000 (purchases/payments) and 20260924110000 (orders): no
--      client write policy or privilege remains. Re-asserted + tested here.
-- No rows are modified or deleted. Idempotent. Single transaction.
begin;

-- ---------------------------------------------------------------------------
-- A. notes bucket: private, no client read policy
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id = 'notes';

do $$
declare r record;
begin
  -- Any non-admin policy that mentions the notes bucket, whatever its command.
  for r in
    select policyname, cmd
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') ilike '%notes%'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') not ilike '%am_i_admin%'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'CRITICAL3: dropped storage policy % (%)', r.policyname, r.cmd;
  end loop;

  -- A policy with NO bucket filter would still expose notes. Do not drop other
  -- teams' policies blindly - surface them for review.
  for r in
    select policyname, cmd, roles
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') not ilike '%bucket_id%'
      and coalesce(qual, '') not ilike '%am_i_admin%'
  loop
    raise warning 'CRITICAL3 REVIEW: storage policy "%" (%, roles %) has no bucket_id filter and may expose the notes bucket', r.policyname, r.cmd, r.roles;
  end loop;
end;
$$;

-- Admin access to the bucket (read/upload/delete from the admin panel).
drop policy if exists "notes_admin_write" on storage.objects;
create policy "notes_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'notes' and public.am_i_admin())
  with check (bucket_id = 'notes' and public.am_i_admin());

-- Thumbnails remain public.
drop policy if exists "public read thumbnails" on storage.objects;
create policy "public read thumbnails" on storage.objects
  for select using (bucket_id = 'thumbnails');

-- ---------------------------------------------------------------------------
-- B. profiles: protected columns
-- ---------------------------------------------------------------------------
-- Replaces profiles_before_write() from 20260919120000 §8. Same self-heal of
-- year/course; stronger guard:
--   * checked against a denylist compared through to_jsonb(), so columns that
--     may or may not exist in a given environment (is_blocked, role, is_admin,
--     status, ...) are covered without referencing them by name;
--   * clients are identified by the PostgREST role (anon / authenticated), so
--     service_role, migrations, and definer RPCs that set
--     app.allow_profile_admin_fields (set_my_course_year) still work;
--   * admins (am_i_admin) may edit these fields from the admin panel.
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_course_id text;
  v_client boolean := coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
  v_bypass boolean := coalesce(current_setting('app.allow_profile_admin_fields', true), 'false') = 'true';
  v_is_admin boolean := public.am_i_admin();
  v_protected text[] := array[
    'id', 'blocked', 'is_blocked', 'role', 'is_admin', 'is_staff', 'status',
    'email_verified', 'mobile_verified', 'referral_code', 'course_id', 'year_id',
    'created_at'
  ];
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if v_client and not v_bypass and not v_is_admin then
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
      foreach v_col in array v_protected loop
        if v_new -> v_col is distinct from v_old -> v_col then
          raise exception 'Cannot modify protected profile field "%"', v_col
            using errcode = '42501';
        end if;
      end loop;
    else
      -- A client-created profile row starts unblocked and unverified.
      new.blocked := false;
      new.email_verified := false;
      new.mobile_verified := false;
    end if;
  end if;

  -- Self-heal: if year_id no longer belongs to course_id, clear it.
  if new.year_id is not null then
    select course_id into v_year_course_id from public.years where id = new.year_id;
    if v_year_course_id is null or v_year_course_id is distinct from new.course_id then
      new.year_id := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write
  before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

-- Policies: own row only (re-asserted; Phase 1A already created this).
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "user update own profile" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- C. Self-checks
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from storage.buckets where id = 'notes' and public) then
    raise exception 'CRITICAL3 self-check: notes bucket is still public';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') ilike '%notes%'
      and coalesce(qual, '') not ilike '%am_i_admin%'
  ) then
    raise exception 'CRITICAL3 self-check: a non-admin read policy on notes remains';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
             and tablename in ('orders', 'purchases', 'payments') and cmd <> 'SELECT') then
    raise exception 'CRITICAL3 self-check: a write policy remains on orders/purchases/payments';
  end if;
end;
$$;

commit;
