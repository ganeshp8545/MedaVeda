-- ============================================================================
-- Phase 2 hardening: the friend discount can be used at most once.
--
-- create_priced_order prices every open checkout with the friend discount while
-- the referral is unconsumed, and a cancelled checkout can still be paid. So a
-- friend could pay two orders that were both discounted. Pricing cannot stop
-- that; settlement does: the first discounted order to settle claims the
-- referral (referrals.discount_order_id); a second discounted order is recorded
-- as a normal paid order (the customer paid real money for what checkout showed,
-- so access IS granted) but flagged 'discount_reused' for an admin, with no wallet
-- debit and no referrer credit.
-- ============================================================================
alter table public.referrals
  add column if not exists discount_order_id text references public.orders(id) on delete set null;

alter table public.order_review_flags drop constraint if exists order_review_flags_reason_check;
alter table public.order_review_flags
  add constraint order_review_flags_reason_check
  check (reason in ('stale_order_paid', 'discount_reused'));

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
  v_discount_owner text;
  v_discount_dup boolean := false;
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

  -- ---- Friend discount is usable ONCE per referral -------------------------
  -- create_priced_order can price several open checkouts with the discount (an
  -- earlier one is cancelled but may still be paid). The first discounted order
  -- to settle claims referrals.discount_order_id; any other discounted order is
  -- a second use of the same discount. Serialised per user by the wallet
  -- advisory lock above; replays of the winner see their own id and pass.
  -- A second use is still granted (the customer paid what checkout charged) but
  -- gets no wallet debit and no referrer credit, and is flagged below.
  if v_order.referral_discount > 0 and v_order.referral_id is not null then
    update public.referrals set discount_order_id = v_order.id
     where id = v_order.referral_id and discount_order_id is null;
    select discount_order_id into v_discount_owner from public.referrals where id = v_order.referral_id;
    v_discount_dup := found and v_discount_owner is not null and v_discount_owner <> v_order.id;
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

  -- ---- Second use of the friend discount -----------------------------------
  if v_discount_dup then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'discount_reused', v_order.wallet_amount, v_order.referral_discount,
            jsonb_build_object('discount_order_id', v_discount_owner, 'order_status', v_order.status,
                               'razorpay_payment_id', p_razorpay_payment_id))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % reuses the friend discount already used by order %; access granted, no wallet debit / referrer credit, flagged for review',
      v_order.id, v_discount_owner;
  end if;

  -- ---- Wallet debit -------------------------------------------------------
  if v_order.wallet_amount > 0 and not v_stale and not v_discount_dup then
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
  if found and not v_discount_dup and v_ref.first_order_id is null and v_ref.status in ('pending', 'qualified')
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
