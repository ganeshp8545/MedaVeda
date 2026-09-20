-- Drop the leftover debug_whoami() helper.
--
-- It returns auth.uid(), the caller's JWT email and their admins rows, and was
-- executable by anon and authenticated (and PUBLIC). Nothing in mobile-app,
-- admin-panel, website or the Edge Functions calls it. It exists on live and is
-- reproduced in 20260701000000_baseline_live_schema.sql so a from-scratch rebuild
-- matches live up to this point; this migration then removes it everywhere.
--
-- Drops every overload, and is a no-op if none exist. Idempotent.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'debug_whoami'
  loop
    execute format('drop function if exists %s', f);
  end loop;
end $$;
