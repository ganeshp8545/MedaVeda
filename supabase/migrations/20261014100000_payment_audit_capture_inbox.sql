-- Durable provider facts precede entitlement. All writes are server-only.
begin;
alter table public.orders add column if not exists payment_provider_time timestamptz,
  add column if not exists payment_received_at timestamptz,
  add column if not exists payment_time_fallback boolean not null default false;

create table if not exists public.provider_events (
  event_id text primary key,
  event_type text not null,
  razorpay_order_id text,
  payment_id text,
  provider_object_id text,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  provider_time timestamptz,
  received_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','applied','parked')),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  lease_until timestamptz
);
create index if not exists provider_events_pending_payment_idx on public.provider_events(payment_id, received_at) where status='pending';
alter table public.provider_events enable row level security;
revoke all on public.provider_events from public,anon,authenticated;
grant all on public.provider_events to service_role;

create table if not exists public.payment_captures (
  payment_id text primary key,
  razorpay_order_id text not null,
  order_id text references public.orders(id),
  amount_paise bigint not null check (amount_paise>0),
  provider_time timestamptz,
  received_at timestamptz not null default clock_timestamp(),
  status text not null default 'captured' check (status in ('captured','granted','compensation_pending','reversal_pending','reversed','compensated')),
  failure_reason text
);
create index if not exists payment_captures_order_idx on public.payment_captures(order_id);
alter table public.payment_captures enable row level security;
revoke all on public.payment_captures from public,anon,authenticated;
grant all on public.payment_captures to service_role;

create table if not exists public.payment_compensations (
  payment_id text primary key references public.payment_captures(payment_id),
  order_id text references public.orders(id),
  amount_paise bigint not null check (amount_paise>0),
  reason text not null,
  refund_request_id text not null unique,
  provider_refund_id text,
  status text not null default 'pending' check (status in ('pending','processing','refunded','parked')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists payment_compensations_due_idx on public.payment_compensations(next_attempt_at,created_at) where status in ('pending','processing');
create index if not exists payment_compensations_order_idx on public.payment_compensations(order_id);
alter table public.payment_compensations add column if not exists provider_refund_id text;
alter table public.payment_compensations enable row level security;
revoke all on public.payment_compensations from public,anon,authenticated;
grant all on public.payment_compensations to service_role;

create table if not exists public.first_discount_reservations (
  user_id uuid primary key,
  referral_id uuid not null,
  order_id text not null unique,
  created_at timestamptz not null default now()
);
alter table public.first_discount_reservations enable row level security;
revoke all on public.first_discount_reservations from public,anon,authenticated;
grant all on public.first_discount_reservations to service_role;

create or replace function public.orders_reserve_first_discount()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.referral_discount > 0 and new.referral_id is not null then
    insert into public.first_discount_reservations(user_id,referral_id,order_id)
    values(new.user_id,new.referral_id,new.id) on conflict(user_id) do nothing;
    if not exists(select 1 from public.first_discount_reservations
      where user_id=new.user_id and order_id=new.id) then
      new.amount:=new.amount+new.referral_discount;
      new.referral_discount:=0;
      new.referral_id:=null;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.orders_reserve_first_discount() from public,anon,authenticated;
drop trigger if exists orders_01_discount_reserve on public.orders;
create trigger orders_01_discount_reserve before insert on public.orders
  for each row execute function public.orders_reserve_first_discount();

-- Keep the last applied pricing body intact; return the price actually stored by
-- the reservation trigger, since a competing checkout may lose the discount.
do $$ begin
  if to_regprocedure('public.create_priced_order_legacy(uuid,text,boolean)') is null then
    alter function public.create_priced_order(uuid,text,boolean) rename to create_priced_order_legacy;
  end if;
end $$;
revoke all on function public.create_priced_order_legacy(uuid,text,boolean) from public,anon,authenticated,service_role;
create or replace function public.create_priced_order(p_user_id uuid,p_product_id text,p_use_wallet boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_order public.orders%rowtype;
begin
  v_result:=public.create_priced_order_legacy(p_user_id,p_product_id,p_use_wallet);
  if coalesce((v_result->>'ok')::boolean,false) then
    select * into v_order from public.orders where id=v_result->>'order_id';
    v_result:=v_result || jsonb_build_object('amount',v_order.amount,
      'referral_discount',v_order.referral_discount,'wallet_amount',v_order.wallet_amount);
  end if;
  return v_result;
end $$;
revoke all on function public.create_priced_order(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_priced_order(uuid,text,boolean) to service_role;

do $$ begin
  if to_regprocedure('public.quote_my_order_legacy(text,boolean)') is null then
    alter function public.quote_my_order(text,boolean) rename to quote_my_order_legacy;
  end if;
end $$;
revoke all on function public.quote_my_order_legacy(text,boolean) from public,anon,authenticated,service_role;
create or replace function public.quote_my_order(p_product_id text,p_use_wallet boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_discount numeric;
begin
  v_result:=public.quote_my_order_legacy(p_product_id,p_use_wallet);
  if coalesce((v_result->>'ok')::boolean,false) and exists
    (select 1 from public.first_discount_reservations where user_id=auth.uid()) then
    v_discount:=coalesce((v_result->>'referral_discount')::numeric,0);
    if v_discount>0 then
      v_result:=v_result || jsonb_build_object('referral_discount',0,
        'amount',(v_result->>'amount')::numeric+v_discount);
    end if;
  end if;
  return v_result;
end $$;
revoke all on function public.quote_my_order(text,boolean) from public,anon;
grant execute on function public.quote_my_order(text,boolean) to authenticated,service_role;

create or replace function public.record_provider_event(
  p_event_id text,p_event_type text,p_razorpay_order_id text,p_payment_id text,
  p_provider_object_id text,p_payload_hash text,p_provider_time timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare v_hash text;
begin
  if p_event_id is null or p_event_id='' or p_event_type is null or p_event_type=''
    or p_payload_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid provider event'; end if;
  insert into public.provider_events(event_id,event_type,razorpay_order_id,payment_id,
    provider_object_id,payload_hash,provider_time)
  values(p_event_id,p_event_type,p_razorpay_order_id,p_payment_id,p_provider_object_id,p_payload_hash,p_provider_time)
  on conflict(event_id) do nothing;
  select payload_hash into v_hash from public.provider_events where event_id=p_event_id;
  if v_hash is distinct from p_payload_hash then raise exception 'provider event id reused with another payload'; end if;
end $$;
revoke all on function public.record_provider_event(text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_provider_event(text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.record_payment_capture(
  p_payment_id text,p_razorpay_order_id text,p_amount_paise bigint,p_provider_time timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare v_order_id text; v_capture public.payment_captures%rowtype;
begin
  if p_payment_id is null or p_razorpay_order_id is null or p_amount_paise is null or p_amount_paise<=0
    then raise exception 'invalid capture'; end if;
  select id into v_order_id from public.orders where razorpay_order_id=p_razorpay_order_id;
  insert into public.payment_captures(payment_id,razorpay_order_id,order_id,amount_paise,provider_time)
  values(p_payment_id,p_razorpay_order_id,v_order_id,p_amount_paise,p_provider_time)
  on conflict(payment_id) do update set provider_time=coalesce(public.payment_captures.provider_time,excluded.provider_time),
    order_id=coalesce(public.payment_captures.order_id,excluded.order_id);
  select * into v_capture from public.payment_captures where payment_id=p_payment_id;
  if v_capture.razorpay_order_id<>p_razorpay_order_id or v_capture.amount_paise<>p_amount_paise
    then raise exception 'capture identity mismatch'; end if;
end $$;
revoke all on function public.record_payment_capture(text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.record_payment_capture(text,text,bigint,timestamptz) to service_role;

-- The old settlement remains an internal implementation. This wrapper records
-- a real capture even when its entitlement subtransaction raises, and serializes
-- reversal checks against the grant on the same order row.
do $$ begin
  if to_regprocedure('public.settle_razorpay_payment_legacy(text,text,text,bigint,timestamptz)') is null then
    alter function public.settle_razorpay_payment(text,text,text,bigint,timestamptz) rename to settle_razorpay_payment_legacy;
  end if;
end $$;
revoke all on function public.settle_razorpay_payment_legacy(text,text,text,bigint,timestamptz) from public,anon,authenticated,service_role;
create or replace function public.settle_razorpay_payment(
  p_event_id text,p_razorpay_order_id text,p_razorpay_payment_id text,
  p_amount_paise bigint,p_paid_at timestamptz default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_capture public.payment_captures%rowtype;
  v_reason text; v_reversal boolean; v_error text;
begin
  select * into v_order from public.orders where razorpay_order_id=p_razorpay_order_id for update;
  if not found then raise exception 'Razorpay order is not linked'; end if;
  if round(v_order.amount*100)::bigint<>p_amount_paise then raise exception 'capture amount mismatch'; end if;
  perform public.record_payment_capture(p_razorpay_payment_id,p_razorpay_order_id,p_amount_paise,null);
  select * into v_capture from public.payment_captures where payment_id=p_razorpay_payment_id for update;
  if v_capture.status in ('compensation_pending','compensated') then return; end if;
  if v_order.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_order.user_id::text,0));
  end if;
  select v_capture.status='reversed' or exists(select 1 from public.provider_events where payment_id=p_razorpay_payment_id
    and event_type in ('refund.processed','payment.dispute.created','payment.dispute.under_review',
      'payment.dispute.action_required','payment.dispute.lost') and status in ('pending','applied')) into v_reversal;
  if v_reversal then v_reason:='reversal_received';
  elsif v_order.user_id is null then v_reason:='account_deleted';
  elsif v_order.referral_discount>0 and (v_order.status in ('cancelled','failed')
      or (v_order.expires_at is not null and coalesce(p_paid_at,now())>v_order.expires_at)) then
    v_reason:='stale_discount';
  elsif v_order.referral_discount>0 and not exists(select 1 from public.first_discount_reservations
      where order_id=v_order.id and user_id=v_order.user_id) then v_reason:='discount_reused';
  elsif exists(select 1 from public.purchases where user_id=v_order.user_id
      and product_id=v_order.product_id and status='success' and order_id is distinct from v_order.id) then
    v_reason:='already_owned';
  elsif v_order.amount<>v_order.list_price-v_order.referral_discount-v_order.wallet_amount then
    v_reason:='underpriced_order';
  end if;
  if v_reason is null then
    begin
      perform public.settle_razorpay_payment_legacy(p_event_id,p_razorpay_order_id,
        p_razorpay_payment_id,p_amount_paise,p_paid_at);
    exception when others then
      v_error:=sqlerrm;
      if v_error like 'wallet shortfall:%' then v_reason:='wallet_shortfall';
      else raise; end if;
    end;
  end if;
  if v_reason is not null then
    update public.orders set status=case when v_reversal then 'refunded' else 'paid' end,
      razorpay_payment_id=p_razorpay_payment_id, updated_at=now(),
      payment_completed_at=coalesce(payment_completed_at,clock_timestamp())
      where id=v_order.id and status<>'refunded';
    insert into public.payment_compensations(payment_id,order_id,amount_paise,reason,refund_request_id)
      select p_razorpay_payment_id,v_order.id,p_amount_paise,v_reason,
        'medveda_comp_' || md5(p_razorpay_payment_id)
      where not v_reversal on conflict(payment_id) do nothing;
    update public.payment_captures set status=case when v_reversal then 'reversed' else 'compensation_pending' end,
      failure_reason=v_reason where payment_id=p_razorpay_payment_id;
  else
    update public.payment_captures set status='granted' where payment_id=p_razorpay_payment_id;
  end if;
  update public.orders set payment_provider_time=coalesce(payment_provider_time,v_capture.provider_time),
    payment_received_at=coalesce(payment_received_at,v_capture.received_at),
    payment_completed_at=coalesce(payment_completed_at,clock_timestamp()),
    payment_time_fallback=(v_capture.provider_time is null)
    where id=v_order.id;
  update public.provider_events set status='applied'
    where event_id=p_event_id and event_type='payment.captured';
end $$;
revoke all on function public.settle_razorpay_payment(text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_razorpay_payment(text,text,text,bigint,timestamptz) to service_role;

create or replace function public.grant_razorpay_payment(
  p_event_id text,p_razorpay_order_id text,p_razorpay_payment_id text,p_amount_paise bigint)
returns void language sql security definer set search_path=public as $$
  select public.settle_razorpay_payment(p_event_id,p_razorpay_order_id,
    p_razorpay_payment_id,p_amount_paise,null::timestamptz);
$$;
revoke all on function public.grant_razorpay_payment(text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.grant_razorpay_payment(text,text,text,bigint) to service_role;
commit;
