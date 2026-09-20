-- ============================================================================
-- CRITICAL 2 — orders are created and settled by the server only
-- ============================================================================
-- Attack closed: pay Rs 49 for a cheap product, then rewrite the SAME order row
-- (product_id / amount) to a Rs 1,999 bundle before verification.
--
--   1. Clients (anon / authenticated, including admins using the admin panel's
--      anon key) get NO insert / update / delete on orders. SELECT stays: own
--      orders for students, all orders for admins.
--   2. New Edge Function `create-order` is the only creator. It reads the price
--      and scope from `products` server-side, creates the Razorpay order, and
--      inserts product_id + amount + razorpay_order_id in ONE insert.
--   3. An immutability trigger rejects any change to product_id, amount,
--      user_id, razorpay_order_id after insert - for every role, including
--      service_role. (Only the two system-driven exceptions below.)
--   4. grant_razorpay_payment() is replaced: it grants the product stored on
--      the order row (never anything client-supplied), compares the amount, and
--      no longer needs the retired payment_sessions / pay flow.
--   5. Admins keep a narrow RPC to cancel/fail a stuck order - it can never set
--      'paid'.
-- Existing orders, purchases and payments are not modified. Idempotent.
--
-- DEPLOY ORDER MATTERS: ship the `create-order` Edge Function and a mobile build
-- that calls it BEFORE (or together with) this migration; released builds that
-- still insert orders directly will get "permission denied" (see the notes in
-- docs/security/SECURITY_FIX_NOTES.md).
begin;

create temp table _c2_counts on commit drop as
select 'orders' t, count(*) n from public.orders
union all select 'purchases', count(*) from public.purchases
union all select 'payments', count(*) from public.payments;

-- ---------------------------------------------------------------------------
-- 1. No client write path on orders
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'orders' and cmd <> 'SELECT'
  loop
    execute format('drop policy %I on public.orders', r.policyname);
    raise notice 'CRITICAL2: dropped orders policy %', r.policyname;
  end loop;
end;
$$;

alter table public.orders enable row level security;

drop policy if exists "Users can view own orders" on public.orders;
create policy "Users can view own orders" on public.orders
  for select using (auth.uid() = user_id);
drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders" on public.orders
  for select using (public.am_i_admin());

revoke insert, update, delete, truncate on public.orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Immutable money / ownership columns
-- ---------------------------------------------------------------------------
-- Allowed, system-driven changes only:
--   * user_id -> NULL   (account deletion anonymises orders; FK ON DELETE SET NULL)
--   * product_id -> NULL (an admin deletes a product; FK ON DELETE SET NULL)
-- Everything else on these four columns is rejected for every role.
create or replace function public.orders_immutable_columns()
returns trigger
language plpgsql
as $$
begin
  if new.amount is distinct from old.amount then
    raise exception 'orders.amount is immutable' using errcode = '42501';
  end if;
  if new.razorpay_order_id is distinct from old.razorpay_order_id then
    raise exception 'orders.razorpay_order_id is immutable' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'orders.user_id is immutable' using errcode = '42501';
  end if;
  if new.product_id is distinct from old.product_id and new.product_id is not null then
    raise exception 'orders.product_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_01_immutable_columns on public.orders;
create trigger orders_01_immutable_columns
  before update on public.orders
  for each row execute function public.orders_immutable_columns();

-- ---------------------------------------------------------------------------
-- 3. Settlement: grant the product stored on the order, nothing else
-- ---------------------------------------------------------------------------
-- Same signature and locking as before. Differences from the Phase 1A body:
--   * the payment_sessions requirement is gone (the pay / create-payment-session
--     flow is retired; the order row itself now carries product + amount +
--     razorpay_order_id from a server-side insert, and is immutable);
--   * the amount check remains authoritative: Razorpay-reported paise must equal
--     the order's stored amount.
-- The Edge Functions have ALREADY verified signature / captured status /
-- currency / order-id with Razorpay before calling this.
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
as $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  -- Row lock serialises a webhook retry with the client verification path.
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

  -- One payment id can only ever belong to one order.
  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  -- Account deleted while the payment was in flight: keep the accounting row,
  -- grant nothing (refund manually).
  if v_order.user_id is null then
    insert into public.payments (
      order_id, user_id, product_id, amount, razorpay_order_id,
      razorpay_payment_id, status, verified_at
    ) values (
      v_order.id, null, v_order.product_id, v_order.amount,
      p_razorpay_order_id, p_razorpay_payment_id, 'success', now()
    ) on conflict (razorpay_payment_id) do nothing;

    update public.orders
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now()
    where id = v_order.id;

    insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
    values (p_event_id, p_razorpay_payment_id, 'payment.captured')
    on conflict (event_id) do nothing;

    raise warning 'grant_razorpay_payment: payment % for order % arrived after the account was deleted; no access granted - refund manually', p_razorpay_payment_id, v_order.id;
    return;
  end if;

  -- The product comes from the order row (immutable), never from a caller.
  select * into v_product from public.products where id = v_order.product_id;
  if not found then
    raise exception 'Order % references unknown product %', v_order.id, v_order.product_id;
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
    subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_product.id, coalesce(v_product.title, 'Your content'),
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id;

  -- Referral qualification (unchanged behaviour; idempotent).
  update public.referrals
  set status = 'qualified', qualified_at = now()
  where referred_id = v_order.user_id
    and status = 'pending'
    and exists (
      select 1 from public.referral_settings where id = true and qualify_on = 'first_purchase'
    );

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$function$;

revoke all on function public.grant_razorpay_payment(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Admin: cancel / fail a stuck order (never 'paid')
-- ---------------------------------------------------------------------------
-- The admin panel used a direct UPDATE on orders. That policy is gone; this is
-- its replacement. It cannot mark anything paid and cannot touch an order that
-- already has a payment.
create or replace function public.admin_set_order_status(p_order_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('cancelled', 'failed') then
    raise exception 'Admins can only cancel or fail an order; paid is set by the payment system';
  end if;
  update public.orders
  set status = p_status, updated_at = now()
  where id = p_order_id
    and status = 'created'
    and razorpay_payment_id is null
    and not exists (select 1 from public.payments p where p.order_id = orders.id);
  if not found then
    raise exception 'Order not found, or it is already paid / settled';
  end if;
end;
$$;

revoke all on function public.admin_set_order_status(text, text) from public, anon;
grant execute on function public.admin_set_order_status(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-checks (roll back everything on failure)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and cmd <> 'SELECT') then
    raise exception 'CRITICAL2 self-check: a non-SELECT policy remains on orders';
  end if;
  if has_table_privilege('authenticated', 'public.orders', 'insert')
     or has_table_privilege('authenticated', 'public.orders', 'update')
     or has_table_privilege('authenticated', 'public.orders', 'delete')
     or has_table_privilege('anon', 'public.orders', 'insert') then
    raise exception 'CRITICAL2 self-check: client still has write privileges on orders';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'orders_01_immutable_columns' and not tgisinternal) then
    raise exception 'CRITICAL2 self-check: immutability trigger missing';
  end if;
  if has_function_privilege('authenticated', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute')
     or has_function_privilege('anon', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute') then
    raise exception 'CRITICAL2 self-check: grant_razorpay_payment executable by client';
  end if;
  for r in
    select c.t, c.n,
      case c.t when 'orders' then (select count(*) from public.orders)
               when 'purchases' then (select count(*) from public.purchases)
               when 'payments' then (select count(*) from public.payments) end as n2
    from _c2_counts c
  loop
    if r.n is distinct from r.n2 then
      raise exception 'CRITICAL2 self-check: row count changed for % (% -> %)', r.t, r.n, r.n2;
    end if;
  end loop;
end;
$$;

commit;
