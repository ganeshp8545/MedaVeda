-- ============================================================================
-- PHASE 1A — TARGETED ROLLBACKS (SQL editor, as postgres).
--
--   !!  DO NOT RUN THIS WHOLE FILE.  !!
--   Highlight ONE block (R1, R2 or R3) and click Run: the editor then runs only the
--   selection. Running everything applies R1 AND R2 together.
--
-- Each block is independent and small. Use the SMALLEST one that fixes the symptom.
-- A full restore from the Phase 0 backup is the last resort (see APPLY_AND_VERIFY.md).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- R1. SYMPTOM: students cannot start a purchase (order insert/update rejected),
--     errors like "This product is not available", "Orders cannot be edited".
--     Disables ONLY the orders guard trigger. The strict policies stay in place
--     (students still cannot insert a paid order); students can again edit an
--     unpaid order, which reopens the order-swap hole until you re-enable it.
-- ---------------------------------------------------------------------------
alter table public.orders disable trigger orders_00_guard_client_writes;
-- ...and to turn it back on once fixed:
-- alter table public.orders enable trigger orders_00_guard_client_writes;

-- ---------------------------------------------------------------------------
-- R2. SYMPTOM: a real payment is captured in Razorpay but the student is not unlocked and the
--     Edge Function log says "has no completed checkout session" or
--     "product does not match its checkout session".
--     Replaces grant_razorpay_payment() with the same function WITHOUT that one
--     defence-in-depth check. Still executable by service_role only.
--     Afterwards re-run the payment through `verify-payment` (the app's
--     "recover" path does it) or Razorpay's webhook retry, then tell the developer.
-- ---------------------------------------------------------------------------
create or replace function public.grant_razorpay_payment(
  p_event_id text, p_razorpay_order_id text, p_razorpay_payment_id text, p_amount_paise bigint)
returns void language plpgsql security definer set search_path = public
as $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_title text;
  v_existing_payment_order_id text;
begin
  if p_event_id is null or p_razorpay_order_id is null or p_razorpay_payment_id is null or p_amount_paise <= 0 then
    raise exception 'invalid Razorpay settlement parameters';
  end if;
  select * into v_order from public.orders where razorpay_order_id = p_razorpay_order_id for update;
  if not found then raise exception 'Razorpay order % is not linked to an internal order', p_razorpay_order_id; end if;
  if round(v_order.amount * 100)::bigint <> p_amount_paise then raise exception 'Razorpay amount does not match order amount'; end if;

  if v_order.user_id is null then
    insert into public.payments (order_id, user_id, product_id, amount, razorpay_order_id, razorpay_payment_id, status, verified_at)
    values (v_order.id, null, v_order.product_id, v_order.amount, p_razorpay_order_id, p_razorpay_payment_id, 'success', now())
    on conflict (razorpay_payment_id) do nothing;
    update public.orders set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, updated_at = now() where id = v_order.id;
    insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
    values (p_event_id, p_razorpay_payment_id, 'payment.captured') on conflict (event_id) do nothing;
    raise warning 'grant_razorpay_payment: payment % for order % arrived after the account was deleted; refund manually', p_razorpay_payment_id, v_order.id;
    return;
  end if;

  select * into v_product from public.products where id = v_order.product_id;
  if not found then raise exception 'Order % references unknown product %', v_order.id, v_order.product_id; end if;
  v_product_title := coalesce(v_product.title, 'Your content');

  select order_id into v_existing_payment_order_id from public.payments where razorpay_payment_id = p_razorpay_payment_id;
  if found and v_existing_payment_order_id <> v_order.id then raise exception 'Razorpay payment is already linked to another order'; end if;

  insert into public.payments (order_id, user_id, product_id, amount, razorpay_order_id, razorpay_payment_id, status, verified_at)
  values (v_order.id, v_order.user_id, v_order.product_id, v_order.amount, p_razorpay_order_id, p_razorpay_payment_id, 'success', now())
  on conflict (razorpay_payment_id) do nothing;

  insert into public.purchases (user_id, order_id, product_id, product_title, scope, chapter_id, subject_id, year_id, year_ids, course_id, amount, status, razorpay_order_id)
  values (v_order.user_id, v_order.id, v_product.id, v_product_title, v_product.scope, v_product.chapter_id, v_product.subject_id, v_product.year_id, v_product.year_ids, v_product.course_id, v_order.amount, 'success', p_razorpay_order_id)
  on conflict (order_id) do nothing;

  update public.orders set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, course_id = v_product.course_id, updated_at = now() where id = v_order.id;

  update public.referrals set status = 'qualified', qualified_at = now()
  where referred_id = v_order.user_id and status = 'pending'
    and exists (select 1 from public.referral_settings where id = true and qualify_on = 'first_purchase');

  insert into public.razorpay_webhook_events(event_id, razorpay_payment_id, event_type)
  values (p_event_id, p_razorpay_payment_id, 'payment.captured') on conflict (event_id) do nothing;
end;
$function$;
-- privileges are kept by CREATE OR REPLACE; re-assert them anyway:
revoke all on function public.grant_razorpay_payment(text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.grant_razorpay_payment(text,text,text,bigint) to service_role;

-- ---------------------------------------------------------------------------
-- R3. SYMPTOM: the API says a table/column/function "does not exist in the schema cache"
--     right after a migration. Refresh PostgREST's cache.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- R4. NEVER do this to "fix" something: re-granting grant_razorpay_payment to
--     anon/authenticated or making the notes bucket public again reopens the
--     critical holes. If you think you need to, stop and ask.
-- ---------------------------------------------------------------------------
