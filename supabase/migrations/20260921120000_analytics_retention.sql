-- ============================================================================
-- Retention jobs:
--   1. analytics_events older than 12 months (Privacy Policy: "usage events
--      are kept for up to 12 months").
--   2. payment_sessions older than 30 days (short-lived checkout links; they
--      carry user_id and have no reason to outlive their 15-minute validity).
--
-- - Adds an index on created_at (analytics_events) so the purge does not scan.
-- - purge_old_analytics_events() / purge_old_payment_sessions() do the deletes;
--   they are not callable by app roles.
-- - Daily pg_cron jobs (03:30 and 03:40 UTC) run them. pg_cron is NOT installed on the
--   live database today, so scheduling is guarded: if the extension cannot be
--   enabled the migration still succeeds, raises a NOTICE, and you can either
--   enable pg_cron (Dashboard -> Database -> Extensions) and re-run this
--   migration's DO block, or call the function from any other scheduler.
-- Idempotent: safe to run more than once.
-- ============================================================================

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

create or replace function public.purge_old_analytics_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.analytics_events
   where created_at < now() - interval '12 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_analytics_events() from public, anon, authenticated;
grant execute on function public.purge_old_analytics_events() to service_role;

create index if not exists payment_sessions_created_at_idx
  on public.payment_sessions (created_at);

create or replace function public.purge_old_payment_sessions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.payment_sessions
   where created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_old_payment_sessions() from public, anon, authenticated;
grant execute on function public.purge_old_payment_sessions() to service_role;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
      begin
        create extension pg_cron;
      exception when others then
        raise notice 'analytics retention: could not enable pg_cron (%). Job not scheduled.', sqlerrm;
      end;
    end if;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- cron.schedule() with an existing job name updates that job (idempotent).
    perform cron.schedule(
      'purge-analytics-events-12m',
      '30 3 * * *',
      'select public.purge_old_analytics_events()'
    );
    perform cron.schedule(
      'purge-payment-sessions-30d',
      '40 3 * * *',
      'select public.purge_old_payment_sessions()'
    );
  else
    raise notice 'analytics retention: pg_cron is not available - purge functions created but NOT scheduled.';
  end if;
end
$$;
