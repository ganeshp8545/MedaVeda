-- Preserve the duplicate-charge result on idempotent verification replays.
-- No prices, existing purchases, or Razorpay functions are modified.
begin;

create or replace function public.settle_play_purchase(
  p_user_id uuid,p_order_id text,p_product_id text,p_play_sku text,p_purchase_token text,p_paid_at timestamptz
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype; v_product public.products%rowtype;
  v_other_order text; v_owned_purchase text;
  v_ref public.referrals%rowtype; v_set public.referral_settings%rowtype;
begin
  if p_purchase_token is null or length(p_purchase_token)<10 or length(p_purchase_token)>4096
     or p_paid_at is null then raise exception 'Invalid Play settlement inputs'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text,0));
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id or v_order.product_id is distinct from p_product_id
     or v_order.provider<>'play' or v_order.play_sku is distinct from p_play_sku
     or v_order.external_transaction_token is not null or v_order.external_choice_bound_order_id is not null then
    raise exception 'Play order ownership or product mismatch';
  end if;
  if v_order.status='paid' then
    if v_order.purchase_token=p_purchase_token then
      return jsonb_build_object('ok',true,'already_settled',true,'amount',v_order.amount,
        'duplicate',exists(select 1 from public.purchases
          where order_id=v_order.id and status='duplicate'));
    end if;
    raise exception 'Play order already paid with different token';
  end if;
  -- A pending Play purchase can complete after the local checkout timer; once
  -- Google binds its token to this order, charging the user must still unlock it.
  if v_order.status not in ('created','cancelled') then
    raise exception 'Play order unavailable';
  end if;
  select order_id into v_other_order from public.payments where purchase_token=p_purchase_token;
  if found and v_other_order<>p_order_id then raise exception 'Play token already used for another order'; end if;
  select * into v_product from public.products where id=v_order.product_id;
  if not found then raise exception 'Play product unavailable'; end if;
  if not exists(select 1 from public.play_price_tiers where play_sku=v_order.play_sku and price_inr=v_order.amount)
     or v_order.list_price is distinct from v_order.amount or v_order.wallet_amount<>0
     or v_order.referral_discount<>0 then raise exception 'Play order price mismatch'; end if;

  insert into public.payments(order_id,user_id,product_id,amount,provider,purchase_token,play_sku,status,verified_at)
  values(v_order.id,v_order.user_id,v_order.product_id,v_order.amount,'play',p_purchase_token,v_order.play_sku,'success',now());
  select id into v_owned_purchase from public.purchases
   where user_id=v_order.user_id and product_id=v_product.id and status='success' and order_id is distinct from v_order.id limit 1;
  insert into public.purchases(user_id,order_id,product_id,product_title,scope,chapter_id,subject_id,year_id,
    year_ids,course_id,amount,status)
  values(v_order.user_id,v_order.id,v_product.id,coalesce(v_product.title,'Your content'),v_product.scope,
    v_product.chapter_id,v_product.subject_id,v_product.year_id,v_product.year_ids,v_product.course_id,
    v_order.amount,case when v_owned_purchase is null then 'success' else 'duplicate' end);
  update public.orders set status='paid',purchase_token=p_purchase_token,play_consumption_status='pending',
    payment_completed_at=p_paid_at,updated_at=now() where id=v_order.id;
  if v_owned_purchase is null then perform public.record_purchase_identity(v_order.user_id); end if;

  -- Mirror the referral section of settle_razorpay_payment exactly: a duplicate
  -- paid product is not a first purchase and never earns another credit.
  select * into v_ref from public.referrals where referred_id=v_order.user_id for update;
  if found and v_ref.first_order_id is null and v_ref.status in ('pending','qualified')
     and v_owned_purchase is null
     and not exists(select 1 from public.purchases where user_id=v_order.user_id
                    and order_id<>v_order.id and status='success') then
    select * into v_set from public.referral_settings where id=true;
    if v_set.require_verified_phone
       and not (coalesce((select mobile_verified from public.profiles where id=v_order.user_id),false)
            and coalesce((select mobile_verified from public.profiles where id=v_ref.referrer_id),false)) then
      update public.referrals set first_order_id=v_order.id,status='rejected',
        reject_reason='phone_not_verified_at_purchase' where id=v_ref.id;
      v_ref.status:='rejected';
    elsif public.has_prior_purchase_identity(v_order.user_id) then
      update public.referrals set first_order_id=v_order.id,status='rejected',
        reject_reason='returning_customer' where id=v_ref.id;
      v_ref.status:='rejected';
    else
      update public.referrals set first_order_id=v_order.id,status='qualified',
        qualified_at=coalesce(qualified_at,now()) where id=v_ref.id;
    end if;
    if v_ref.status<>'rejected' and v_set.enabled and v_set.referrer_credit_amount>0
       and exists(select 1 from public.profiles where id=v_ref.referrer_id and not blocked) then
      insert into public.wallet_ledger(user_id,entry_type,status,amount,source,referral_id,order_id,
        available_at,expires_at,note)
      values(v_ref.referrer_id,'credit','pending',v_set.referrer_credit_amount::numeric(10,2),
        'referral_reward',v_ref.id,v_order.id,
        now()+make_interval(days=>v_set.credit_hold_days),
        case when v_set.credit_expiry_days is null then null
          else now()+make_interval(days=>v_set.credit_hold_days+v_set.credit_expiry_days) end,
        'Friend''s first purchase')
      on conflict (referral_id) where entry_type='credit' and source='referral_reward' do nothing;
    end if;
  end if;
  return jsonb_build_object('ok',true,'already_settled',false,'amount',v_order.amount,
    'duplicate',v_owned_purchase is not null);
end; $$;

revoke all on function public.settle_play_purchase(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.settle_play_purchase(uuid,text,text,text,text,timestamptz) to service_role;
commit;
