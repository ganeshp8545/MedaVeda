-- Admin MFA (AAL2) — switchable, so enabling it can never lock the admins out by accident.
--
-- am_i_admin() is the single gate behind every admin RLS policy and RPC. It now also requires
-- the session to be AAL2 (the JWT `aal` claim, set by Supabase Auth after a TOTP challenge)
-- WHEN public.admin_settings.require_mfa is true. The flag ships FALSE, so applying this
-- migration changes nothing until the owner has enrolled every admin and flips it with
-- public.set_admin_mfa_required(true), which itself refuses while any admin lacks a verified factor.
--
-- Manual sequence: docs/security/ADMIN_MFA.md.

create table if not exists public.admin_settings (
  id          boolean primary key default true check (id),      -- single row
  require_mfa boolean not null default false,
  updated_at  timestamptz not null default now()
);
insert into public.admin_settings (id, require_mfa) values (true, false) on conflict do nothing;
alter table public.admin_settings enable row level security;      -- no policies: no client access
revoke all on public.admin_settings from public, anon, authenticated;

create or replace function public.admin_mfa_required()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select require_mfa from public.admin_settings where id), false)
$$;
revoke all on function public.admin_mfa_required() from public, anon, authenticated;
grant execute on function public.admin_mfa_required() to service_role;

create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.admins where id = auth.uid())
     and (not public.admin_mfa_required() or coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;

-- "Is this account an admin, regardless of MFA?" Lets the admin panel tell "not an admin" apart
-- from "admin who still has to complete MFA". Reveals nothing beyond the caller's own status.
create or replace function public.is_admin_account()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.admins where id = auth.uid())
$$;
revoke all on function public.is_admin_account() from public, anon;
grant execute on function public.is_admin_account() to authenticated, service_role;

-- Owner-only switch (run from the SQL editor / `supabase db query`; not callable by any API role).
create or replace function public.set_admin_mfa_required(p_required boolean)
returns text language plpgsql security definer set search_path to 'public' as $$
declare missing text;
begin
  if p_required then
    select string_agg(a.email, ', ') into missing
      from public.admins a
     where not exists (select 1 from auth.mfa_factors f
                        where f.user_id = a.id and f.status = 'verified');
    if missing is not null then
      raise exception 'Refusing to require MFA: these admins have no verified factor yet: %', missing;
    end if;
  end if;
  update public.admin_settings set require_mfa = p_required, updated_at = now() where id;
  return case when p_required then 'admin MFA is now REQUIRED' else 'admin MFA requirement is OFF' end;
end $$;
revoke all on function public.set_admin_mfa_required(boolean) from public, anon, authenticated;
