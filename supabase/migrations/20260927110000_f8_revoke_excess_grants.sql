-- ============================================================================
-- F8: take away table privileges nothing needs.
--
-- Supabase's default privileges give anon and authenticated ALL privileges on every
-- public table; RLS then decides rows. But TRUNCATE (and REFERENCES / TRIGGER) is not
-- subject to RLS at all. PostgREST never issues TRUNCATE, so this is not reachable through
-- the API today - it is one direct-SQL / misconfiguration away from a wipe.
--
-- Revoked:  TRUNCATE, REFERENCES, TRIGGER from anon and authenticated on every public table;
--           INSERT, UPDATE, DELETE from anon (the only anonymous write the app makes is
--           pre-login analytics, granted back on analytics_events alone).
-- KEPT:     authenticated keeps INSERT/UPDATE/DELETE: the admin panel is an `authenticated`
--           session (same DB role as students), so RLS remains the only barrier on the
--           admin-managed tables - that cannot be tightened without a separate admin role.
--           service_role is untouched.
-- Future tables: ALTER DEFAULT PRIVILEGES FOR ROLE postgres (migrations and the dashboard
--           create objects as postgres, and every public table on live is owned by postgres).
--           The same statement FOR ROLE supabase_admin needs membership of that role, which
--           `postgres` does not have on hosted Supabase (checked on live: not superuser, not a
--           member) - it is attempted, and skipped with a NOTICE if denied. What stays exposed
--           in that case: only tables CREATED BY supabase_admin (none exist in public today;
--           that role creates Supabase-internal objects), which would still get the default
--           full grants until revoked by hand.
-- ============================================================================

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
grant insert on public.analytics_events to anon;          -- pre-login analytics (RLS: user_id must be null)

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;

do $$
begin
  alter default privileges for role supabase_admin in schema public
    revoke truncate, references, trigger on tables from anon, authenticated;
  alter default privileges for role supabase_admin in schema public
    revoke insert, update, delete on tables from anon;
exception when insufficient_privilege then
  raise notice 'F8: not allowed to change default privileges for role supabase_admin (expected on hosted Supabase). Tables created by that role, if any ever appear, keep the default grants.';
end $$;
