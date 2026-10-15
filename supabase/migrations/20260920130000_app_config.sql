-- ============================================================================
-- app_config: small key/value table for remote app configuration.
-- Used by the mobile force-update gate (min_app_version, store_url).
--
-- !! PUBLICLY READABLE (anon + authenticated). Store ONLY non-secret values
-- !! here - never API secrets, keys, tokens or personal data.
--
-- Read: anyone. Write (insert/update/delete): admins only (am_i_admin()).
-- ============================================================================
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  -- Defence in depth against a typo locking every student out of the app.
  constraint app_config_min_app_version_format
    check (key <> 'min_app_version' or value ~ '^[0-9]+(\.[0-9]+){0,2}$'),
  constraint app_config_store_url_https
    check (key <> 'store_url' or value ~ '^https://')
);

create or replace function public.app_config_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_config_touch_updated_at on public.app_config;
create trigger app_config_touch_updated_at
  before update on public.app_config
  for each row execute function public.app_config_touch_updated_at();

alter table public.app_config enable row level security;

grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;

drop policy if exists "app_config_public_read" on public.app_config;
create policy "app_config_public_read" on public.app_config
  for select to anon, authenticated using (true);

drop policy if exists "app_config_admin_insert" on public.app_config;
create policy "app_config_admin_insert" on public.app_config
  for insert to authenticated with check (public.am_i_admin());

drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update" on public.app_config
  for update to authenticated using (public.am_i_admin()) with check (public.am_i_admin());

drop policy if exists "app_config_admin_delete" on public.app_config;
create policy "app_config_admin_delete" on public.app_config
  for delete to authenticated using (public.am_i_admin());

-- Seed: min_app_version equals the version in mobile-app/app.json at release
-- time so nobody is blocked on release day. Raise it from Admin -> Settings
-- (or an admin-only UPDATE) when an older build must be retired.
-- store_url uses android.package from app.json.
insert into public.app_config (key, value) values
  ('min_app_version', '1.0.0'),
  ('store_url', 'https://play.google.com/store/apps/details?id=com.medveda.app')
on conflict (key) do nothing;
