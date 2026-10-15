begin;
create table if not exists public.play_void_sweep_state (
  id boolean primary key default true check (id),
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  next_page_token text,
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.play_void_sweep_state enable row level security;
revoke all on public.play_void_sweep_state from public,anon,authenticated;
grant all on public.play_void_sweep_state to service_role;
insert into public.play_void_sweep_state(id,start_time_ms,end_time_ms)
values(true,(extract(epoch from now())*1000)::bigint-86400000,
  (extract(epoch from now())*1000)::bigint)
on conflict(id) do nothing;
create or replace view public.play_void_sweep_metrics as
select (select count(*) from public.orders o where o.provider='play' and o.status='paid'
  and (o.play_last_checked_at is null or o.play_last_checked_at<now()-interval '2 hours')) as unchecked_count,
  (select min(coalesce(o.play_last_checked_at,o.created_at)) from public.orders o
   where o.provider='play' and o.status='paid') as oldest_unchecked_at,
  (extract(epoch from now())*1000-s.end_time_ms)/1000 as cursor_lag_seconds,
  s.updated_at as cursor_updated_at
from public.play_void_sweep_state s where s.id=true;
revoke all on public.play_void_sweep_metrics from public,anon,authenticated;
grant select on public.play_void_sweep_metrics to service_role;
create or replace function public.claim_play_void_sweep()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state public.play_void_sweep_state%rowtype; v_lease uuid:=gen_random_uuid();
begin
  update public.play_void_sweep_state set lease_id=v_lease,
    lease_until=now()+interval '90 seconds',updated_at=now()
  where id=true and (lease_until is null or lease_until<now()) returning * into v_state;
  if not found then return jsonb_build_object('ok',false,'code','busy'); end if;
  return jsonb_build_object('ok',true,'lease_id',v_lease,'start_time_ms',v_state.start_time_ms,
    'end_time_ms',v_state.end_time_ms,'next_page_token',v_state.next_page_token);
end $$;
revoke all on function public.claim_play_void_sweep() from public,anon,authenticated;
grant execute on function public.claim_play_void_sweep() to service_role;
commit;
