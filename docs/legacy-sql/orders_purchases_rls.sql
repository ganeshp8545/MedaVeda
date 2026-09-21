-- SECURITY FIX - RLS for `orders` and `purchases`.
--
-- The existing payment_backend migration added RLS + policies for
-- payment_sessions and payments, but never did the same for `orders` or
-- `purchases` - both of which the mobile app's anon-key client talks to
-- directly (see repositories/ordersRepository.ts and
-- repositories/purchasesRepository.ts). Without explicit policies here,
-- either:
--   (a) RLS is OFF on these tables -> any authenticated user can read
--       every other user's orders/purchases (privacy leak), and -
--       worse - could hand-craft a raw REST call to INSERT a fake
--       `purchases` row for themselves and get paid content for free
--       without ever going through Razorpay/verify-payment, or
--   (b) RLS is ON with no policies -> the app's own order creation
--       (createOrderForProduct) fails closed for everyone.
-- This migration makes the intended behavior explicit and enforced
-- rather than implicit/undefined. Idempotent - safe to re-run.

alter table if exists public.orders enable row level security;
alter table if exists public.purchases enable row level security;

-- orders: a student can see and create their own orders (this is how
-- createOrderForProduct works - see services/ordersService.ts).
drop policy if exists "Users can view own orders" on public.orders;
create policy "Users can view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own orders" on public.orders;
create policy "Users can create own orders"
  on public.orders for insert
  with check (auth.uid() = user_id and status = 'created');

-- Client-side updateOrderStatus is only ever used for a "Cancel" action
-- on a still-pending order (see the comment in ordersService.ts -
-- "not for the client to fake a successful payment"). The WITH CHECK
-- here is what actually enforces that intent: a user can update their
-- own order, but the row can never end up with status = 'paid' through
-- this policy - only the service role (used exclusively by
-- verify-payment, which bypasses RLS entirely) can do that.
drop policy if exists "Users can cancel own pending orders" on public.orders;
create policy "Users can cancel own pending orders"
  on public.orders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status <> 'paid');

-- purchases: read-only for the owning user. Deliberately NO insert/
-- update/delete policy for the authenticated role at all - every
-- purchases row must come from verify-payment's service-role client
-- (which bypasses RLS), never from the app directly. This is the
-- specific protection against the "fake purchases row" scenario above.
drop policy if exists "Users can view own purchases" on public.purchases;
create policy "Users can view own purchases"
  on public.purchases for select
  using (auth.uid() = user_id);
