-- ============================================================================
-- Batch 3b: two anti-farming guards that work WITHOUT phone verification
-- (F5's verified-phone rule stays built but off: require_verified_phone = false).
--
-- 1. RETURNING CUSTOMER (deleted-and-recreated account).
--    Deleting an account deletes the profile and the purchases, so a fresh signup used
--    to look like a brand-new first-time buyer and could take the friend discount again
--    (and earn its referrer a second credit). Now every successful purchase records a
--    HASH of the buyer's normalised email and phone in first_purchase_identities, a
--    server-only table that is NOT tied to the account and survives its deletion (and a
--    refund). An account whose email OR phone hash was recorded by a DIFFERENT account:
--      * gets no friend discount at checkout (create_priced_order / quote_my_order),
--      * cannot apply a referral code ('already_purchased'),
--      * earns its referrer no credit (referral rejected: 'returning_customer').
--    Email is normalised (lower-case, +tag removed, gmail dots removed); phone is E.164.
--    Existing buyers are back-filled below.
--
--    What it means for genuinely new users:
--      * a NEW email AND a NEW phone number: unaffected;
--      * a phone number recycled by the carrier (or a family phone shared by siblings)
--        that an earlier buyer used: that person loses the ~10% first-purchase discount
--        and their referrer gets no credit. They can still buy at full price. Email
--        collisions are far rarer. An admin can lift a wrongly caught identity by deleting
--        its row in first_purchase_identities.
--      * phone is not verified today, so a farmer typing a fresh number or using a fresh
--        email is NOT caught. This stops lazy re-signup with the same identity only.
--    Privacy: the table holds one-way hashes, not the numbers. A phone number is a small
--    space, so treat the hashes as personal data (retention / privacy policy).
--
-- 2. SHARED NETWORK (device/IP signal).
--    There is NO device identifier anywhere in the database (push_tokens is empty, analytics
--    params carry no device id). The only signal is auth.sessions.ip (GoTrue records the IP of
--    every login session; 43 of 43 sessions on live have one). When the referrer and the friend
--    have ever logged in from the same IP, the credit is held for an admin instead of being
--    released (see release_due_wallet_credits): flag reason 'referral_shared_network'.
--    Held, not denied, because shared Wi-Fi / carrier-grade NAT puts classmates on one IP,
--    and classmates are exactly who refer each other. It does not see VPNs, mobile data vs
--    home Wi-Fi, or two different phones. If auth.sessions is unavailable the signal is
--    simply absent (no hold).
--    NOTE: the admin panel has no screen for order_review_flags yet; until it does, held
--    credits are found with:  select * from order_review_flags where resolved_at is null;
-- ============================================================================

alter table public.order_review_flags drop constraint if exists order_review_flags_reason_check;
alter table public.order_review_flags add constraint order_review_flags_reason_check
  check (reason in ('stale_order_paid', 'discount_reused', 'referral_credit_unrecovered',
                    'wallet_shortfall', 'duplicate_purchase', 'referral_shared_network'));

-- ---- identity hashes ---------------------------------------------------------------
create table if not exists public.first_purchase_identities (
  identity_hash text primary key,
  kind text not null check (kind in ('email', 'phone')),
  account_id uuid not null,        -- the account that bought first; deliberately NOT a foreign key
  first_purchase_at timestamptz not null default now()
);
alter table public.first_purchase_identities enable row level security;
revoke all on public.first_purchase_identities from public, anon, authenticated;
grant all on public.first_purchase_identities to service_role;

create or replace function public.identity_hash(p_kind text, p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  v_at int;
  v_local text;
  v_dom text;
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  if p_kind = 'phone' then
    v := public.normalize_phone(p_value);
  elsif p_kind = 'email' then
    v := lower(btrim(p_value));
    v_at := position('@' in v);
    if v_at < 2 then return null; end if;
    v_local := split_part(substr(v, 1, v_at - 1), '+', 1);     -- name+anything@ == name@
    v_dom := substr(v, v_at + 1);
    if v_dom in ('gmail.com', 'googlemail.com') then
      v_local := replace(v_local, '.', '');                    -- a.b@gmail.com == ab@gmail.com
      v_dom := 'gmail.com';
    end if;
    if v_local = '' then return null; end if;
    v := v_local || '@' || v_dom;
  else
    raise exception 'identity_hash: unknown kind %', p_kind;
  end if;
  if v is null then return null; end if;
  return encode(sha256(convert_to('ayurpulse-identity-v1|' || p_kind || '|' || v, 'UTF8')), 'hex');
end;
$$;
revoke all on function public.identity_hash(text, text) from public, anon, authenticated;

create or replace function public.record_purchase_identity(p_uid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.first_purchase_identities (identity_hash, kind, account_id)
  select v.h, v.k, p_uid
    from public.profiles p
    cross join lateral (values ('email', public.identity_hash('email', p.email)),
                               ('phone', public.identity_hash('phone', p.phone))) v(k, h)
   where p.id = p_uid and v.h is not null
  on conflict (identity_hash) do nothing;
$$;
revoke all on function public.record_purchase_identity(uuid) from public, anon, authenticated;
grant execute on function public.record_purchase_identity(uuid) to service_role;

create or replace function public.has_prior_purchase_identity(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
      join public.first_purchase_identities i
        on i.identity_hash in (public.identity_hash('email', p.email), public.identity_hash('phone', p.phone))
     where p.id = p_uid and i.account_id <> p_uid
  );
$$;
revoke all on function public.has_prior_purchase_identity(uuid) from public, anon, authenticated;
grant execute on function public.has_prior_purchase_identity(uuid) to service_role;

-- existing buyers (deleted accounts' purchases are already gone; nothing to recover for them)
insert into public.first_purchase_identities (identity_hash, kind, account_id, first_purchase_at)
select v.h, v.k, x.user_id, x.first_at
  from (select user_id, min(created_at) as first_at from public.purchases
         where status in ('success', 'refunded', 'chargeback', 'disputed') group by user_id) x
  join public.profiles p on p.id = x.user_id
  cross join lateral (values ('email', public.identity_hash('email', p.email)),
                             ('phone', public.identity_hash('phone', p.phone))) v(k, h)
 where v.h is not null
on conflict (identity_hash) do nothing;

-- ---- shared-network signal ---------------------------------------------------------
create or replace function public.accounts_share_network(p_a uuid, p_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_a is null or p_b is null or p_a = p_b then return false; end if;
  return exists (select 1 from auth.sessions a join auth.sessions b on b.ip = a.ip
                  where a.user_id = p_a and b.user_id = p_b and a.ip is not null);
exception when undefined_table or undefined_column or insufficient_privilege then
  return false;   -- no signal available: never block on a signal we cannot read
end;
$$;
revoke all on function public.accounts_share_network(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accounts_share_network(uuid, uuid) to service_role;

-- ---- the functions that use them (re-issued from their current definitions) ---------
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
$function$;

CREATE OR REPLACE FUNCTION public.quote_my_order(p_product_id text, p_use_wallet boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if exists (select 1 from public.purchases
              where user_id = v_uid and product_id = v_product.id and status = 'success') then
    return jsonb_build_object('ok', false, 'code', 'already_owned');
  end if;
  v_price := v_product.price::numeric(10, 2);
  select * into v_set from public.referral_settings where id = true;

  if v_set.enabled and v_set.friend_discount_percent > 0
     and exists (select 1 from public.referrals r
                   join public.profiles rp on rp.id = r.referrer_id and not rp.blocked
                  where r.referred_id = v_uid and r.status in ('pending', 'qualified') and r.first_order_id is null)
     and not exists (select 1 from public.purchases pu where pu.user_id = v_uid and pu.status = 'success')
     and not public.has_prior_purchase_identity(v_uid) then
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
$function$;

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

  -- same email / phone already bought under another (maybe deleted) account: not a first purchase
  if public.has_prior_purchase_identity(v_uid) then
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

create or replace function public.release_due_wallet_credits(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  n integer;
begin
  -- Called from get_my_wallet() under the student's role: tell the
  -- block_client_writes backstop this write is ours (transaction-local).
  perform set_config('app.trusted_order_write', 'true', true);

  -- Anti-farming: a credit whose referrer and friend have logged in from the same IP address is
  -- HELD for an admin (never granted automatically, never denied automatically: classmates on the
  -- same Wi-Fi or mobile network share an IP too). One flag per friend order; once an admin resolves
  -- it (admin_resolve_order_flag) the credit releases, or they reject the referral (admin_reject_referral).
  insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
  select l.order_id, l.user_id, 'referral_shared_network', 0, 0,
         jsonb_build_object(
           'referrer_id', l.user_id, 'friend_id', o.user_id, 'credit_ledger_id', l.id, 'credit_amount', l.amount,
           'signal', 'the two accounts have logged in from the same IP address',
           'caveat', 'college / hostel Wi-Fi and mobile-carrier networks share one IP between many people, so this can be two genuine classmates',
           'recommended_action',
             'Decide whether these are two accounts of the same person. If they are NOT, resolve this flag and the credit releases on the next run. If they ARE, reject the referral (admin_reject_referral) - that cancels the credit.')
    from public.wallet_ledger l
    join public.orders o on o.id = l.order_id
   where l.entry_type = 'credit' and l.source = 'referral_reward' and l.status = 'pending'
     and l.available_at <= now() and l.user_id is not null and o.user_id is not null
     and (p_user is null or l.user_id = p_user)
     and public.accounts_share_network(l.user_id, o.user_id)
  on conflict (order_id, reason) where order_id is not null do nothing;

  with due as (
    update public.wallet_ledger l
       set status = 'available'
     where l.entry_type = 'credit'
       and l.status = 'pending'
       and l.available_at <= now()
       and (p_user is null or l.user_id = p_user)
       -- a credit earned by a payment that is being disputed stays held
       and not exists (select 1 from public.purchases pu
                        where pu.order_id = l.order_id and pu.status = 'disputed')
       -- ... nor while a shared-network review is open
       and not exists (select 1 from public.order_review_flags f
                        where f.order_id = l.order_id and f.reason = 'referral_shared_network' and f.resolved_at is null)
    returning l.id, l.referral_id
  )
  select array_agg(id), count(*) into v_ids, n from due;

  update public.referrals r
     set status = 'rewarded', rewarded_at = now()
   where r.status = 'qualified'
     and exists (
       select 1 from public.wallet_ledger l
        where l.referral_id = r.id and l.source = 'referral_reward'
          and l.entry_type = 'credit' and l.status = 'available'
     );

  perform set_config('app.trusted_order_write', 'false', true);
  return coalesce(n, 0);
end;
$$;

revoke all on function public.create_priced_order(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_priced_order(uuid, text, boolean) to service_role;
revoke all on function public.quote_my_order(text, boolean) from public, anon;
grant execute on function public.quote_my_order(text, boolean) to authenticated;
revoke all on function public.apply_referral_code(text) from public, anon;
grant execute on function public.apply_referral_code(text) to authenticated;
revoke all on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.settle_razorpay_payment(text, text, text, bigint, timestamptz) to service_role;
revoke all on function public.release_due_wallet_credits(uuid) from public, anon, authenticated;
grant execute on function public.release_due_wallet_credits(uuid) to service_role;
