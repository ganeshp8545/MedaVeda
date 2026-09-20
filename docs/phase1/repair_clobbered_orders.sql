-- ============================================================================
-- OPTIONAL DATA REPAIR — run ONLY after you confirmed in the Razorpay dashboard
-- that each payment below is CAPTURED for the right amount and product.
-- Do not run it as part of the Phase 1 migration.
--
-- These two orders have a purchase (the student HAS access) but the order row
-- says 'failed' because the app wrote 'failed' after the payment had already
-- settled (see docs/phase1/APPLY_AND_VERIFY.md, "Why the two orders are 'failed'").
-- The repair only sets status back to 'paid' where a successful payment row and
-- a successful purchase row exist. It changes nothing else and cannot grant
-- access (purchases already exist).
-- Run the SELECT first, then the UPDATE. Both are safe to re-run.
-- ============================================================================

-- 1. what would change
select o.id, o.status as current_status, p.razorpay_payment_id, p.amount as paid_amount, o.amount as order_amount
from public.orders o
join public.payments p  on p.order_id = o.id and p.status = 'success'
join public.purchases u on u.order_id = o.id and coalesce(u.status,'success') = 'success'
where o.id in ('27141711-0888-4443-bf97-797f84c7fb52','b8c7b432-bcc4-4c41-a143-20e8a34f543d')
  and o.status <> 'paid'
  and p.amount = o.amount;

-- 2. the repair (run in the SQL editor as postgres; the Phase 1 trigger lets the
--    postgres/service role change status)
update public.orders o
set status = 'paid', updated_at = now()
where o.id in ('27141711-0888-4443-bf97-797f84c7fb52','b8c7b432-bcc4-4c41-a143-20e8a34f543d')
  and o.status <> 'paid'
  and exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'success' and p.amount = o.amount)
  and exists (select 1 from public.purchases u where u.order_id = o.id and coalesce(u.status,'success') = 'success');
