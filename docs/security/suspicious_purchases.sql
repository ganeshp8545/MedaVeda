-- Suspicious existing purchases. READ-ONLY. Run in the SQL editor (as postgres).
-- A row appears once per reason. Review each; do NOT bulk-delete (see notes).
--
-- payments is written only by grant_razorpay_payment() after Razorpay's signature
-- and capture check, so "no payments row" = "never went through verified settlement".
-- Purchases from before the payments table existed (or manual admin grants) will
-- also show up: compare against your Razorpay dashboard export before acting.
with base as (
  select pu.id as purchase_id, pu.user_id, pu.order_id, pu.product_id, pu.scope,
         pu.amount as purchase_amount, pu.created_at as purchase_created,
         pr.price as product_price, pr.title as product_title,
         o.amount as order_amount, o.status as order_status,
         o.razorpay_order_id, o.razorpay_payment_id as order_payment_id
  from public.purchases pu
  left join public.products pr on pr.id = pu.product_id
  left join public.orders   o  on o.id  = pu.order_id
  where pu.status = 'success'
)
select 'NO_ORDER'                    as reason, b.* , null::numeric as paid_amount from base b where b.order_id is null or b.order_status is null
union all
select 'NO_VERIFIED_PAYMENT', b.*, null
  from base b
  where not exists (
    select 1 from public.payments p
    where p.order_id = b.order_id
      and p.status = 'success'
      and p.razorpay_payment_id is not null
      and p.razorpay_order_id is not distinct from b.razorpay_order_id)
union all
select 'PAID_LESS_THAN_PRODUCT_PRICE', b.*, p.amount
  from base b
  join public.payments p on p.order_id = b.order_id and p.status = 'success'
  where b.product_price is not null and p.amount < b.product_price
union all
select 'PURCHASE_AMOUNT_LESS_THAN_PRODUCT_PRICE', b.*, null
  from base b
  where b.product_price is not null and coalesce(b.purchase_amount, 0) < b.product_price
union all
select 'ORDER_AMOUNT_DIFFERS_FROM_PAYMENT', b.*, p.amount
  from base b
  join public.payments p on p.order_id = b.order_id and p.status = 'success'
  where p.amount is distinct from b.order_amount
union all
select 'PRODUCT_ON_PAYMENT_DIFFERS_FROM_PURCHASE', b.*, p.amount
  from base b
  join public.payments p on p.order_id = b.order_id and p.status = 'success'
  where p.product_id is distinct from b.product_id
order by reason, purchase_created desc;

-- Payment ids reused across orders (must be empty; also enforced by a unique index)
select razorpay_payment_id, count(*) from public.payments group by 1 having count(*) > 1;

-- Orders marked paid with no payments row
select o.id, o.user_id, o.product_id, o.amount, o.updated_at
from public.orders o
where o.status = 'paid' and not exists (select 1 from public.payments p where p.order_id = o.id);
