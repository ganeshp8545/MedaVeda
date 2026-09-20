-- Run on a scratch DB after applying 20260921120000_analytics_retention.sql.
begin;
insert into public.analytics_events (id, name, created_at) values
  ('ret-old',  'x', now() - interval '13 months'),
  ('ret-edge', 'x', now() - interval '11 months'),
  ('ret-new',  'x', now());
select case when public.purge_old_analytics_events() >= 1 then 'PASS' else 'FAIL' end as purge_returns_count;
select case when (select count(*) from public.analytics_events where id = 'ret-old') = 0 then 'PASS' else 'FAIL' end as old_deleted;
select case when (select count(*) from public.analytics_events where id in ('ret-edge','ret-new')) = 2 then 'PASS' else 'FAIL' end as recent_kept;
set local role authenticated;
do $$ begin
  begin perform public.purge_old_analytics_events(); raise notice 'FAIL authenticated can purge';
  exception when insufficient_privilege then raise notice 'PASS authenticated cannot purge'; end;
end $$;
rollback;
