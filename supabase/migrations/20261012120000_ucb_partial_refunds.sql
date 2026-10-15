-- Each processed Razorpay refund has its own durable Google report attempt.
-- A stable Razorpay refund ID is also the Google partialRefund.refundId.
begin;

create table if not exists public.ucb_external_refunds (
  refund_id text primary key,
  order_id text not null references public.orders(id),
  amount_paise bigint not null check (amount_paise > 0),
  pre_tax_paise bigint not null check (pre_tax_paise > 0),
  refund_time timestamptz not null,
  is_full boolean not null,
  status text not null default 'pending' check (status in ('pending','processing','failed','reported')),
  attempts integer not null default 0,
  attempted_at timestamptz,
  reported_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ucb_external_refunds_queue
  on public.ucb_external_refunds(status,created_at);
create index if not exists ucb_external_refunds_order_id
  on public.ucb_external_refunds(order_id);
alter table public.ucb_external_refunds enable row level security;
revoke all on public.ucb_external_refunds from public,anon,authenticated;
grant all on public.ucb_external_refunds to service_role;

create or replace function public.claim_ucb_external_refund(p_refund_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ref public.ucb_external_refunds%rowtype; v_order_id text;
begin
  select order_id into v_order_id from public.ucb_external_refunds where refund_id=p_refund_id;
  if v_order_id is null then return jsonb_build_object('ok',false); end if;
  perform pg_advisory_xact_lock(hashtextextended('ucb-refund:' || v_order_id,0));
  select * into v_ref from public.ucb_external_refunds where refund_id=p_refund_id for update;
  if not found or v_ref.status='reported' then return jsonb_build_object('ok',false); end if;
  if v_ref.status='processing' and v_ref.attempted_at>now()-interval '2 minutes' then
    return jsonb_build_object('ok',false);
  end if;
  -- A later webhook can arrive while an earlier/later refund is already being
  -- sent to Google. Never send two refunds for one order concurrently.
  if exists(select 1 from public.ucb_external_refunds busy
     where busy.order_id=v_ref.order_id and busy.refund_id<>v_ref.refund_id
       and busy.status='processing' and busy.attempted_at>now()-interval '2 minutes') then
    return jsonb_build_object('ok',false);
  end if;
  -- Later refunds wait for earlier ones, so currentPreTaxAmount is a useful
  -- reconciliation value after an ambiguous Google response.
  if exists(select 1 from public.ucb_external_refunds prior
     where prior.order_id=v_ref.order_id and prior.refund_id<>v_ref.refund_id
       and (prior.refund_time,prior.refund_id)<(v_ref.refund_time,v_ref.refund_id)
       and prior.status<>'reported') then return jsonb_build_object('ok',false); end if;
  update public.ucb_external_refunds set status='processing',attempts=attempts+1,
    attempted_at=now(),error=null where refund_id=p_refund_id;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.claim_ucb_external_refund(text) from public,anon,authenticated;
grant execute on function public.claim_ucb_external_refund(text) to service_role;

commit;
