-- ============================================================================
-- Referral off => the wallet cannot be spent.
--
-- When referral_settings.enabled = false, quote_my_order() and
-- create_priced_order() price the order with NO wallet even if the client sends
-- use_wallet = true (ignored, not an error): quote reports wallet_eligible =
-- false and wallet_amount = 0, and the order is created with wallet_amount = 0.
-- Existing balances are untouched (get_my_wallet still shows them, the ledger is
-- not modified); they simply cannot be spent until the program is switched on.
-- An order that was already created while the program was on keeps the wallet
-- amount it was priced with (Razorpay was asked for that exact amount).
--
-- Re-issued from the Batch 3b definitions (20260927130000) with two changed
-- lines each; it must therefore run AFTER that migration (guarded below).
-- Idempotent.
-- ============================================================================
begin;

do $$
begin
  if to_regprocedure('public.has_prior_purchase_identity(uuid)') is null then
    raise exception 'Apply 20260927130000_batch3b_antifarming.sql first: these functions are re-issued from its definitions';
  end if;
end;
$$;

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

  -- Program off: nothing is wallet-eligible, so the balance can be neither shown nor spent.
  v_eligible := v_set.enabled and v_product.product_type = any (v_set.wallet_product_types);
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

revoke all on function public.create_priced_order(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_priced_order(uuid, text, boolean) to service_role;
revoke all on function public.quote_my_order(text, boolean) from public, anon;
grant execute on function public.quote_my_order(text, boolean) to authenticated;

commit;
