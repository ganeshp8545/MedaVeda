-- Play-only recovery. Depends on migrations through 20261013110000 only.
-- Deliberately independent of payment_jobs and all Razorpay/UCB queues.
begin;

alter table public.orders add column if not exists play_last_attempt_at timestamptz;

create table public.play_payment_jobs (
  kind text not null check (kind in ('consume','reconcile')),
  order_id text not null references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','leased','done','parked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind,order_id),
  check ((status = 'leased') = (lease_id is not null and lease_until is not null))
);
create index play_payment_jobs_due_idx on public.play_payment_jobs(kind,next_attempt_at,created_at)
  where status in ('pending','leased');
alter table public.play_payment_jobs enable row level security;
revoke all on public.play_payment_jobs from public,anon,authenticated;
grant all on public.play_payment_jobs to service_role;

-- Retain observed void tokens so a void that precedes local settlement is not
-- lost when the Google page cursor advances. Tokens are service-role only.
create table public.play_void_tokens (
  purchase_token text primary key,
  first_seen_at timestamptz not null default now()
);
alter table public.play_void_tokens enable row level security;
revoke all on public.play_void_tokens from public,anon,authenticated;
grant all on public.play_void_tokens to service_role;

create function public.record_play_void_tokens(p_tokens text[]) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_tokens is null or cardinality(p_tokens)>40 or exists (
    select 1 from unnest(p_tokens) t where t is null or length(t)<10 or length(t)>4096
  ) then raise exception 'invalid Play void tokens'; end if;
  insert into public.play_void_tokens(purchase_token)
  select distinct t from unnest(p_tokens) t on conflict do nothing;
end $$;
revoke all on function public.record_play_void_tokens(text[]) from public,anon,authenticated;
grant execute on function public.record_play_void_tokens(text[]) to service_role;

create function public.enqueue_play_payment_jobs() returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.play_payment_jobs(kind,order_id)
  select 'consume',o.id from public.orders o
  where o.provider='play' and o.status='paid' and o.purchase_token is not null
    and o.play_consumption_status in ('pending','failed')
  on conflict do nothing;

  insert into public.play_payment_jobs(kind,order_id)
  select 'reconcile',o.id from public.orders o
  where o.provider='play' and o.status='paid' and o.purchase_token is not null
    and (o.play_last_checked_at is null or o.play_last_checked_at < now()-interval '2 hours')
  on conflict (kind,order_id) do update set status='pending',attempts=0,
    next_attempt_at=now(),lease_id=null,lease_until=null,last_error=null,updated_at=now()
  where public.play_payment_jobs.status='done';
end $$;
revoke all on function public.enqueue_play_payment_jobs() from public,anon,authenticated;
grant execute on function public.enqueue_play_payment_jobs() to service_role;

create function public.claim_play_payment_jobs(p_kind text,p_limit integer default 20)
returns table(order_id text,lease_id uuid,attempts integer)
language plpgsql security definer set search_path=public as $$
begin
  if p_kind not in ('consume','reconcile') or p_limit < 1 or p_limit > 20 then
    raise exception 'invalid Play job claim';
  end if;
  return query with due as (
    select j.kind,j.order_id from public.play_payment_jobs j
    where j.kind=p_kind and j.next_attempt_at<=now()
      and (j.status='pending' or (j.status='leased' and j.lease_until<now()))
    order by j.next_attempt_at,j.created_at,j.order_id
    for update skip locked limit p_limit
  ), claimed as (
    update public.play_payment_jobs j set status='leased',lease_id=gen_random_uuid(),
      lease_until=now()+interval '3 minutes',attempts=j.attempts+1,updated_at=now()
    from due d where j.kind=d.kind and j.order_id=d.order_id
    returning j.order_id,j.lease_id,j.attempts
  ) select c.order_id,c.lease_id,c.attempts from claimed c;
end $$;
revoke all on function public.claim_play_payment_jobs(text,integer) from public,anon,authenticated;
grant execute on function public.claim_play_payment_jobs(text,integer) to service_role;

create function public.finish_play_payment_job(p_kind text,p_order_id text,p_lease_id uuid,
  p_success boolean,p_error text default null) returns text
language plpgsql security definer set search_path=public as $$
declare v_attempts integer; v_status text;
begin
  select attempts into v_attempts from public.play_payment_jobs
    where kind=p_kind and order_id=p_order_id and lease_id=p_lease_id
      and status='leased' and lease_until>now() for update;
  if not found then return 'lease_lost'; end if;
  v_status:=case when p_success then 'done' when v_attempts>=12 then 'parked' else 'pending' end;
  update public.play_payment_jobs set status=v_status,lease_id=null,lease_until=null,
    last_error=case when p_success then null else left(coalesce(p_error,'failed'),300) end,
    next_attempt_at=case when p_success then now() else
      now()+make_interval(secs=>least(3600,60*power(2,least(v_attempts-1,6)))::integer) end,
    updated_at=now() where kind=p_kind and order_id=p_order_id;
  return v_status;
end $$;
revoke all on function public.finish_play_payment_job(text,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_play_payment_job(text,text,uuid,boolean,text) to service_role;

create table public.play_recovery_cursor (
  id boolean primary key default true check(id),
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  next_page_token text,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  updated_at timestamptz not null default now(),
  check ((lease_id is null) = (lease_until is null))
);
insert into public.play_recovery_cursor(id,start_time_ms,end_time_ms)
values(true,(extract(epoch from now())*1000)::bigint-86400000,
  (extract(epoch from now())*1000)::bigint);
alter table public.play_recovery_cursor enable row level security;
revoke all on public.play_recovery_cursor from public,anon,authenticated;
grant all on public.play_recovery_cursor to service_role;

create function public.claim_play_recovery_cursor() returns jsonb
language plpgsql security definer set search_path=public as $$
declare v public.play_recovery_cursor%rowtype;
begin
  update public.play_recovery_cursor set lease_id=gen_random_uuid(),
    lease_until=now()+interval '3 minutes',updated_at=now()
  where id=true and next_attempt_at<=now() and (lease_until is null or lease_until<now())
  returning * into v;
  if not found then return jsonb_build_object('ok',false,'code','busy'); end if;
  return jsonb_build_object('ok',true,'lease_id',v.lease_id,'start_time_ms',v.start_time_ms,
    'end_time_ms',v.end_time_ms,'next_page_token',v.next_page_token);
end $$;
revoke all on function public.claim_play_recovery_cursor() from public,anon,authenticated;
grant execute on function public.claim_play_recovery_cursor() to service_role;

create function public.finish_play_recovery_cursor(p_lease_id uuid,p_success boolean,
  p_next_page_token text default null,p_error text default null) returns text
language plpgsql security definer set search_path=public as $$
declare v public.play_recovery_cursor%rowtype;
begin
  select * into v from public.play_recovery_cursor where id=true and lease_id=p_lease_id
    and lease_until>now() for update;
  if not found then return 'lease_lost'; end if;
  if p_success then
    update public.play_recovery_cursor set
      start_time_ms=case when p_next_page_token is null then greatest(v.start_time_ms,v.end_time_ms-3600000) else v.start_time_ms end,
      end_time_ms=case when p_next_page_token is null then (extract(epoch from now())*1000)::bigint else v.end_time_ms end,
      next_page_token=p_next_page_token,lease_id=null,lease_until=null,attempts=0,
      next_attempt_at=now(),last_error=null,updated_at=now() where id=true;
    return 'done';
  end if;
  update public.play_recovery_cursor set lease_id=null,lease_until=null,attempts=v.attempts+1,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(v.attempts,6)))::integer),
    last_error=left(coalesce(p_error,'failed'),300),updated_at=now() where id=true;
  return 'retry';
end $$;
revoke all on function public.finish_play_recovery_cursor(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_play_recovery_cursor(uuid,boolean,text,text) to service_role;

create view public.play_recovery_metrics as
select (select count(*) from public.play_payment_jobs where status in ('pending','leased')) as backlog_count,
  (select count(*) from public.play_payment_jobs where status='parked') as parked_count,
  (select min(created_at) from public.play_payment_jobs where status in ('pending','leased')) as oldest_job_at,
  (extract(epoch from now())*1000-c.end_time_ms)/1000 as cursor_lag_seconds,
  c.attempts as cursor_failures,c.last_error as cursor_error
from public.play_recovery_cursor c where c.id=true;
revoke all on public.play_recovery_metrics from public,anon,authenticated;
grant select on public.play_recovery_metrics to service_role;
commit;
