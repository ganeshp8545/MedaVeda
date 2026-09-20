-- ============================================================================
-- Account deletion support (Privacy Policy / delete-account page).
--
-- Payment, order and invoice records must be kept for up to 8 years, but
-- orders.user_id / payments.user_id were NOT NULL ... ON DELETE CASCADE, so
-- deleting the auth user wiped them. This migration:
--   1. makes orders.user_id and payments.user_id nullable and switches their
--      FKs to ON DELETE SET NULL (rows survive, anonymised; RLS "own rows"
--      checks compare user_id = auth.uid(), so null rows are invisible to
--      students and still visible to admins).
--   2. guards grant_razorpay_payment() for orders whose user is gone.
--   3. adds erase_user_data(uuid): one atomic, idempotent transaction that
--      removes/anonymises everything for a user. Only service_role (the
--      delete-account Edge Function) may call it.
--   4. drops the old public.delete_my_account() RPC, which was callable by
--      any signed-in user and deleted payments/orders/purchases outright.
--      (git history of mobile-app never referenced it; the app uses the
--      delete-account Edge Function.)
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.orders   alter column user_id drop not null;
alter table public.payments alter column user_id drop not null;

alter table public.orders   drop constraint if exists orders_user_id_fkey;
alter table public.orders   add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

CREATE OR REPLACE FUNCTION public.grant_razorpay_payment(p_event_id text, p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null
    or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;

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

  -- The student deleted their account (orders.user_id is now null) while this
  -- payment was in flight. Money was captured, so keep the accounting record
  -- (order marked paid + payment row, both anonymous) but grant nothing and
  -- touch no referral. Returning normally makes the webhook ack so Razorpay
  -- does not retry forever. Such payments need a manual refund in Razorpay.
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
  v_product_title := coalesce(v_product.title, 'Your content');

  select order_id into v_existing_payment_order_id
  from public.payments
  where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then
    raise exception 'Razorpay payment is already linked to another order';
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
    v_order.user_id, v_order.id, v_product.id, v_product_title,
    v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id,
    v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id
  ) on conflict (order_id) do nothing;

  update public.orders
  set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
      course_id = v_product.course_id, updated_at = now()
  where id = v_order.id;

  -- Referral qualification for qualify_on = 'first_purchase' (idempotent:
  -- only rows still 'pending' are touched).
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

create or replace function public.erase_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb := '{}'::jsonb;
  n bigint;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;

  -- Admin accounts are referenced by admins.id (no cascade); refuse.
  if exists (select 1 from public.admins where id = p_user_id) then
    return jsonb_build_object('status', 'admin_blocked');
  end if;

  delete from public.analytics_events where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('analytics_events', n);
  delete from public.quiz_scores where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('quiz_scores', n);
  delete from public.push_tokens where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('push_tokens', n);
  delete from public.payment_sessions where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payment_sessions', n);
  delete from public.purchases where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('purchases', n);
  delete from public.referrals where referrer_id = p_user_id or referred_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('referrals', n);

  -- Retained for tax/accounting: anonymise instead of delete.
  update public.payments set user_id = null where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('payments_anonymised', n);
  update public.orders set user_id = null where user_id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('orders_anonymised', n);

  delete from public.profiles where id = p_user_id;
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('profiles', n);

  return jsonb_build_object('status', 'erased', 'counts', v_counts);
end;
$$;

revoke all on function public.erase_user_data(uuid) from public, anon, authenticated;
grant execute on function public.erase_user_data(uuid) to service_role;

drop function if exists public.delete_my_account();
