-- Wallet reservations prevent more than one active checkout from consuming the same value.
begin;
create table if not exists public.wallet_order_reservations (
  order_id text primary key references public.orders(id) on delete cascade,
  user_id uuid not null,
  amount numeric(10,2) not null check (amount>0),
  expires_at timestamptz not null
);
create index if not exists wallet_order_reservations_user_idx on public.wallet_order_reservations(user_id);
alter table public.wallet_order_reservations enable row level security;
revoke all on public.wallet_order_reservations from public,anon,authenticated;
grant all on public.wallet_order_reservations to service_role;
-- A reservation is live only while its order is created and unexpired.
-- Cancellation, failure, expiry, payment, and refund release it by state.
CREATE OR REPLACE FUNCTION public.create_priced_order(p_user_id uuid, p_product_id text, p_use_wallet boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Already owns this exact product? Refuse before anything is reserved.
  if exists (select 1 from public.purchases
              where user_id = p_user_id and product_id = v_product.id and status = 'success') then
    return jsonb_build_object('ok', false, 'code', 'already_owned');
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
                        where pu.user_id = p_user_id and pu.status = 'success')
       -- a returning customer (same email / phone bought under an earlier, maybe deleted, account) is not a first-time buyer
       and not public.has_prior_purchase_identity(p_user_id);
    if found then
      v_discount := round(v_price * v_set.friend_discount_percent / 100, 2);
      if v_set.friend_discount_max is not null then
        v_discount := least(v_discount, v_set.friend_discount_max);
      end if;
      v_discount := greatest(0, least(v_discount, v_price - 1));
    end if;
  end if;

  v_base := v_price - v_discount;

  -- Wallet: eligible product types only (referral_settings), capped at wallet_max_percent of what is left
  -- after the friend discount, and never more than the available balance.
  -- Program off: a client-sent use_wallet is ignored (priced with no wallet), never an error.
  if p_use_wallet and v_set.enabled then
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

  if v_wallet > 0 then
    insert into public.wallet_order_reservations(order_id,user_id,amount,expires_at)
    values (v_order_id,p_user_id,v_wallet,now() + make_interval(mins => v_set.checkout_expiry_minutes));
  end if;

  return jsonb_build_object(
    'ok', true, 'order_id', v_order_id, 'title', v_product.title,
    'list_price', v_price, 'referral_discount', v_discount,
    'wallet_amount', v_wallet, 'amount', v_final,
    'timeout_seconds', v_set.checkout_expiry_minutes * 60
  );
end;
$function$;

revoke all on function public.create_priced_order(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_priced_order(uuid,text,boolean) to service_role;
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
as $$
declare
  v_uid uuid;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_existing_payment_order_id text;
  v_set public.referral_settings%rowtype;
  v_ref public.referrals%rowtype;
  v_balance numeric(10, 2);
  v_debit numeric(10, 2) := 0;
  v_stale boolean;
  v_first boolean;                 -- first settlement of this order (not a replay)
  v_debited boolean := false;
  v_discount_owner text;
  v_discount_dup boolean := false;
  v_owned_purchase text;           -- an existing successful purchase of the same product
  v_base jsonb;
  v_other_reserved numeric(10,2);
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
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now(),
        payment_completed_at = case when external_transaction_token is not null
          then coalesce(payment_completed_at, clock_timestamp()) else payment_completed_at end
    where id = v_order.id and status <> 'refunded';

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

  v_first := v_order.status not in ('paid', 'refunded');

  -- A cancelled/expired checkout may have released its reservation. Never
  -- grant a captured payment unless the whole wallet discount can be debited.
  if v_first and v_order.wallet_amount > 0 then
    perform public.release_due_wallet_credits(v_order.user_id);
    select available into v_balance from public.wallet_balance_of(v_order.user_id);
    select coalesce(sum(r.amount),0) into v_other_reserved
      from public.wallet_order_reservations r join public.orders o on o.id=r.order_id
      where r.user_id=v_order.user_id and r.order_id<>v_order.id
        and o.status='created' and r.expires_at>now();
    if coalesce(v_balance,0)-v_other_reserved < v_order.wallet_amount then
      raise exception 'wallet shortfall: captured payment requires manual refund or compensation';
    end if;
  end if;

  -- ---- Friend discount is usable ONCE per referral -------------------------
  -- The first discounted order to settle claims referrals.discount_order_id; any
  -- other discounted order is a second use of the same discount. Serialised per
  -- user by the wallet advisory lock above; replays of the winner see their own
  -- id and pass. A second use is still granted (the customer paid what checkout
  -- charged) but gets no referrer credit, and is flagged below.
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

  -- ---- Already owns this product? -----------------------------------------
  select id into v_owned_purchase from public.purchases
   where user_id = v_order.user_id and product_id = v_product.id
     and status = 'success' and order_id is distinct from v_order.id
   limit 1;

  insert into public.purchases (
    user_id, order_id, product_id, product_title, scope, chapter_id,
    subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id
  ) values (
    v_order.user_id, v_order.id, v_product.id, coalesce(v_product.title, 'Your content'),
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount,
    case when v_owned_purchase is null then 'success' else 'duplicate' end,
    p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now(),
      payment_completed_at = case when external_transaction_token is not null
        then coalesce(payment_completed_at, clock_timestamp()) else payment_completed_at end
  where id = v_order.id and status <> 'refunded';

  -- Remember who bought (hashed email / phone) so a deleted-and-recreated account is not
  -- treated as a first-time buyer. Never removed on refund or account deletion.
  if v_owned_purchase is null then
    perform public.record_purchase_identity(v_order.user_id);
  end if;

  -- ---- Stale order? -------------------------------------------------------
  -- v_order is the row as it was BEFORE this settlement flipped it to 'paid'.
  -- Replays see 'paid' and rely on the flag written the first time.
  v_stale := exists (select 1 from public.order_review_flags
                      where order_id = v_order.id and reason = 'stale_order_paid')
          or v_order.status in ('cancelled', 'failed')
          or (v_order.status = 'created' and v_order.expires_at is not null
              and coalesce(p_paid_at, now()) > v_order.expires_at);

  -- ---- Wallet debit: ALWAYS, on the first settlement, clamped ---------------
  if v_first and v_order.wallet_amount > 0
     and not exists (select 1 from public.wallet_ledger
                      where order_id = v_order.id and entry_type = 'debit' and source = 'order_payment') then
    perform public.release_due_wallet_credits(v_order.user_id);
    select available into v_balance from public.wallet_balance_of(v_order.user_id);
    v_debit := v_order.wallet_amount;
    if v_debit > 0 then
      insert into public.wallet_ledger (user_id, entry_type, status, amount, source, order_id, note)
      values (v_order.user_id, 'debit', 'available', v_debit, 'order_payment', v_order.id, 'Wallet used at checkout')
      on conflict (order_id) where entry_type = 'debit' and source = 'order_payment' do nothing;
      v_debited := true;
    end if;
  end if;

  -- ---- Review flags (one per order and reason; replays add nothing) ---------
  v_base := jsonb_build_object(
    'product_id', v_product.id,
    'product_title', v_product.title,
    'amount_paid', v_order.amount,
    'list_price', v_order.list_price,
    'razorpay_order_id', p_razorpay_order_id,
    'razorpay_payment_id', p_razorpay_payment_id);

  if v_first and v_order.wallet_amount > 0 and v_debit < v_order.wallet_amount then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'wallet_shortfall', v_order.wallet_amount, v_order.referral_discount,
            v_base || jsonb_build_object(
              'wallet_amount_applied', v_order.wallet_amount,
              'wallet_debited', v_debit,
              'shortfall', v_order.wallet_amount - v_debit,
              'access_granted', true,
              'recommended_action',
                format('Checkout applied Rs %s of wallet balance but only Rs %s was still available, so Rs %s of the discount was not paid for. Access was granted. Decide whether to accept it or refund payment %s in Razorpay (a full refund revokes the access).',
                       v_order.wallet_amount, v_debit, v_order.wallet_amount - v_debit, p_razorpay_payment_id)))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % wanted % wallet credit but only % was available',
      v_order.id, v_order.wallet_amount, v_debit;
  end if;

  if v_stale and (v_order.wallet_amount > 0 or v_order.referral_discount > 0) then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'stale_order_paid', v_order.wallet_amount, v_order.referral_discount,
            v_base || jsonb_build_object(
              'order_status', v_order.status, 'expires_at', v_order.expires_at, 'paid_at', p_paid_at,
              'wallet_debited', (select coalesce(sum(amount), 0) from public.wallet_ledger
                                  where order_id = v_order.id and entry_type = 'debit' and source = 'order_payment'),
              'access_granted', true,
              'recommended_action',
                'This payment arrived for a checkout that was already cancelled or had expired. Access was granted and the wallet amount was debited as normal. No action needed unless the amount looks wrong.'))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % was % / expired when payment % arrived; flagged for review',
      v_order.id, v_order.status, p_razorpay_payment_id;
  end if;

  if v_discount_dup then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'discount_reused', v_order.wallet_amount, v_order.referral_discount,
            v_base || jsonb_build_object(
              'discount_first_order_id', v_discount_owner,
              'discount_not_owed', v_order.referral_discount,
              'order_status', v_order.status,
              'access_granted', true,
              'referrer_credited', false,
              'recommended_action',
                format('Access was granted. This student already used their one friend discount on order %s, so this order was under-charged by Rs %s (paid Rs %s instead of Rs %s). To reverse it, issue a FULL refund of payment %s in the Razorpay dashboard: the refund webhook then revokes the access and gives back any wallet amount used, and the student can buy again at full price. Do nothing to keep the sale as it is.',
                       v_discount_owner, v_order.referral_discount, v_order.amount,
                       v_order.amount + v_order.referral_discount, p_razorpay_payment_id)))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % reuses the friend discount already used by order %; access granted, no referrer credit, flagged for review',
      v_order.id, v_discount_owner;
  end if;

  if v_owned_purchase is not null then
    insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
    values (v_order.id, v_order.user_id, 'duplicate_purchase', v_order.wallet_amount, v_order.referral_discount,
            v_base || jsonb_build_object(
              'existing_purchase_id', v_owned_purchase,
              'access_granted', false,
              'recommended_action',
                format('The student already owned "%s" and paid for it again (Rs %s). The new purchase is stored as ''duplicate'' and adds no access. Refund payment %s in the Razorpay dashboard.',
                       v_product.title, v_order.amount, p_razorpay_payment_id)))
    on conflict (order_id, reason) where order_id is not null do nothing;
    raise warning 'settle_razorpay_payment: order % is a duplicate purchase of product %; flagged for refund', v_order.id, v_product.id;
  end if;

  -- ---- Referrer credit ----------------------------------------------------
  -- Only the friend's FIRST successful purchase counts, and only once.
  select * into v_ref from public.referrals where referred_id = v_order.user_id for update;
  if found and not v_discount_dup and v_ref.first_order_id is null and v_ref.status in ('pending', 'qualified')
     and v_owned_purchase is null
     and not exists (select 1 from public.purchases
                      where user_id = v_order.user_id and order_id <> v_order.id and status = 'success') then
    select * into v_set from public.referral_settings where id = true;

    -- Batch 3 / F5: no credit unless BOTH sides have a verified mobile number at the
    -- moment of the purchase (a number changed after applying the code loses its
    -- verification). The referral is consumed: this was the friend's first purchase.
    if v_set.require_verified_phone
       and not (coalesce((select mobile_verified from public.profiles where id = v_order.user_id), false)
            and coalesce((select mobile_verified from public.profiles where id = v_ref.referrer_id), false)) then
      update public.referrals
         set first_order_id = v_order.id, status = 'rejected', reject_reason = 'phone_not_verified_at_purchase'
       where id = v_ref.id;
      raise warning 'settle_razorpay_payment: no referrer credit for order %: a mobile number was not verified', v_order.id;
      v_ref.status := 'rejected';
    elsif public.has_prior_purchase_identity(v_order.user_id) then
      -- Same email / phone already bought under another (maybe deleted) account.
      update public.referrals
         set first_order_id = v_order.id, status = 'rejected', reject_reason = 'returning_customer'
       where id = v_ref.id;
      raise warning 'settle_razorpay_payment: no referrer credit for order %: the buyer is a returning customer', v_order.id;
      v_ref.status := 'rejected';
    else
      update public.referrals
         set first_order_id = v_order.id, status = 'qualified', qualified_at = coalesce(qualified_at, now())
       where id = v_ref.id;
    end if;

    if v_ref.status <> 'rejected' and v_set.enabled and v_set.referrer_credit_amount > 0
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
$$;

revoke all on function public.settle_razorpay_payment(text,text,text,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_razorpay_payment(text,text,text,bigint,timestamptz) to service_role;
commit;
