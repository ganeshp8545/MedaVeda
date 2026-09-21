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

-- payment_sessions 30-day purge
begin;
do $$
declare v_o record;
begin
  select id, user_id, product_id into v_o from public.orders where user_id is not null limit 1;
  insert into public.payment_sessions (id, order_id, user_id, product_id, expires_at, created_at) values
    ('00000000-0000-4000-8000-0000000000a1', v_o.id, v_o.user_id, v_o.product_id, now() - interval '31 days', now() - interval '31 days'),
    ('00000000-0000-4000-8000-0000000000a2', v_o.id, v_o.user_id, v_o.product_id, now() + interval '10 min', now() - interval '29 days'),
    ('00000000-0000-4000-8000-0000000000a3', v_o.id, v_o.user_id, v_o.product_id, now() + interval '10 min', now());
  perform public.purge_old_payment_sessions();
  assert not exists (select 1 from public.payment_sessions where id = '00000000-0000-4000-8000-0000000000a1'), 'old session purged';
  assert (select count(*) from public.payment_sessions where id in ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a3')) = 2, 'recent sessions kept';
  raise notice 'PASS payment_sessions purge keeps <30d, removes >30d';
end $$;
set local role authenticated;
do $$ begin
  begin perform public.purge_old_payment_sessions(); raise notice 'FAIL authenticated can purge sessions';
  exception when insufficient_privilege then raise notice 'PASS authenticated cannot purge sessions'; end;
end $$;
rollback;
