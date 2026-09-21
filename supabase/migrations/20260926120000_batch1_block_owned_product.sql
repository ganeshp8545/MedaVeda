-- ============================================================================
-- Batch 1 / F6: a student cannot buy a product they already own.
--
--  * create_priced_order() / quote_my_order() answer code 'already_owned'
--    (create-order maps it to a message) before anything is reserved.
--  * a partial UNIQUE index makes it impossible to hold two successful purchases
--    of the same product. settle_razorpay_payment() (previous migration) stores a
--    second paid purchase as 'duplicate', so the index can never fail a
--    settlement.
--
-- LIVE DATA, checked before writing this: exactly one (user, product) pair
-- already has two successful purchases - an ADMIN account testing the Rs 1
-- product "new one" twice on 2026-08-01, 49 seconds apart, two real captured
-- payments (pay_TKRKPATnDf3xSS, pay_TKS4dN2Cih85eD). No row is deleted or
-- edited here. The newer of the two (66c151c8-...) is excluded from the index by
-- id, so the index can be created now and still protects every other purchase,
-- including all future ones. If you later refund or re-status that row you can
-- drop the exclusion:
--   drop index purchases_one_success_per_product;
--   create unique index purchases_one_success_per_product
--     on public.purchases (user_id, product_id) where status = 'success';
-- ============================================================================

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
$function$;

revoke all on function public.create_priced_order(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_priced_order(uuid, text, boolean) to service_role;
revoke all on function public.quote_my_order(text, boolean) from public, anon;
grant execute on function public.quote_my_order(text, boolean) to authenticated;


-- purchases.product_id is nullable on legacy rows; NULLs are distinct, so they never collide.
create unique index if not exists purchases_one_success_per_product
  on public.purchases (user_id, product_id)
  where status = 'success' and id <> '66c151c8-bd1e-42ca-b22e-73091554fbae';
