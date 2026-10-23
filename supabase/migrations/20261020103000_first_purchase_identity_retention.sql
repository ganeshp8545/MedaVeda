-- DB-01: REVIEW ONLY. No purge invocation or cron scheduling in this migration.
-- Fixed 180-day lifetime from first_purchase_at, not from account deletion.
-- This also bounds retention after account deletion to at most 180 days.
-- Deleting the entire row removes both hashes and account_id. Do not NULL only
-- account_id while retaining hashes: has_prior_purchase_identity uses <> p_uid,
-- so NULL would silently bypass that guard. Existing billing RPCs stay intact.
create index if not exists first_purchase_identities_retention_idx
  on public.first_purchase_identities (first_purchase_at);

create or replace function public.purge_expired_first_purchase_identities()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.first_purchase_identities
    where first_purchase_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.purge_expired_first_purchase_identities() from public, anon, authenticated;
grant execute on function public.purge_expired_first_purchase_identities() to service_role;

-- Prepared cron pattern (see existing *_cron_setup.sql); deliberately commented.
-- An owner must approve operation/cadence and monitor failures before publishing
-- the retention promise. A daily job can lag the cutoff by up to one day; choose
-- a suitable operational cadence and deletion deadline before enabling it.
-- select cron.schedule('first-purchase-identity-retention', '0 * * * *',
--   'select public.purge_expired_first_purchase_identities();');
-- No existing job is changed. No extension is installed.
--
-- Rollback via NEW forward migration only:
-- 1. If separately enabled, unschedule only this named job:
--    select cron.unschedule('first-purchase-identity-retention');
-- 2. drop function public.purge_expired_first_purchase_identities();
-- 3. drop index public.first_purchase_identities_retention_idx;
-- Purged rows cannot be recovered by rollback. Do not backfill old hashes from
-- financial records: that would restart the approved retention window.
