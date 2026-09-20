-- ============================================================================
-- HIGH 4 — signup lost the student's name and phone
-- ============================================================================
-- The app sends { full_name, mobile_number } as auth user metadata. Older code
-- read only `name`. 20260923100000 already reads full_name / mobile_number; this
-- migration completes the fallback chain the audit asked for:
--     name  = coalesce(full_name, name)
--     phone = coalesce(mobile_number, phone)
-- and runs a ONE-TIME backfill for accounts created while the trigger was wrong.
--
-- Backfill rules: only fill a profile value that is NULL / blank; never overwrite
-- a non-empty value; skip a phone that is malformed or already used by another
-- profile (profiles_phone_normalized_unique) instead of failing. No rows are
-- inserted or deleted. Idempotent (a second run changes nothing).
begin;

-- normalize_phone() and profiles.phone_normalized exist on the live database (used
-- by 20260923100000 and the login-with-mobile function) but are not created by any
-- migration in this repo. Fail early and clearly if they are missing.
do $$
begin
  if to_regprocedure('public.normalize_phone(text)') is null then
    raise exception 'HIGH4 preflight: public.normalize_phone(text) is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_normalized') then
    raise exception 'HIGH4 preflight: profiles.phone_normalized is missing';
  end if;
end;
$$;

create temp table _h4_counts on commit drop as
select count(*) n from public.profiles;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name  text := coalesce(
                    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                    '');
  v_phone text := public.normalize_phone(
                    coalesce(
                      nullif(btrim(new.raw_user_meta_data ->> 'mobile_number'), ''),
                      nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')));
begin
  insert into public.profiles (id, name, email, phone)
  values (new.id, v_name, new.email, v_phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- One-time backfill
-- ---------------------------------------------------------------------------
with src as (
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), '')) as meta_name,
    public.normalize_phone(
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'mobile_number'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''))) as meta_phone
  from auth.users u
)
update public.profiles p
set name = coalesce(nullif(btrim(p.name), ''), s.meta_name, p.name)
from src s
where s.id = p.id
  and nullif(btrim(coalesce(p.name, '')), '') is null
  and s.meta_name is not null;

-- Phone: one row at a time semantics via NOT EXISTS so a number already held by
-- another profile (or duplicated inside auth metadata) is skipped, not fatal.
-- The profiles_sync_phone_normalized trigger fills phone_normalized.
with src as (
  select
    u.id,
    public.normalize_phone(
      coalesce(
        nullif(btrim(u.raw_user_meta_data ->> 'mobile_number'), ''),
        nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''))) as meta_phone
  from auth.users u
),
first_claim as (
  -- if two accounts carry the same number in metadata, only the oldest claims it
  select distinct on (s.meta_phone) s.id, s.meta_phone
  from src s
  join auth.users u on u.id = s.id
  where s.meta_phone is not null
  order by s.meta_phone, u.created_at, u.id
)
update public.profiles p
set phone = f.meta_phone
from first_claim f
where f.id = p.id
  and nullif(btrim(coalesce(p.phone, '')), '') is null
  and not exists (
    select 1 from public.profiles o
    where o.id <> p.id and o.phone_normalized = f.meta_phone
  );

do $$
declare v_after bigint; v_before bigint;
begin
  select n into v_before from _h4_counts;
  select count(*) into v_after from public.profiles;
  if v_before <> v_after then
    raise exception 'HIGH4 self-check: profiles row count changed (% -> %)', v_before, v_after;
  end if;
end;
$$;

commit;
