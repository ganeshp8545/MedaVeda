-- Payment backend tables for the Supabase Edge Functions in
-- supabase/functions/{create-payment-session,pay,verify-payment}.
-- Run this once (via `supabase db push` or the SQL editor) before
-- deploying those functions.
--
-- NOTE: orders.id / products.id / chapter_id / subject_id / year_id are
-- all `text` in this project (not uuid) - only user_id / profiles.id are
-- uuid (Supabase auth.users.id). Confirmed from information_schema.

-- 1. orders: created client-side by the app with status 'created'
-- (see mobile's services/ordersService.ts). This table should already
-- exist; the columns below are the ones the payment functions read/write
-- that may not be there yet. ADD COLUMN IF NOT EXISTS is safe to re-run.
alter table if exists public.orders
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists scope text,
  add column if not exists chapter_id text,
  add column if not exists subject_id text,
  add column if not exists year_id text,
  add column if not exists year_ids text[],
  add column if not exists updated_at timestamptz default now();

-- 2. payment_sessions: short-lived, single-use tokens that stand in for
-- the user's real access token while the checkout page is open in an
-- external browser (see paymentService.ts's SECURITY FIX comment).
-- The session's own id stays uuid (self-generated via crypto.randomUUID()
-- in create-payment-session, not a reference to any existing table).
create table if not exists public.payment_sessions (
  id uuid primary key,
  order_id text not null references public.orders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Only the service role (used exclusively by the Edge Functions) should
-- ever touch this table - it's never read or written directly by the app.
alter table public.payment_sessions enable row level security;

-- 3. payments: durable, append-only audit record of verified Razorpay
-- payments, independent of the mutable `orders` row. The UNIQUE
-- constraint on razorpay_payment_id is what makes verify-payment
-- idempotent - a retried/duplicated callback for the same payment hits a
-- 23505 unique-violation and is treated as "already granted" instead of
-- writing a second purchase.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text references public.products (id) on delete set null,
  amount numeric not null,
  razorpay_order_id text not null,
  razorpay_payment_id text not null unique,
  status text not null default 'success',
  verified_at timestamptz not null default now()
);

alter table public.payments enable row level security;

-- Students may read their own payment history (e.g. a future "Order
-- History" screen), but only the service role can insert/update.
drop policy if exists "Users can view own payments" on public.payments;

create policy "Users can view own payments"
  on public.payments for select
  using (auth.uid() = user_id);
