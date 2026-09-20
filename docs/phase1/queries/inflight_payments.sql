-- READ-ONLY. Run this 5 minutes BEFORE applying, and again right before you press
-- go. Expect 0 rows. Any row is a payment that may be in progress right now
-- (a Razorpay order exists but is not settled). Wait for it to finish, or apply later.
select o.id, o.user_id, o.product_id, o.status, o.razorpay_order_id, o.created_at, o.updated_at
from public.orders o
where o.status = 'created'
  and o.razorpay_order_id is not null
  and o.updated_at > now() - interval '30 minutes'
order by o.updated_at desc;
