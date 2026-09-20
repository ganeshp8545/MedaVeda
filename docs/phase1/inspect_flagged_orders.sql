-- READ-ONLY. Paste in the Supabase SQL editor. One row per flagged order.
-- Use razorpay_order_id / razorpay_payment_id to look the payment up in the
-- Razorpay dashboard (Transactions -> search by "pay_..." or "order_...").
-- What to confirm there: status = Captured, amount = expected_paise below,
-- and (Orders -> the order -> Notes) productId = product_id below.
select
  o.id                                   as order_id,
  o.user_id,
  o.status                               as order_status_now,
  o.created_at                           as order_created,
  o.updated_at                           as order_last_updated,
  o.product_id                           as order_product_id,
  pr.title                               as product_title,
  pr.price                               as product_price_now,
  o.amount                               as order_amount_rupees,
  round(o.amount * 100)::bigint          as expected_paise,
  o.razorpay_order_id,
  o.razorpay_payment_id                  as order_razorpay_payment_id,
  -- what the payments table recorded (written by the server at settlement)
  (select jsonb_agg(jsonb_build_object(
            'payment_id', p.razorpay_payment_id, 'rzp_order', p.razorpay_order_id,
            'amount', p.amount, 'status', p.status, 'verified_at', p.verified_at,
            'product_id', p.product_id) order by p.verified_at)
     from public.payments p where p.order_id = o.id)          as payments,
  -- checkout sessions: which product the server created the checkout for
  (select jsonb_agg(jsonb_build_object(
            'session_id', s.id, 'product_id', s.product_id, 'created_at', s.created_at,
            'expires_at', s.expires_at, 'used', s.used) order by s.created_at)
     from public.payment_sessions s where s.order_id = o.id)   as payment_sessions,
  -- what the purchase row granted
  (select jsonb_agg(jsonb_build_object(
            'purchase_id', pu.id, 'product_id', pu.product_id, 'scope', pu.scope,
            'amount', pu.amount, 'status', pu.status, 'created_at', pu.created_at)
            order by pu.created_at)
     from public.purchases pu where pu.order_id = o.id)        as purchases,
  -- seconds between settlement (payment verified) and the order's last update:
  -- a positive number here means the order row was touched AFTER the payment
  -- (i.e. the client wrote 'failed' over a paid order)
  (select round(extract(epoch from (o.updated_at - max(p.verified_at))))
     from public.payments p where p.order_id = o.id)           as secs_order_updated_after_payment
from public.orders o
left join public.products pr on pr.id = o.product_id
where o.id in (
  '27141711-0888-4443-bf97-797f84c7fb52',
  'b8c7b432-bcc4-4c41-a143-20e8a34f543d'
);
