-- ============================================================================
-- MedVeda — PHASE 0: READ-ONLY abuse detection.
-- Paste into Supabase Dashboard -> SQL Editor and Run. It only SELECTs.
-- (The editor shows the result of the LAST statement only, so this is ONE
--  statement: a UNION of all checks. Each row = one suspicious finding.)
--
-- Columns: check_id, severity, order_id, user_id, product_id, detail
-- Zero rows = nothing found by these heuristics (see limits in BACKUP_GUIDE.md).
-- Written against the live schema dump of 2026-09-20 (docs/live-schema).
-- ============================================================================
with
paid as (select * from public.orders where status = 'paid'),
pay_ok as (
  select order_id, count(*) n, max(razorpay_payment_id) any_pay_id,
         max(razorpay_order_id) any_rzp_order, sum(amount) amt
  from public.payments where status = 'success' group by order_id
),
sess as (
  select order_id, array_agg(distinct product_id) products, count(*) n
  from public.payment_sessions group by order_id
)

-- A1  Order is 'paid' but has NO payments row (paid without settlement record)
select 'A1_paid_no_payment_row' check_id, 'HIGH' severity,
       o.id order_id, o.user_id, o.product_id,
       'amount=' || o.amount || ' rzp_order=' || coalesce(o.razorpay_order_id,'NULL') detail
from paid o left join pay_ok p on p.order_id = o.id
where p.order_id is null

union all
-- A2  Paid order with no Razorpay order id or payment id on the order itself
select 'A2_paid_missing_razorpay_ids', 'HIGH', o.id, o.user_id, o.product_id,
       'rzp_order=' || coalesce(o.razorpay_order_id,'NULL') ||
       ' rzp_payment=' || coalesce(o.razorpay_payment_id,'NULL')
from paid o
where o.razorpay_order_id is null or o.razorpay_payment_id is null

union all
-- A3  Ids do not look like real Razorpay ids (real: order_ / pay_ + 14 alnum).
--     A direct RPC call to grant_razorpay_payment() can pass ANY string.
select 'A3_razorpay_id_bad_format', 'HIGH', p.order_id, p.user_id, p.product_id,
       'payment_id=' || p.razorpay_payment_id || ' rzp_order=' || coalesce(p.razorpay_order_id,'NULL')
from public.payments p
where p.razorpay_payment_id !~ '^pay_[A-Za-z0-9]{14}$'
   or p.razorpay_order_id   !~ '^order_[A-Za-z0-9]{14}$'

union all
-- A4  Amount actually recorded vs product price
--     (price may legitimately have changed since; review the amounts by hand)
select 'A4_order_amount_ne_product_price', 'MEDIUM', o.id, o.user_id, o.product_id,
       'order.amount=' || o.amount || ' product.price=' || pr.price
from paid o join public.products pr on pr.id = o.product_id
where o.amount is distinct from pr.price

union all
select 'A4b_payment_amount_ne_order_amount', 'HIGH', o.id, o.user_id, o.product_id,
       'order.amount=' || o.amount || ' payments.amount=' || p.amt
from paid o join pay_ok p on p.order_id = o.id
where o.amount is distinct from p.amt

union all
-- A5  Product changed after checkout started: order.product_id differs from
--     every product the payment session was created for. (Sessions are kept
--     30 days at most once the retention migration runs; older = not checkable.)
select 'A5_order_product_differs_from_session', 'HIGH', o.id, o.user_id, o.product_id,
       'session products=' || s.products::text
from public.orders o join sess s on s.order_id = o.id
where o.status <> 'created' and not (o.product_id = any (s.products))

union all
-- A6  Purchase row product differs from what the session was created for
select 'A6_purchase_product_differs_from_session', 'HIGH', pu.order_id, pu.user_id, pu.product_id,
       'session products=' || s.products::text
from public.purchases pu join sess s on s.order_id = pu.order_id
where pu.product_id is not null and not (pu.product_id = any (s.products))

union all
-- A7  Purchase (success) with no successful payment for its order
select 'A7_purchase_without_payment', 'HIGH', pu.order_id, pu.user_id, pu.product_id,
       'purchase.amount=' || coalesce(pu.amount::text,'NULL') || ' created=' || pu.created_at
from public.purchases pu left join pay_ok p on p.order_id = pu.order_id
where coalesce(pu.status,'success') = 'success' and p.order_id is null

union all
-- A8  Purchase whose order is not 'paid'
select 'A8_purchase_order_not_paid', 'MEDIUM', pu.order_id, pu.user_id, pu.product_id,
       'order.status=' || coalesce(o.status,'ORDER MISSING')
from public.purchases pu left join public.orders o on o.id = pu.order_id
where coalesce(pu.status,'success') = 'success' and coalesce(o.status,'') <> 'paid'

union all
-- A9  Paid order that never went through checkout (no payment session at all):
--     the signature of a forged order + direct grant, or a client-inserted
--     status='paid' order (live policy orders_insert_own allows this).
select 'A9_paid_never_had_checkout_session', 'HIGH', o.id, o.user_id, o.product_id,
       'amount=' || o.amount || ' created=' || o.created_at
from paid o left join sess s on s.order_id = o.id
where s.order_id is null

union all
-- A10 Same Razorpay order id shared, or one user with many 'paid' orders
--     for very different products in one minute (bulk grants)
select 'A10_burst_of_paid_orders', 'MEDIUM', null, o.user_id, null,
       count(*) || ' paid orders within one minute at ' || date_trunc('minute', o.updated_at)
from paid o
group by o.user_id, date_trunc('minute', o.updated_at)
having count(*) >= 3

union all
-- A11 Paid orders with status set but a very low amount for a product
--     priced 5x higher (attacker-chosen amount)
select 'A11_paid_far_below_price', 'HIGH', o.id, o.user_id, o.product_id,
       'order.amount=' || o.amount || ' product.price=' || pr.price
from paid o join public.products pr on pr.id = o.product_id
where pr.price > 0 and o.amount < pr.price * 0.2

order by 2, 1;
