-- India User Choice Billing. No price tiers are seeded: each live INR price must
-- be checked against a matching active Play Console item before it is enabled.
begin;

create table if not exists public.play_price_tiers (
  price_inr numeric(10,2) primary key check (price_inr > 0),
  play_sku text not null unique check (play_sku ~ '^notes_[0-9]+$'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.play_price_tiers enable row level security;
revoke all on public.play_price_tiers from public, anon, authenticated;
grant all on public.play_price_tiers to service_role;

alter table public.orders
  add column if not exists provider text not null default 'razorpay',
  add column if not exists play_sku text,
  add column if not exists purchase_token text,
  add column if not exists play_consumption_status text,
  add column if not exists external_transaction_token text,
  add column if not exists external_choice_bound_order_id text,
  add column if not exists external_transaction_id text,
  add column if not exists external_report_status text,
  add column if not exists external_reported_at timestamptz,
  add column if not exists external_report_error text,
  add column if not exists external_report_attempts integer not null default 0,
  add column if not exists external_report_attempted_at timestamptz,
  add column if not exists external_refund_status text,
  add column if not exists external_refund_at timestamptz,
  add column if not exists external_refund_error text,
  add column if not exists external_refund_attempts integer not null default 0,
  add column if not exists external_refund_attempted_at timestamptz,
  add column if not exists tax_pre_amount numeric(10,2),
  add column if not exists tax_amount numeric(10,2),
  add column if not exists gst_rate_percent numeric(6,2),
  add column if not exists tax_region_code text,
  add column if not exists tax_administrative_area text,
  add column if not exists payment_completed_at timestamptz;

-- Public, non-secret tax configuration. Zero GST is the current business
-- configuration; changing it requires a reviewed tax calculation first.
insert into public.app_config(key,value) values ('gst_rate_percent','0') on conflict(key) do nothing;
insert into public.app_config(key,value) values ('require_ucb_for_razorpay','false') on conflict(key) do nothing;
-- `seller_state` intentionally has no default; it must be configured explicitly.

create or replace function public.orders_snapshot_tax()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_rate_text text; v_rate numeric(6,2);
begin
  select value into v_rate_text from public.app_config where key='gst_rate_percent';
  if v_rate_text is null or v_rate_text !~ '^[0-9]+(\.[0-9]{1,2})?$' then
    raise exception 'GST rate configuration unavailable';
  end if;
  v_rate:=v_rate_text::numeric;
  if v_rate<0 or v_rate>100 then raise exception 'GST rate out of range'; end if;
  new.gst_rate_percent:=v_rate;
  new.tax_pre_amount:=round(new.amount/(1+v_rate/100),2);
  new.tax_amount:=new.amount-new.tax_pre_amount;
  return new;
end; $$;
revoke all on function public.orders_snapshot_tax() from public,anon,authenticated;
drop trigger if exists orders_02_tax_snapshot on public.orders;
create trigger orders_02_tax_snapshot before insert on public.orders
  for each row execute function public.orders_snapshot_tax();

alter table public.orders drop constraint if exists orders_ucb_provider_check;
alter table public.orders add constraint orders_ucb_provider_check
  check (provider in ('razorpay','play'));
alter table public.orders drop constraint if exists orders_ucb_choice_check;
alter table public.orders add constraint orders_ucb_choice_check
  check (provider <> 'play' or (play_sku is not null and razorpay_order_id is null));
alter table public.orders drop constraint if exists orders_ucb_report_check;
alter table public.orders add constraint orders_ucb_report_check
  check (external_report_status is null or external_report_status in ('pending','failed','reported'));
alter table public.orders drop constraint if exists orders_ucb_consumption_check;
alter table public.orders add constraint orders_ucb_consumption_check
  check (play_consumption_status is null or play_consumption_status in ('pending','failed','consumed'));
create unique index if not exists orders_play_purchase_token_unique on public.orders(purchase_token) where purchase_token is not null;
create unique index if not exists orders_external_token_unique on public.orders(external_transaction_token) where external_transaction_token is not null;
create unique index if not exists orders_external_id_unique on public.orders(external_transaction_id) where external_transaction_id is not null;

alter table public.payments
  add column if not exists provider text not null default 'razorpay',
  add column if not exists purchase_token text,
  add column if not exists play_sku text;
alter table public.payments alter column razorpay_order_id drop not null;
alter table public.payments alter column razorpay_payment_id drop not null;
alter table public.payments drop constraint if exists payments_ucb_provider_check;
alter table public.payments add constraint payments_ucb_provider_check check (
  (provider = 'razorpay' and razorpay_order_id is not null and razorpay_payment_id is not null and purchase_token is null)
  or (provider = 'play' and razorpay_order_id is null and razorpay_payment_id is null and purchase_token is not null and play_sku is not null)
);
create unique index if not exists payments_play_purchase_token_unique on public.payments(purchase_token) where purchase_token is not null;

-- Preserve all existing immutability guarantees and add billing identity fields.
create or replace function public.orders_immutable_columns()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.amount is distinct from old.amount then raise exception 'orders.amount is immutable' using errcode='42501'; end if;
  if old.razorpay_order_id is not null and new.razorpay_order_id is distinct from old.razorpay_order_id then raise exception 'orders.razorpay_order_id is immutable' using errcode='42501'; end if;
  if new.user_id is distinct from old.user_id and new.user_id is not null then raise exception 'orders.user_id is immutable' using errcode='42501'; end if;
  if new.product_id is distinct from old.product_id and new.product_id is not null then raise exception 'orders.product_id is immutable' using errcode='42501'; end if;
  if new.list_price is distinct from old.list_price or new.referral_discount is distinct from old.referral_discount or new.wallet_amount is distinct from old.wallet_amount then raise exception 'orders price breakdown is immutable' using errcode='42501'; end if;
  if new.referral_id is distinct from old.referral_id and new.referral_id is not null then raise exception 'orders.referral_id is immutable' using errcode='42501'; end if;
  if new.expires_at is distinct from old.expires_at then raise exception 'orders.expires_at is immutable' using errcode='42501'; end if;
  if new.provider is distinct from old.provider or (old.play_sku is not null and new.play_sku is distinct from old.play_sku) then raise exception 'orders provider/SKU is immutable' using errcode='42501'; end if;
  if old.purchase_token is not null and new.purchase_token is distinct from old.purchase_token then raise exception 'orders.purchase_token is immutable' using errcode='42501'; end if;
  if old.external_transaction_id is not null and new.external_transaction_id is distinct from old.external_transaction_id then raise exception 'orders.external_transaction_id is immutable' using errcode='42501'; end if;
  if new.gst_rate_percent is distinct from old.gst_rate_percent or new.tax_pre_amount is distinct from old.tax_pre_amount
     or new.tax_amount is distinct from old.tax_amount then raise exception 'orders tax snapshot is immutable' using errcode='42501'; end if;
  if (old.tax_region_code is not null and new.tax_region_code is distinct from old.tax_region_code)
     or (old.tax_administrative_area is not null and new.tax_administrative_area is distinct from old.tax_administrative_area)
     then raise exception 'orders buyer tax address is immutable' using errcode='42501'; end if;
  if old.external_choice_bound_order_id is not null and new.external_choice_bound_order_id is distinct from old.external_choice_bound_order_id then raise exception 'orders.external_choice_bound_order_id is immutable' using errcode='42501'; end if;
  -- Token may move exactly once from a cancelled choice order to its Razorpay order.
  if old.external_transaction_token is not null and new.external_transaction_token is distinct from old.external_transaction_token
     and not (old.provider = 'play' and new.external_transaction_token is null and old.status = 'cancelled') then
    raise exception 'orders.external_transaction_token is immutable' using errcode='42501';
  end if;
  return new;
end; $$;

create or replace function public.create_play_order(p_user_id uuid, p_product_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_product public.products%rowtype; v_profile public.profiles%rowtype;
  v_sku text; v_order_id text := gen_random_uuid()::text; v_minutes integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));
  select * into v_profile from public.profiles where id=p_user_id;
  if not found or v_profile.blocked then return jsonb_build_object('ok',false,'code','account_unavailable'); end if;
  select * into v_product from public.products where id=p_product_id and active;
  if not found or v_product.course_id is distinct from v_profile.course_id then return jsonb_build_object('ok',false,'code','product_unavailable'); end if;
  if exists(select 1 from public.purchases where user_id=p_user_id and product_id=p_product_id and status='success') then return jsonb_build_object('ok',false,'code','already_owned'); end if;
  select play_sku into v_sku from public.play_price_tiers where price_inr=v_product.price and active;
  if v_sku is null then return jsonb_build_object('ok',false,'code','price_tier_missing'); end if;
  select checkout_expiry_minutes into v_minutes from public.referral_settings where id=true;
  update public.orders set status='cancelled',updated_at=now() where user_id=p_user_id and status='created' and provider='play' and purchase_token is null;
  insert into public.orders(id,user_id,product_id,scope,chapter_id,subject_id,year_id,year_ids,course_id,
    amount,list_price,provider,play_sku,status,expires_at)
  values(v_order_id,p_user_id,p_product_id,v_product.scope,v_product.chapter_id,v_product.subject_id,v_product.year_id,
    v_product.year_ids,v_product.course_id,v_product.price,v_product.price,'play',v_sku,'created',now()+make_interval(mins=>coalesce(v_minutes,30)));
  return jsonb_build_object('ok',true,'order_id',v_order_id,'play_sku',v_sku);
end; $$;
revoke all on function public.create_play_order(uuid,text) from public,anon,authenticated;
grant execute on function public.create_play_order(uuid,text) to service_role;

create or replace function public.attach_ucb_external_token(p_user_id uuid,p_order_id text,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype;
begin
  if p_token is null or length(p_token) < 10 or length(p_token)>4096 then return jsonb_build_object('ok',false,'code','invalid_token'); end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.user_id is distinct from p_user_id or v_order.provider<>'play' or v_order.status<>'created'
     or v_order.purchase_token is not null or (v_order.expires_at is not null and v_order.expires_at<now()) then
    return jsonb_build_object('ok',false,'code','order_unavailable');
  end if;
  if v_order.external_transaction_token is not null and v_order.external_transaction_token<>p_token then
    return jsonb_build_object('ok',false,'code','token_already_attached');
  end if;
  update public.orders set external_transaction_token=p_token where id=p_order_id and external_transaction_token is null;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.attach_ucb_external_token(uuid,text,text) from public,anon,authenticated;
grant execute on function public.attach_ucb_external_token(uuid,text,text) to service_role;

create or replace function public.bind_ucb_razorpay_order(p_user_id uuid,p_choice_id text,p_razorpay_id text,p_buyer_state text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_choice public.orders%rowtype; v_paid public.orders%rowtype;
begin
  if p_buyer_state is null or not (p_buyer_state = any(array[
    'ANDAMAN AND NICOBAR ISLANDS','ANDHRA PRADESH','ARUNACHAL PRADESH','ASSAM','BIHAR','CHANDIGARH',
    'CHHATTISGARH','DADRA AND NAGAR HAVELI','DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
    'DAMAN AND DIU','DELHI','GOA','GUJARAT','HARYANA','HIMACHAL PRADESH','JAMMU AND KASHMIR',
    'JHARKHAND','KARNATAKA','KERALA','LADAKH','LAKSHADWEEP','MADHYA PRADESH','MAHARASHTRA',
    'MANIPUR','MEGHALAYA','MIZORAM','NAGALAND','ODISHA','PUDUCHERRY','PUNJAB','RAJASTHAN',
    'SIKKIM','TAMIL NADU','TELANGANA','TRIPURA','UTTAR PRADESH','UTTARAKHAND','WEST BENGAL'])) then
    return jsonb_build_object('ok',false,'code','buyer_state_invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));
  select * into v_choice from public.orders where id=p_choice_id for update;
  select * into v_paid from public.orders where razorpay_order_id=p_razorpay_id for update;
  if v_choice.id is null or v_paid.id is null or v_choice.user_id is distinct from p_user_id
     or v_paid.user_id is distinct from p_user_id or v_choice.product_id is distinct from v_paid.product_id
     or v_choice.provider<>'play' or v_paid.provider<>'razorpay' or v_choice.status<>'cancelled'
     or v_paid.status<>'created' or v_choice.external_transaction_token is null
     or v_choice.purchase_token is not null or v_choice.play_sku is null
     or v_paid.external_transaction_token is not null then
    return jsonb_build_object('ok',false,'code','ucb_binding_failed');
  end if;
  if v_paid.tax_pre_amount is null or v_paid.tax_amount is null or v_paid.gst_rate_percent is null
     or v_paid.tax_pre_amount+v_paid.tax_amount<>v_paid.amount then
    return jsonb_build_object('ok',false,'code','tax_snapshot_missing');
  end if;
  update public.orders set external_transaction_token=null,external_choice_bound_order_id=v_paid.id where id=v_choice.id;
  update public.orders set external_transaction_token=v_choice.external_transaction_token,
    external_transaction_id='medveda_' || replace(v_paid.id,'-',''),
    external_report_status='pending',play_sku=v_choice.play_sku,
    tax_region_code='IN',tax_administrative_area=p_buyer_state where id=v_paid.id;
  return jsonb_build_object('ok',true,'order_id',v_paid.id);
end; $$;
revoke all on function public.bind_ucb_razorpay_order(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bind_ucb_razorpay_order(uuid,text,text,text) to service_role;

-- The same first-purchase, anti-farming and hold rules as the current Razorpay
-- settlement (20260927130000). The existing Razorpay function is left intact.
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
      return jsonb_build_object('ok',true,'already_settled',true,'amount',v_order.amount);
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

create or replace function public.mark_ucb_report_attempt(p_order_id text,p_refund boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_refund then
    update public.orders set external_refund_attempts=external_refund_attempts+1,
      external_refund_attempted_at=now() where id=p_order_id and external_transaction_token is not null;
  else
    update public.orders set external_report_attempts=external_report_attempts+1,
      external_report_attempted_at=now() where id=p_order_id and external_transaction_token is not null;
  end if;
end; $$;
revoke all on function public.mark_ucb_report_attempt(text,boolean) from public,anon,authenticated;
grant execute on function public.mark_ucb_report_attempt(text,boolean) to service_role;

commit;
