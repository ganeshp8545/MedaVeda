-- MOB-01: expose only the existing maintenance flag before login, never the
-- rest of app_settings (anon table SELECT was deliberately revoked).
begin;
create or replace function public.get_maintenance_mode()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select maintenance_mode from public.app_settings where id = 1), false);
$$;
revoke all on function public.get_maintenance_mode() from public;
grant execute on function public.get_maintenance_mode() to anon, authenticated;
commit;

-- Rollback: drop function public.get_maintenance_mode(); mobile fails open.
