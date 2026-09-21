-- ============================================================================
-- Batch 3 (deploy BEFORE referral is switched on): F5, F11, F12.
--
-- F5  a verified mobile number is required on BOTH sides
--       * to apply a code (friend AND referrer; an unverified referrer's code just
--         answers "invalid" so nobody can probe whose number is verified),
--       * and again at the moment the credit would be created (settlement).
--     referral_settings.require_verified_phone is the switch. It DEFAULTS TO FALSE
--     (decision 2026-09-21): on live 0 of 22 profiles have mobile_verified = true and
--     nothing in the repo sets it after the one-time backfill of 20260801, so with the
--     switch on nobody could apply a code. The rule is built and tested; turn it on
--     (update referral_settings set require_verified_phone = true) once a server-side
--     phone-verification flow sets profiles.mobile_verified. The anti-farming guards
--     that work WITHOUT verification are in the next migration (20260927130000).
--
-- F11 the referrals table is no longer readable by students (it exposed the other
--     party's user id, order ids and the internal reject_reason). The app uses the
--     RPCs; the admin panel reads it as an admin. get_my_referrals() (kept for
--     released builds) no longer returns the friend's user id and is not callable
--     by anon.
--
-- F12 * the per-referrer cap is enforced under a lock (two friends applying at the
--       same instant can no longer both pass), and counts only referrals that were
--       not rejected;
--     * apply_referral_code is rate-limited (10 calls per user per hour);
--     * referral codes come from the database's cryptographic generator instead
--       of random(), and are looked up by exact match (index) instead of
--       upper(referral_code), with a CHECK that stored codes are upper-case.
-- ============================================================================

create or replace function pg_temp.try_validate(p_table regclass, p_constraint text) returns void
language plpgsql as $$
begin
  execute format('alter table %s validate constraint %I', p_table, p_constraint);
exception when others then
  raise notice 'BATCH3: % on % left NOT VALID (existing rows break it): %', p_constraint, p_table, sqlerrm;
end $$;

-- ---- F5 setting ---------------------------------------------------------------
alter table public.referral_settings
  add column if not exists require_verified_phone boolean not null default false;

-- ---- F5 + F12: apply_referral_code ----------------------------------------------
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
  v_code text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'message', 'Not authenticated.');
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('status', 'invalid_code', 'message', 'Please enter a referral code.');
  end if;
  v_code := upper(trim(p_code));

  -- 10 attempts per user per hour: enough for typos, useless for guessing codes.
  if not public.rate_limit_hit('apply-referral:' || v_uid::text, 10, 3600) then
    return jsonb_build_object('status', 'rate_limited', 'message', 'Too many attempts. Please try again later.');
  end if;

  select * into v_settings from public.referral_settings where id = true;
  if v_settings is null or not v_settings.enabled then
    return jsonb_build_object('status', 'disabled', 'message', 'Referrals are not available right now.');
  end if;

  select * into v_caller from public.profiles where id = v_uid;
  if v_caller is null then
    return jsonb_build_object('status', 'error', 'message', 'Profile not found.');
  end if;
  if v_settings.require_verified_phone and not v_caller.mobile_verified then
    return jsonb_build_object('status', 'phone_not_verified', 'message', 'Verify your mobile number to use a referral code.');
  end if;

  select * into v_referrer from public.profiles where referral_code = v_code;
  if v_referrer is null then
    return jsonb_build_object('status', 'invalid_code', 'message', 'That referral code was not found.');
  end if;
  if v_referrer.id = v_uid then
    return jsonb_build_object('status', 'self_referral', 'message', 'You cannot refer yourself.');
  end if;
  if v_referrer.blocked then
    return jsonb_build_object('status', 'referrer_blocked', 'message', 'That referral code is no longer active.');
  end if;
  -- An unverified referrer's code behaves exactly like an unknown one.
  if v_settings.require_verified_phone and not v_referrer.mobile_verified then
    return jsonb_build_object('status', 'invalid_code', 'message', 'That referral code was not found.');
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
    -- One applier at a time per referrer, so the count below cannot go stale.
    perform pg_advisory_xact_lock(hashtextextended('referrer:' || v_referrer.id::text, 0));
    select count(*) into v_referral_count from public.referrals
     where referrer_id = v_referrer.id and status <> 'rejected';
    if v_referral_count >= v_settings.max_referrals_per_user then
      return jsonb_build_object('status', 'referrer_limit_reached', 'message', 'That referral code has reached its usage limit.');
    end if;
  end if;

  insert into public.referrals (referrer_id, referred_id, code_used, status)
  values (v_referrer.id, v_uid, v_code, 'pending');

  return jsonb_build_object('status', 'success', 'message', 'Referral applied successfully.');
exception
  when unique_violation then
    return jsonb_build_object('status', 'already_referred', 'message', 'A referral code has already been applied to your account.');
end;
$$;

revoke all on function public.apply_referral_code(text) from public, anon;
grant execute on function public.apply_referral_code(text) to authenticated;

-- ---- F12: cryptographic code generator ------------------------------------------
create or replace function public.generate_unique_referral_code(p_length integer default 7)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Uppercase, unambiguous charset: excludes 0/O, 1/I/L. 31 symbols.
  v_charset constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_attempt int := 0;
  v_byte int;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    while length(v_code) < p_length loop
      -- gen_random_uuid() is the database's cryptographic generator; byte 0 of a v4 uuid
      -- is fully random. 248 = 31 * 8, so rejecting >= 248 leaves no modulo bias.
      v_byte := get_byte(uuid_send(gen_random_uuid()), 0);
      if v_byte < 248 then
        v_code := v_code || substr(v_charset, 1 + (v_byte % 31), 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
    if v_attempt > 30 then
      raise exception 'Could not generate a unique referral code after % attempts', v_attempt;
    end if;
  end loop;
  return v_code;
end;
$$;
revoke all on function public.generate_unique_referral_code(integer) from public, anon, authenticated;

-- stored codes are upper-case (the generator only makes upper-case), so the lookup is an exact index match
alter table public.profiles drop constraint if exists profiles_referral_code_upper;
alter table public.profiles add constraint profiles_referral_code_upper
  check (referral_code = upper(referral_code)) not valid;
select pg_temp.try_validate('public.profiles', 'profiles_referral_code_upper');

-- ---- F11: the referrals table is not a student-facing API ------------------------
drop policy if exists referrals_read_own on public.referrals;
-- (referrals_admin_write, FOR ALL am_i_admin(), still gives admins read and write)

-- Kept for released builds. No friend user id, not callable by anon.
create or replace function public.get_my_referrals()
returns table (
  id uuid, referrer_id uuid, referred_id uuid, referred_name text, code_used text,
  status text, created_at timestamptz, qualified_at timestamptz, rewarded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.referrer_id,                       -- the caller's own id
    r.id as referred_id,                 -- opaque: the friend's user id is no longer exposed
    nullif(split_part(trim(coalesce(p.name, '')), ' ', 1), '') as referred_name,
    r.code_used,
    r.status,
    r.created_at,
    r.qualified_at,
    r.rewarded_at
  from public.referrals r
  left join public.profiles p on p.id = r.referred_id
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;
revoke all on function public.get_my_referrals() from public, anon;
grant execute on function public.get_my_referrals() to authenticated;

-- ---- F5: settlement (referrer credit needs verified numbers) ----------------------
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
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id and status <> 'refunded';

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
    v_debit := least(v_order.wallet_amount, coalesce(v_balance, 0));
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

revoke all on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz)
  to service_role;
