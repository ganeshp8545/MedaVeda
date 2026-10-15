-- Paste into the hosted SQL Editor after migrations, tier seed, and cron setup.
-- Read-only. Every row must be PASS before launch; seller_state is intentionally
-- unset by migrations and must be configured from verified business records.
with checks as (
  select 'orders required columns' as check_name,
    (select count(*) = 28 from pg_attribute
      where attrelid = to_regclass('public.orders') and attnum > 0 and not attisdropped
        and attname = any(array[
          'provider','play_sku','purchase_token','play_consumption_status',
          'external_transaction_token','external_choice_bound_order_id',
          'external_transaction_id','external_report_status','external_reported_at',
          'external_report_error','external_report_attempts','external_report_attempted_at',
          'external_refund_status','external_refund_at','external_refund_error',
          'external_refund_attempts','external_refund_attempted_at',
          'tax_pre_amount','tax_amount','gst_rate_percent',
          'tax_region_code','tax_administrative_area','payment_completed_at',
          'play_last_checked_at','play_last_attempt_at',
          'payment_provider_time','payment_received_at','payment_time_fallback'])) as passed
  union all select 'unique purchase_token index on orders', exists (
    select 1 from pg_index i join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_attribute a on a.attrelid=t.oid and a.attnum=any(i.indkey)
    where n.nspname='public' and t.relname='orders' and i.indisunique and i.indnkeyatts=1
      and i.indisvalid and a.attname='purchase_token')
  union all select 'RLS enabled: orders/payments/purchases',
    (select count(*)=3 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any(array['orders','payments','purchases']) and c.relrowsecurity)
  union all select 'no authenticated order write policy', not exists (
    select 1 from pg_policies where schemaname='public' and tablename='orders'
      and cmd in ('ALL','INSERT','UPDATE','DELETE')
      and ('authenticated'=any(roles) or 'public'=any(roles)))
  union all select 'pg_cron and pg_net enabled',
    (select count(*)=2 from pg_extension where extname=any(array['pg_cron','pg_net']))
  union all select 'six UCB cron jobs active',
    (select count(*)=6 from cron.job where jobname=any(array[
      'ucb-reports','ucb-refunds','ucb-consume','ucb-reconcile','ucb-compensate','ucb-events']) and active)
  union all select 'audit payment tables have RLS',
    (select count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any(array[
        'provider_events','payment_captures','payment_compensations',
        'first_discount_reservations','payment_jobs']) and c.relrowsecurity)
  union all select 'gst_rate_percent configured', exists (
    select 1 from public.app_config where key='gst_rate_percent' and value ~ '^[0-9]+(\.[0-9]{1,2})?$')
  union all select 'seller_state configured', exists (
    select 1 from public.app_config where key='seller_state' and nullif(btrim(value),'') is not null)
  union all select 'require_ucb_for_razorpay remains false', exists (
    select 1 from public.app_config where key='require_ucb_for_razorpay' and value='false')
  union all select 'price tiers populated', exists (
    select 1 from public.play_price_tiers where price_inr > 0 and play_sku ~ '^notes_[0-9]+$')
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by check_name;
