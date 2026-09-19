-- Atomic, idempotent Razorpay settlement. Apply with `supabase db push`
-- before deploying razorpay-webhook.

alter table public.purchases
  add column if not exists product_id text references public.products(id) on delete set null,
  add column if not exists product_title text,
  add column if not exists razorpay_order_id text;

-- The historical reconstructed schema used a text id without a default,
-- while the Edge Functions intentionally do not accept client-supplied ids.
-- Support both deployed UUID and text variants safely.
do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'purchases' and column_name = 'id';

  if id_type = 'uuid' then
    alter table public.purchases alter column id set default gen_random_uuid();
  elsif id_type = 'text' then
    alter table public.purchases alter column id set default gen_random_uuid()::text;
  elsif id_type is null then
    raise exception 'public.purchases.id is missing';
  else
    raise exception 'unsupported public.purchases.id type: %', id_type;
  end if;
end;
$$;

alter table public.payments
  add column if not exists razorpay_order_id text,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists product_id text references public.products(id) on delete set null,
  add column if not exists verified_at timestamptz not null default now();

do $$
declare
  id_type text;
begin
  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'payments' and column_name = 'id';

  if id_type = 'uuid' then
    alter table public.payments alter column id set default gen_random_uuid();
  elsif id_type = 'text' then
    alter table public.payments alter column id set default gen_random_uuid()::text;
  elsif id_type is null then
    raise exception 'public.payments.id is missing';
  else
    raise exception 'unsupported public.payments.id type: %', id_type;
  end if;
end;
$$;

create unique index if not exists purchases_order_id_unique
  on public.purchases(order_id);

create unique index if not exists payments_razorpay_payment_id_unique
  on public.payments(razorpay_payment_id);

create unique index if not exists orders_razorpay_order_id_unique
  on public.orders(razorpay_order_id);

create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  razorpay_payment_id text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);

alter table public.razorpay_webhook_events enable row level security;

create or replace function public.grant_razorpay_payment(
  p_event_id text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  -- This lock serializes a webhook retry with the client verification path.
  select * into v_order
  from public.orders
  where razorpay_order_id = p_razorpay_order_id
  for update;

  if not found then
    raise exception 'Razorpay order % is not linked to an internal order', p_razorpay_order_id;
  end if;
  if round(v_order.amount * 100)::bigint <> p_amount_paise then
    raise exception 'Razorpay amount does not match order amount';
  end if;

  select title into v_product_title from public.products where id = v_order.product_id;
  v_product_title := coalesce(v_product_title, 'Your content');

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  insert into public.payments (
    order_id, user_id, product_id, amount, razorpay_order_id,
    razorpay_payment_id, status, verified_at
  ) values (
    v_order.id, v_order.user_id, v_order.product_id, v_order.amount,
    p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
  ) on conflict (razorpay_payment_id) do nothing;

  insert into public.purchases (
    user_id, order_id, product_id, product_title, scope, chapter_id,
    subject_id, year_id, year_ids, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_order.product_id, v_product_title,
    v_order.scope, v_order.chapter_id, v_order.subject_id, v_order.year_id,
    v_order.year_ids, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now()
  where id = v_order.id;

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$$;

revoke all on function public.grant_razorpay_payment(text, text, text, bigint) from public;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint) to service_role;
