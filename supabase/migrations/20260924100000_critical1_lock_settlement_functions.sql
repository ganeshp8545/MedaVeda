-- ============================================================================
-- CRITICAL 1 — no client may grant access / mark paid / insert purchases
-- ============================================================================
-- Supabase's default privileges GRANT EXECUTE on every new public function to
-- anon and authenticated directly, so `revoke ... from public` alone never
-- removed them. This migration:
--   1. finds EVERY SECURITY DEFINER function in schema public whose body writes
--      purchases / payments / entitlements or sets an order to 'paid', and
--      revokes EXECUTE from public, anon, authenticated (grants service_role);
--   2. makes sure the payment-settlement RPC itself is server-only;
--   3. blocks the same writes at TABLE level (privileges + RLS) so that even a
--      future mistaken grant on a function cannot let a client write the rows;
--   4. makes future functions in schema public non-executable by clients unless
--      a migration grants them explicitly;
--   5. guarantees the idempotency constraints exist (one payment id -> one
--      grant, one order -> one purchase).
-- Nothing is deleted or rewritten: existing orders, purchases and payments are
-- untouched. Idempotent. Single transaction.
begin;

-- ---------------------------------------------------------------------------
-- 1. Revoke client EXECUTE on every access-granting SECURITY DEFINER function
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_revoked text[] := '{}';
begin
  for r in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and (
        p.prosrc ~* 'insert\s+into\s+(public\.)?(purchases|payments|entitlements)\y'
        or p.prosrc ~* 'update\s+(public\.)?(purchases|payments|entitlements)\y'
        or p.prosrc ~* 'update\s+(public\.)?orders\y[^;]*status\s*=\s*''paid'''
        or p.proname ~* '(grant|settle|mark_paid|unlock|entitle)'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    v_revoked := v_revoked || r.sig::text;
  end loop;
  raise notice 'CRITICAL1: locked to service_role only: %', v_revoked;
end;
$$;

-- Explicit, in case the pattern above ever changes.
revoke all on function public.grant_razorpay_payment(text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.grant_razorpay_payment(text, text, text, bigint)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Table-level defence in depth: clients can never write these tables
-- ---------------------------------------------------------------------------
-- purchases / payments: service_role (Edge Functions) and SECURITY DEFINER
-- functions only. Clients keep SELECT (own rows, via existing RLS policies).
revoke insert, update, delete, truncate on public.purchases from anon, authenticated;
revoke insert, update, delete, truncate on public.payments  from anon, authenticated;
revoke insert, update, delete, truncate on public.payment_sessions from anon, authenticated;
revoke insert, update, delete, truncate on public.razorpay_webhook_events from anon, authenticated;

-- Drop every non-SELECT policy on these tables (an old "for all" admin/user
-- policy would otherwise still be a way in through RLS).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('purchases', 'payments', 'payment_sessions', 'razorpay_webhook_events')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    raise notice 'CRITICAL1: dropped policy % on %', r.policyname, r.tablename;
  end loop;
end;
$$;

-- Re-assert the read policies (own rows; admins see all) since an "ALL" policy
-- dropped above may have been providing the read side.
alter table public.purchases enable row level security;
alter table public.payments  enable row level security;

drop policy if exists "Users can view own purchases" on public.purchases;
create policy "Users can view own purchases" on public.purchases
  for select using (auth.uid() = user_id);
drop policy if exists "Admins can view all purchases" on public.purchases;
create policy "Admins can view all purchases" on public.purchases
  for select using (public.am_i_admin());

drop policy if exists "Users can view own payments" on public.payments;
create policy "Users can view own payments" on public.payments
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Trigger backstop: a client role can never write purchases/payments
-- ---------------------------------------------------------------------------
create or replace function public.block_client_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `role` is the PostgREST-selected role; SECURITY DEFINER does not change it,
  -- service_role / postgres / migrations report something else.
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
     and coalesce(current_setting('app.trusted_order_write', true), 'false') <> 'true' then
    raise exception 'Table % is written by the payment system only', tg_table_name
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists purchases_00_block_client_writes on public.purchases;
create trigger purchases_00_block_client_writes
  before insert or update or delete on public.purchases
  for each row execute function public.block_client_writes();

drop trigger if exists payments_00_block_client_writes on public.payments;
create trigger payments_00_block_client_writes
  before insert or update or delete on public.payments
  for each row execute function public.block_client_writes();

-- ---------------------------------------------------------------------------
-- 4. Future functions are not client-callable unless explicitly granted
-- ---------------------------------------------------------------------------
-- Existing client RPCs (set_my_course_year, delete_my_account, am_i_admin, ...)
-- keep the grants they already have. From now on a new function needs an
-- explicit `grant execute ... to authenticated` in its migration.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Idempotency: one Razorpay payment can grant at most once
-- ---------------------------------------------------------------------------
create unique index if not exists payments_razorpay_payment_id_unique
  on public.payments (razorpay_payment_id);
create unique index if not exists purchases_order_id_unique
  on public.purchases (order_id);
create unique index if not exists orders_razorpay_order_id_unique
  on public.orders (razorpay_order_id);

-- ---------------------------------------------------------------------------
-- 6. Self-check
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and (p.prosrc ~* 'insert\s+into\s+(public\.)?(purchases|payments|entitlements)\y'
           or p.proname ~* '(grant|settle|mark_paid|unlock|entitle)')
  loop
    if has_function_privilege('anon', r.sig, 'execute')
       or has_function_privilege('authenticated', r.sig, 'execute') then
      raise exception 'CRITICAL1 self-check: % is still executable by a client role', r.sig;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.purchases', 'insert')
     or has_table_privilege('authenticated', 'public.payments', 'insert') then
    raise exception 'CRITICAL1 self-check: client can still INSERT purchases/payments';
  end if;
end;
$$;

commit;
