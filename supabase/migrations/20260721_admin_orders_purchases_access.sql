-- REGRESSION FIX for orders_purchases_rls.sql.
--
-- That migration was correct to lock orders/purchases down to
-- `auth.uid() = user_id` for students - but it had no case for the admin
-- panel at all, which queries both tables with no filter, expecting to
-- see every user's rows (admin/services/orderService.ts's getOrders(),
-- and the equivalent for purchases). The admin panel authenticates with
-- a real Supabase user session too (see admin/config/supabase.ts - it's
-- the anon key, not the service role key, so it's fully bound by RLS
-- like any other client), and an admin's auth.uid() never equals a
-- student's order.user_id - so after that migration, every admin would
-- see an empty Orders table instead of an error, which is an easy thing
-- to miss in testing (looks like "no orders yet", not "broken").
--
-- Fix: add an additional "admins can do X" policy alongside each
-- existing student policy, using the same am_i_admin() security-definer
-- RPC the admin panel's AuthContext.tsx already relies on for its own
-- route guarding (checks the `admins` table by email server-side, so it
-- can't be spoofed by a client claiming to be an admin). Postgres ORs
-- multiple permissive policies together, so this only ever widens
-- access for admins - it doesn't change what students can see/do.
--
-- Idempotent - safe to re-run.

drop policy if exists "Admins can view all orders" on public.orders;
create policy "Admins can view all orders"
  on public.orders for select
  using (am_i_admin());

-- Covers admin/services/orderService.ts's updateOrderStatus() (e.g.
-- marking an order as refunded/cancelled from the dashboard). Unlike
-- the student-facing update policy, this is intentionally NOT
-- restricted to status <> 'paid' - an admin legitimately needs to move
-- an order in or out of 'paid' (refunds, manual corrections).
drop policy if exists "Admins can update all orders" on public.orders;
create policy "Admins can update all orders"
  on public.orders for update
  using (am_i_admin())
  with check (am_i_admin());

drop policy if exists "Admins can view all purchases" on public.purchases;
create policy "Admins can view all purchases"
  on public.purchases for select
  using (am_i_admin());
