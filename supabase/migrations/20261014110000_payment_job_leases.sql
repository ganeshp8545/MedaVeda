-- One lease/retry schedule for reporting, refunds, consumption and Play checks.
begin;
alter table public.orders add column if not exists play_last_attempt_at timestamptz;
create table if not exists public.payment_jobs (
  kind text not null check(kind in ('reports','refunds','consume','reconcile','compensate','events')),
  target_id text not null,
  status text not null default 'pending' check(status in ('pending','leased','done','parked')),
  deadline_at timestamptz not null,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  primary key(kind,target_id)
);
create index if not exists payment_jobs_due_idx on public.payment_jobs(kind,next_attempt_at,deadline_at)
  where status in ('pending','leased');
alter table public.payment_jobs enable row level security;
revoke all on public.payment_jobs from public,anon,authenticated;
grant all on public.payment_jobs to service_role;

create or replace function public.enqueue_payment_jobs() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'reports',o.id,coalesce(o.payment_provider_time,o.payment_completed_at,o.created_at)+interval '24 hours'
  from public.orders o where o.external_transaction_token is not null
    and o.external_report_status in ('pending','failed') and o.status in ('paid','refunded')
  on conflict(kind,target_id) do update set deadline_at=excluded.deadline_at;
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'refunds',r.refund_id,r.refund_time+interval '24 hours'
  from public.ucb_external_refunds r where r.status in ('pending','failed','processing')
  on conflict(kind,target_id) do nothing;
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'consume',o.id,coalesce(o.payment_completed_at,o.created_at)+interval '24 hours'
  from public.orders o where o.provider='play' and o.status='paid'
    and o.play_consumption_status in ('pending','failed')
  on conflict(kind,target_id) do nothing;
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'reconcile',o.id,coalesce(o.play_last_checked_at,o.created_at)+interval '2 hours'
  from public.orders o where o.provider='play' and o.status='paid' and o.purchase_token is not null
    and (o.play_last_checked_at is null or o.play_last_checked_at<now()-interval '2 hours')
  on conflict(kind,target_id) do update set status='pending', next_attempt_at=now(),
    deadline_at=excluded.deadline_at, attempts=0, lease_id=null, lease_until=null
    where public.payment_jobs.status='done';
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'compensate',c.payment_id,c.created_at+interval '24 hours'
  from public.payment_compensations c where c.status in ('pending','processing')
  on conflict(kind,target_id) do nothing;
  insert into public.payment_jobs(kind,target_id,deadline_at)
  select 'events',e.event_id,e.received_at+interval '24 hours'
  from public.provider_events e where e.status='pending' and e.payment_id is not null
    and exists(select 1 from public.orders o where o.razorpay_payment_id=e.payment_id)
    and e.event_type in ('refund.processed','payment.dispute.created','payment.dispute.under_review',
      'payment.dispute.action_required','payment.dispute.won','payment.dispute.lost','payment.dispute.closed')
  on conflict(kind,target_id) do nothing;
end $$;
revoke all on function public.enqueue_payment_jobs() from public,anon,authenticated;
grant execute on function public.enqueue_payment_jobs() to service_role;

create or replace function public.claim_payment_jobs(p_kind text,p_limit integer default 40)
returns table(target_id text,lease_id uuid,attempts integer)
language plpgsql security definer set search_path=public as $$
begin
  if p_kind not in ('reports','refunds','consume','reconcile','compensate','events')
    or p_limit<1 or p_limit>40 then raise exception 'invalid job claim'; end if;
  return query with due as (
    select j.kind,j.target_id from public.payment_jobs j
    where j.kind=p_kind and j.next_attempt_at<=now()
      and (j.status='pending' or (j.status='leased' and j.lease_until<now()))
    order by j.deadline_at,j.created_at,j.target_id
    for update skip locked limit p_limit
  ), claimed as (
    update public.payment_jobs j set status='leased',lease_id=gen_random_uuid(),
      lease_until=now()+interval '3 minutes',attempts=j.attempts+1
    from due d where j.kind=d.kind and j.target_id=d.target_id
    returning j.target_id,j.lease_id,j.attempts
  ) select c.target_id,c.lease_id,c.attempts from claimed c;
end $$;
revoke all on function public.claim_payment_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_payment_jobs(text,integer) to service_role;

create or replace function public.finish_payment_job(
  p_kind text,p_target_id text,p_lease_id uuid,p_success boolean,p_error text default null)
returns text language plpgsql security definer set search_path=public as $$
declare v_attempts integer; v_status text;
begin
  select attempts into v_attempts from public.payment_jobs
    where kind=p_kind and target_id=p_target_id and lease_id=p_lease_id and status='leased' for update;
  if not found then return 'lease_lost'; end if;
  v_status:=case when p_success then 'done' when v_attempts>=12 then 'parked' else 'pending' end;
  update public.payment_jobs set status=v_status,lease_id=null,lease_until=null,
    last_error=case when p_success then null else left(coalesce(p_error,'failed'),300) end,
    next_attempt_at=case when p_success then now() else
      now()+make_interval(secs=>least(3600,60*power(2,least(v_attempts-1,6)))::integer) end
    where kind=p_kind and target_id=p_target_id;
  return v_status;
end $$;
revoke all on function public.finish_payment_job(text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_payment_job(text,text,uuid,boolean,text) to service_role;

create or replace view public.payment_queue_metrics as
select kind,count(*) filter(where status in ('pending','leased')) as backlog_count,
  min(created_at) filter(where status in ('pending','leased')) as oldest_queued_at,
  min(deadline_at) filter(where status in ('pending','leased')) as oldest_deadline_at,
  ceil(count(*) filter(where status in ('pending','leased'))::numeric/40)*60 as estimated_drain_seconds,
  count(*) filter(where status='parked') as parked_count
from public.payment_jobs group by kind;
revoke all on public.payment_queue_metrics from public,anon,authenticated;
grant select on public.payment_queue_metrics to service_role;
commit;
