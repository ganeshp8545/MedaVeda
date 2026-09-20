-- ============================================================================
-- PHASE 2 (3/3) — server-side pricing, wallet debit + referral credit at
-- settlement, refund handling, stricter code application
-- ============================================================================
-- Depends on 20260925100000 (config, product_type) and 20260925110000 (ledger).
-- Security model is unchanged from Phase 1: clients still cannot write orders,
-- purchases, payments or the ledger. The client never sends an amount; every
-- number below is computed here from `products`, `referral_settings` and the
-- ledger.
--
-- orders.amount stays "what Razorpay charges" (final payable), so the existing
-- settlement checks (payment amount == order amount, razorpay order amount ==
-- order amount) keep working untouched. The breakdown is stored beside it:
--   list_price        selling price (products.price, never MRP)
--   referral_discount friend's first-purchase discount
--   wallet_amount     wallet credit applied
--   amount            = list_price - referral_discount - wallet_amount
-- Older orders have list_price NULL (= amount, no discounts).
-- Idempotent.
begin;

-- ---------------------------------------------------------------------------
-- 1. orders: price breakdown, immutable like amount
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists list_price        numeric(10, 2),
  add column if not exists referral_discount numeric(10, 2) not null default 0,
  add column if not exists wallet_amount     numeric(10, 2) not null default 0,
  add column if not exists referral_id       uuid references public.referrals(id) on delete set null,
  add column if not exists expires_at        timestamptz;   -- NULL on legacy orders = never expires

alter table public.orders drop constraint if exists orders_phase2_amounts;
alter table public.orders add constraint orders_phase2_amounts check (
  referral_discount >= 0 and wallet_amount >= 0
  and (list_price is null or list_price - referral_discount - wallet_amount = amount)
) not valid;   -- legacy rows are all NULL/0 and satisfy it; NOT VALID avoids a table scan lock

-- Same rules as Phase 1, plus: the breakdown is immutable, and razorpay_order_id
-- may be set ONCE (NULL -> value) because create-order now inserts the priced
-- order first and attaches the Razorpay order id right after.
create or replace function public.orders_immutable_columns()
returns trigger
language plpgsql
as $$
begin
  if new.amount is distinct from old.amount then
    raise exception 'orders.amount is immutable' using errcode = '42501';
  end if;
  if old.razorpay_order_id is not null and new.razorpay_order_id is distinct from old.razorpay_order_id then
    raise exception 'orders.razorpay_order_id is immutable' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    raise exception 'orders.user_id is immutable' using errcode = '42501';
  end if;
  if new.product_id is distinct from old.product_id and new.product_id is not null then
    raise exception 'orders.product_id is immutable' using errcode = '42501';
  end if;
  if new.list_price is distinct from old.list_price
     or new.referral_discount is distinct from old.referral_discount
     or new.wallet_amount is distinct from old.wallet_amount then
    raise exception 'orders price breakdown is immutable' using errcode = '42501';
  end if;
  if new.referral_id is distinct from old.referral_id and new.referral_id is not null then
    raise exception 'orders.referral_id is immutable' using errcode = '42501';
  end if;
  if new.expires_at is distinct from old.expires_at then
    raise exception 'orders.expires_at is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. create_priced_order: the ONLY place a price is decided
-- ---------------------------------------------------------------------------
-- Called by the create-order Edge Function (service_role). Returns
--   {ok:true, order_id, list_price, referral_discount, wallet_amount, amount, title}
--   {ok:false, code}   code in product_unavailable | wallet_not_allowed | invalid_price
-- Everything happens under a per-user advisory lock, so two concurrent
-- checkouts cannot both spend the same wallet balance or discount.
-- ALL of the user's older unpaid orders are cancelled when a new checkout is
-- created, and the new order expires after referral_settings.checkout_expiry_minutes
-- (default 30). Settlement treats a cancelled / expired order specially (section 3).
create or replace function public.create_priced_order(
  p_user_id uuid,
  p_product_id text,
  p_use_wallet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set      public.referral_settings%rowtype;
  v_product  public.products%rowtype;
  v_ref      public.referrals%rowtype;
  v_price    numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_wallet   numeric(10, 2) := 0;
  v_base     numeric(10, 2);
  v_cap      numeric(10, 2);
  v_balance  numeric(10, 2);
  v_final    numeric(10, 2);
  v_order_id text := gen_random_uuid()::text;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));

  select * into v_product from public.products where id = p_product_id;
  if not found or not v_product.active or not (v_product.price > 0) then
    return jsonb_build_object('ok', false, 'code', 'product_unavailable');
  end if;
  v_price := v_product.price::numeric(10, 2);
  if v_price < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_price');
  end if;

  select * into v_set from public.referral_settings where id = true;

  -- Friend discount: first purchase only, code applied at signup, program on.
  if v_set.enabled and v_set.friend_discount_percent > 0 then
    select r.* into v_ref
      from public.referrals r
      join public.profiles rp on rp.id = r.referrer_id and not rp.blocked
     where r.referred_id = p_user_id
       and r.status in ('pending', 'qualified')
       and r.first_order_id is null
       and not exists (select 1 from public.purchases pu
                        where pu.user_id = p_user_id and pu.status = 'success');
    if found then
      v_discount := round(v_price * v_set.friend_discount_percent / 100, 2);
      if v_set.friend_discount_max is not null then
        v_discount := least(v_discount, v_set.friend_discount_max);
      end if;
      v_discount := greatest(0, least(v_discount, v_price - 1));
    end if;
  end if;

  v_base := v_price - v_discount;

  -- Wallet: notes products only, capped at wallet_max_percent of what is left
  -- after the friend discount, and never more than the available balance.
  if p_use_wallet then
    if not (v_product.product_type = any (v_set.wallet_product_types)) then
      return jsonb_build_object('ok', false, 'code', 'wallet_not_allowed');
    end if;
    perform public.release_due_wallet_credits(p_user_id);
    select available into v_balance from public.wallet_balance_of(p_user_id);
    v_cap := floor(v_base * v_set.wallet_max_percent) / 100;
    v_wallet := greatest(0, least(v_cap, coalesce(v_balance, 0)));
  end if;

  v_final := v_price - v_discount - v_wallet;
  if v_final < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_price');
  end if;

  -- Validation passed: only now cancel every earlier unpaid order of this user.
  update public.orders
     set status = 'cancelled', updated_at = now()
   where user_id = p_user_id and status = 'created';

  insert into public.orders (
    id, user_id, product_id, scope, chapter_id, subject_id, year_id, year_ids, course_id,
    amount, list_price, referral_discount, wallet_amount, referral_id, status, expires_at
  ) values (
    v_order_id, p_user_id, v_product.id, v_product.scope, v_product.chapter_id, v_product.subject_id,
    v_product.year_id, v_product.year_ids, v_product.course_id,
    v_final, v_price, v_discount, v_wallet,
    case when v_discount > 0 then v_ref.id end, 'created',
    now() + make_interval(mins => v_set.checkout_expiry_minutes)
  );

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'title', v_product.title,
    'list_price', v_price, 'referral_discount', v_discount,
    'wallet_amount', v_wallet, 'amount', v_final,
    'timeout_seconds', v_set.checkout_expiry_minutes * 60
  );
end;
$$;

revoke all on function public.create_priced_order(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_priced_order(uuid, text, boolean) to service_role;

-- Read-only quote for the checkout screen. Same maths, no order is created, so
-- what the screen shows is what create_priced_order will charge.
create or replace function public.quote_my_order(p_product_id text, p_use_wallet boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_set      public.referral_settings%rowtype;
  v_product  public.products%rowtype;
  v_price    numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_wallet   numeric(10, 2) := 0;
  v_avail    numeric(10, 2) := 0;
  v_cap      numeric(10, 2) := 0;
  v_eligible boolean := false;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_product from public.products where id = p_product_id and active;
  if not found then return jsonb_build_object('ok', false, 'code', 'product_unavailable'); end if;
  v_price := v_product.price::numeric(10, 2);
  select * into v_set from public.referral_settings where id = true;

  if v_set.enabled and v_set.friend_discount_percent > 0
     and exists (select 1 from public.referrals r
                   join public.profiles rp on rp.id = r.referrer_id and not rp.blocked
                  where r.referred_id = v_uid and r.status in ('pending', 'qualified') and r.first_order_id is null)
     and not exists (select 1 from public.purchases pu where pu.user_id = v_uid and pu.status = 'success') then
    v_discount := round(v_price * v_set.friend_discount_percent / 100, 2);
    if v_set.friend_discount_max is not null then v_discount := least(v_discount, v_set.friend_discount_max); end if;
    v_discount := greatest(0, least(v_discount, v_price - 1));
  end if;

  v_eligible := v_product.product_type = any (v_set.wallet_product_types);
  if v_eligible then
    perform public.release_due_wallet_credits(v_uid);
    select available into v_avail from public.wallet_balance_of(v_uid);
    v_cap := floor((v_price - v_discount) * v_set.wallet_max_percent) / 100;
    if p_use_wallet then v_wallet := greatest(0, least(v_cap, coalesce(v_avail, 0))); end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'list_price', v_price, 'referral_discount', v_discount,
    'wallet_eligible', v_eligible, 'wallet_available', coalesce(v_avail, 0),
    'wallet_max_usable', least(v_cap, coalesce(v_avail, 0)),
    'wallet_amount', v_wallet, 'amount', v_price - v_discount - v_wallet
  );
end;
$$;

revoke all on function public.quote_my_order(text, boolean) from public, anon;
grant execute on function public.quote_my_order(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Orders needing an admin's eyes (money moved on an order that was no
-- longer live when the payment came in). Written by settlement only.
-- ---------------------------------------------------------------------------
create table if not exists public.order_review_flags (
  id                uuid primary key default gen_random_uuid(),
  order_id          text references public.orders(id) on delete set null,
  user_id           uuid references public.profiles(id) on delete set null,
  reason            text not null check (reason in ('stale_order_paid')),
  wallet_amount     numeric(10, 2) not null default 0,
  referral_discount numeric(10, 2) not null default 0,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid,
  resolution_note   text
);
create unique index if not exists order_review_flags_one_per_order_reason
  on public.order_review_flags (order_id, reason) where order_id is not null;

alter table public.order_review_flags enable row level security;
drop policy if exists "order_review_flags_admin_select" on public.order_review_flags;
create policy "order_review_flags_admin_select" on public.order_review_flags
  for select to authenticated using (public.am_i_admin());
revoke all on public.order_review_flags from public, anon, authenticated;
grant select on public.order_review_flags to authenticated;
grant all on public.order_review_flags to service_role;

drop trigger if exists order_review_flags_00_block_client_writes on public.order_review_flags;
create trigger order_review_flags_00_block_client_writes
  before insert or update or delete on public.order_review_flags
  for each row execute function public.block_client_writes();

create or replace function public.admin_resolve_order_flag(p_flag_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  perform set_config('app.trusted_order_write', 'true', true);
  update public.order_review_flags
     set resolved_at = now(), resolved_by = auth.uid(), resolution_note = left(coalesce(p_note, ''), 500)
   where id = p_flag_id and resolved_at is null;
  perform set_config('app.trusted_order_write', 'false', true);
  if not found then raise exception 'Flag not found or already resolved'; end if;
end;
$$;
revoke all on function public.admin_resolve_order_flag(uuid, text) from public, anon;
grant execute on function public.admin_resolve_order_flag(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Settlement: grant + wallet debit + referrer credit, one transaction
-- ---------------------------------------------------------------------------
-- Same signature, locking and idempotency as the Phase 1 version. Additions:
--   * per-user advisory lock (same key as create_priced_order), taken BEFORE the
--     order row lock so the two functions can't deadlock;
--   * wallet debit (idempotent: one debit row per order, unique index), only
--     after Razorpay confirmed the capture. If the order was CANCELLED / FAILED,
--     or the payment was initiated after orders.expires_at, the wallet is NOT
--     debited: the order is flagged in order_review_flags for an admin instead
--     (the cash payment is real, so access is still granted);
--   * the real logic lives in settle_razorpay_payment(..., p_paid_at); the
--     4-argument grant_razorpay_payment() is kept as a wrapper (paid_at = now())
--     for anything still calling the old signature;
--   * referrer credit (idempotent: one credit per referral, unique index) on the
--     friend's first successful purchase, held for credit_hold_days.
create or replace function public.settle_razorpay_payment(
  p_event_id text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint,
  p_paid_at timestamptz default null   -- when the customer started the payment (Razorpay payment.created_at)
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_existing_payment_order_id text;
  v_set public.referral_settings%rowtype;
  v_ref public.referrals%rowtype;
  v_balance numeric(10, 2);
  v_debit numeric(10, 2);
  v_stale boolean;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

  select user_id into v_uid from public.orders where razorpay_order_id = p_razorpay_order_id;
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
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

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
  end if;

  -- Account deleted while the payment was in flight: keep the accounting row,
  -- grant nothing, debit nothing, reward nothing (refund manually).
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

  -- ---- Stale order? -------------------------------------------------------
  -- v_order is the row as it was BEFORE this settlement flipped it to 'paid'.
  -- Replays see 'paid' and rely on the flag written the first time.
  v_stale := exists (select 1 from public.order_review_flags
                      where order_id = v_order.id and reason = 'stale_order_paid')
          or v_order.status in ('cancelled', 'failed')
          or (v_order.status = 'created' and v_order.expires_at is not null
              and coalesce(p_paid_at, now()) > v_order.expires_at);

  if v_stale and (v_order.wallet_amount > 0 or v_order.referral_discount > 0) then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'stale_order_paid', v_order.wallet_amount, v_order.referral_discount,
            jsonb_build_object('order_status', v_order.status, 'expires_at', v_order.expires_at,
                               'paid_at', p_paid_at, 'razorpay_payment_id', p_razorpay_payment_id))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % was % / expired when payment % arrived; wallet NOT debited, flagged for review',
      v_order.id, v_order.status, p_razorpay_payment_id;
  end if;

  -- ---- Wallet debit -------------------------------------------------------
  if v_order.wallet_amount > 0 and not v_stale then
    perform public.release_due_wallet_credits(v_order.user_id);
    select available into v_balance from public.wallet_balance_of(v_order.user_id);
    -- Normally balance >= wallet_amount (create_priced_order checked it under
    -- the same lock). Clamp anyway so the balance can never go negative.
    v_debit := least(v_order.wallet_amount, coalesce(v_balance, 0));
    if v_debit < v_order.wallet_amount
       and not exists (select 1 from public.wallet_ledger
                        where order_id = v_order.id and entry_type = 'debit' and source = 'order_payment') then
      raise warning 'settle_razorpay_payment: order % wanted % wallet credit but only % was available',
        v_order.id, v_order.wallet_amount, v_balance;
    end if;
    if v_debit > 0 then
      insert into public.wallet_ledger (user_id, entry_type, status, amount, source, order_id, note)
      values (v_order.user_id, 'debit', 'available', v_debit, 'order_payment', v_order.id, 'Wallet used at checkout')
      on conflict (order_id) where entry_type = 'debit' and source = 'order_payment' do nothing;
    end if;
  end if;

  -- ---- Referrer credit ----------------------------------------------------
  -- Only the friend's FIRST successful purchase counts, and only once.
  select * into v_ref from public.referrals where referred_id = v_order.user_id for update;
  if found and v_ref.first_order_id is null and v_ref.status in ('pending', 'qualified')
     and not exists (select 1 from public.purchases
                      where user_id = v_order.user_id and order_id <> v_order.id and status = 'success') then
    update public.referrals
       set first_order_id = v_order.id, status = 'qualified', qualified_at = coalesce(qualified_at, now())
     where id = v_ref.id;

    select * into v_set from public.referral_settings where id = true;
    if v_set.enabled and v_set.referrer_credit_amount > 0
       and exists (select 1 from public.profiles where id = v_ref.referrer_id and not blocked) then
      insert into public.wallet_ledger (
        user_id, entry_type, status, amount, source, referral_id, order_id,
        available_at, expires_at, note
      ) values (
        v_ref.referrer_id, 'credit', 'pending', v_set.referrer_credit_amount::numeric(10, 2),
        'referral_reward', v_ref.id, v_order.id,
        now() + make_interval(days => v_set.credit_hold_days),
        case when v_set.credit_expiry_days is null then null
             else now() + make_interval(days => v_set.credit_hold_days + v_set.credit_expiry_days) end,
        'Friend''s first purchase'
      ) on conflict (referral_id) where entry_type = 'credit' and source = 'referral_reward' do nothing;
    end if;
  end if;

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured')
  on conflict (event_id) do nothing;
end;
$function$;

revoke all on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz)
  to service_role;

create or replace function public.grant_razorpay_payment(
  p_event_id text,
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_paise bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.settle_razorpay_payment(p_event_id, p_razorpay_order_id, p_razorpay_payment_id, p_amount_paise, null);
$$;

revoke all on function public.grant_razorpay_payment(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Refunds
-- ---------------------------------------------------------------------------
-- Called by the razorpay-webhook function on refund.processed, AFTER it has
-- re-fetched the payment from Razorpay and confirmed a FULL refund.
--   * wallet amount the order used -> restored to the buyer as an 'order_refund'
--     credit (once per order, unique index); nothing to restore if the order
--     never debited (e.g. it was flagged as stale)
--   * friend's referrer credit still inside its hold -> cancelled, referral rejected
--   * credit already released -> untouched, reported back so an admin can decide
--     (admin_reverse_wallet_credit)
-- Returns {status: <referral outcome>, wallet_restored: <amount>}. Idempotent.
create or replace function public.handle_payment_refund(p_razorpay_payment_id text, p_full_refund boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_credit public.wallet_ledger%rowtype;
  v_debit public.wallet_ledger%rowtype;
  v_restored numeric(10, 2) := 0;
  v_rows integer := 0;
  v_status jsonb;
begin
  select * into v_order from public.orders where razorpay_payment_id = p_razorpay_payment_id for update;
  if not found then return jsonb_build_object('status', 'unknown_payment'); end if;
  if not p_full_refund then return jsonb_build_object('status', 'partial_refund_ignored'); end if;

  update public.orders set status = 'refunded', updated_at = now()
   where id = v_order.id and status = 'paid';

  -- ---- Restore the wallet amount this order used ---------------------------
  select * into v_debit from public.wallet_ledger
   where order_id = v_order.id and entry_type = 'debit' and source = 'order_payment';
  if found and v_debit.user_id is not null then
    perform set_config('app.trusted_order_write', 'true', true);
    insert into public.wallet_ledger (user_id, entry_type, status, amount, source, order_id, note)
    values (v_debit.user_id, 'credit', 'available', v_debit.amount, 'order_refund', v_order.id,
            'Wallet amount restored after refund')
    on conflict (order_id) where entry_type = 'credit' and source = 'order_refund' do nothing;
    get diagnostics v_rows = row_count;   -- 1 on first insert, 0 on replay
    perform set_config('app.trusted_order_write', 'false', true);
    v_restored := case when v_rows > 0 then v_debit.amount else 0 end;
  end if;

  -- ---- Friend's referrer credit -------------------------------------------
  select l.* into v_credit
    from public.referrals r
    join public.wallet_ledger l on l.referral_id = r.id and l.entry_type = 'credit' and l.source = 'referral_reward'
   where r.first_order_id = v_order.id
   for update of l;

  if not found then
    v_status := jsonb_build_object('status', 'no_referral_credit');
  elsif v_credit.status = 'cancelled' then
    v_status := jsonb_build_object('status', 'already_cancelled');
  elsif v_credit.status = 'pending' and v_credit.available_at > now() then
    perform set_config('app.trusted_order_write', 'true', true);
    update public.wallet_ledger set status = 'cancelled' where id = v_credit.id;
    perform set_config('app.trusted_order_write', 'false', true);
    update public.referrals
       set status = 'rejected', reject_reason = 'friend_payment_refunded'
     where id = v_credit.referral_id;
    v_status := jsonb_build_object('status', 'credit_cancelled', 'amount', v_credit.amount);
  else
    raise warning 'handle_payment_refund: credit % for order % was already released; reverse it manually if appropriate', v_credit.id, v_order.id;
    v_status := jsonb_build_object('status', 'credit_already_released', 'ledger_id', v_credit.id);
  end if;

  return v_status || jsonb_build_object('wallet_restored', v_restored);
end;
$$;

revoke all on function public.handle_payment_refund(text, boolean) from public, anon, authenticated;
grant execute on function public.handle_payment_refund(text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 5. apply_referral_code: signup-only, configurable window, no reward at signup
-- ---------------------------------------------------------------------------
-- Same signature and return shape as before (released builds keep working).
-- Differences: the window comes from referral_settings.apply_window_days
-- (was a hardcoded 7 days) and the referral always starts 'pending' - rewards
-- are decided at payment, never at signup.
create or replace function public.apply_referral_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.referral_settings%rowtype;
  v_referrer public.profiles%rowtype;
  v_caller public.profiles%rowtype;
  v_referral_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'message', 'Not authenticated.');
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('status', 'invalid_code', 'message', 'Please enter a referral code.');
  end if;

  select * into v_settings from public.referral_settings where id = true;
  if v_settings is null or not v_settings.enabled then
    return jsonb_build_object('status', 'disabled', 'message', 'Referrals are not available right now.');
  end if;

  select * into v_caller from public.profiles where id = v_uid;
  if v_caller is null then
    return jsonb_build_object('status', 'error', 'message', 'Profile not found.');
  end if;

  select * into v_referrer from public.profiles where upper(referral_code) = upper(trim(p_code));
  if v_referrer is null then
    return jsonb_build_object('status', 'invalid_code', 'message', 'That referral code was not found.');
  end if;
  if v_referrer.id = v_uid then
    return jsonb_build_object('status', 'self_referral', 'message', 'You cannot refer yourself.');
  end if;
  if v_referrer.blocked then
    return jsonb_build_object('status', 'referrer_blocked', 'message', 'That referral code is no longer active.');
  end if;
  if exists (select 1 from public.referrals where referred_id = v_uid) then
    return jsonb_build_object('status', 'already_referred', 'message', 'A referral code has already been applied to your account.');
  end if;
  if v_caller.created_at < now() - make_interval(days => v_settings.apply_window_days) then
    return jsonb_build_object('status', 'too_late', 'message', 'Referral codes can only be used when you sign up.');
  end if;
  if exists (select 1 from public.purchases where user_id = v_uid and status = 'success')
     or exists (select 1 from public.orders where user_id = v_uid and status = 'paid') then
    return jsonb_build_object('status', 'already_purchased', 'message', 'Referral codes must be applied before your first purchase.');
  end if;

  if v_settings.max_referrals_per_user is not null then
    select count(*) into v_referral_count from public.referrals where referrer_id = v_referrer.id;
    if v_referral_count >= v_settings.max_referrals_per_user then
      return jsonb_build_object('status', 'referrer_limit_reached', 'message', 'That referral code has reached its usage limit.');
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, code_used, status)
  values (v_referrer.id, v_uid, upper(trim(p_code)), 'pending');

  return jsonb_build_object('status', 'success', 'message', 'Referral applied successfully.');
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_referred', 'message', 'A referral code has already been applied to your account.');
end;
$$;

revoke all on function public.apply_referral_code(text) from public, anon;
grant execute on function public.apply_referral_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Admin: reject a referral (fraud). Cancels the referrer's credit if it is
-- still pending; an already-released credit is left for admin_reverse_wallet_credit.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reject_referral(p_referral_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit public.wallet_ledger%rowtype;
  v_cancelled boolean := false;
begin
  if not public.am_i_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.referrals
     set status = 'rejected', reject_reason = left(coalesce(nullif(trim(p_reason), ''), 'rejected by admin'), 500)
   where id = p_referral_id and status <> 'rejected';
  if not found then
    raise exception 'Referral not found or already rejected';
  end if;
  select * into v_credit from public.wallet_ledger
   where referral_id = p_referral_id and entry_type = 'credit' and source = 'referral_reward' for update;
  if found and v_credit.status = 'pending' then
    perform set_config('app.trusted_order_write', 'true', true);
    update public.wallet_ledger set status = 'cancelled' where id = v_credit.id;
    perform set_config('app.trusted_order_write', 'false', true);
    v_cancelled := true;
  end if;
  return jsonb_build_object('credit_cancelled', v_cancelled,
                            'credit_already_released', found and v_credit.status = 'available');
end;
$$;

revoke all on function public.admin_reject_referral(uuid, text) from public, anon;
grant execute on function public.admin_reject_referral(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-checks
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_priced_order(uuid,text,boolean)',
    'public.handle_payment_refund(text,boolean)',
    'public.grant_razorpay_payment(text,text,text,bigint)',
    'public.settle_razorpay_payment(text,text,text,bigint,timestamptz)',
    'public.release_due_wallet_credits(uuid)'
  ] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'PHASE2 self-check: % executable by a client role', f;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.orders', 'insert')
     or has_table_privilege('authenticated', 'public.orders', 'update') then
    raise exception 'PHASE2 self-check: client can write orders';
  end if;
end;
$$;

commit;
