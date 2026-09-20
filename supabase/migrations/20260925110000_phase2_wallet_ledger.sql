-- ============================================================================
-- PHASE 2 (2/3) — referral wallet: append-only ledger + read RPCs
-- ============================================================================
-- There is NO balance column anywhere. The balance is always computed from the
-- ledger, so it can't be edited, only appended to.
--
--   entry_type   status                    meaning
--   credit       pending                   referral reward, held until available_at
--   credit       available                 spendable (unless expires_at has passed)
--   credit       cancelled                 friend's payment refunded inside the hold
--   debit        available                 wallet used to pay for an order ("posted")
--   credit       available (order_refund)  wallet amount restored after a full refund
--   reversal     available                 claws back a credit that was already
--                                          available (admin / refund after the hold)
--
-- Writes: service_role and SECURITY DEFINER functions only. Students and admins
-- get SELECT (own rows / all rows) and nothing else, enforced four ways: table
-- privileges, RLS (no write policy), block_client_writes trigger, and the
-- append-only trigger (which also stops service_role from editing history).
-- Idempotent.
begin;

create table if not exists public.wallet_ledger (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete set null,
  entry_type        text not null check (entry_type in ('credit', 'debit', 'reversal')),
  status            text not null check (status in ('pending', 'available', 'cancelled')),
  amount            numeric(10, 2) not null check (amount > 0),
  source            text not null check (source in ('referral_reward', 'order_payment', 'order_refund', 'admin_adjustment')),
  referral_id       uuid references public.referrals(id) on delete set null,
  order_id          text references public.orders(id) on delete set null,
  reverses_id       uuid references public.wallet_ledger(id) on delete set null,
  available_at      timestamptz,
  expires_at        timestamptz,
  note              text,
  created_at        timestamptz not null default now(),
  status_changed_at timestamptz,
  constraint wallet_ledger_pending_needs_date check (status <> 'pending' or available_at is not null),
  constraint wallet_ledger_only_credits_pend check (entry_type = 'credit' or status <> 'pending')
);

-- Abuse guards, enforced by the database rather than by application code:
--   one referral credit per friend (referrals.referred_id is already unique)
create unique index if not exists wallet_ledger_one_credit_per_referral
  on public.wallet_ledger (referral_id)
  where entry_type = 'credit' and source = 'referral_reward';
--   one wallet debit per order (idempotent settlement)
create unique index if not exists wallet_ledger_one_debit_per_order
  on public.wallet_ledger (order_id)
  where entry_type = 'debit' and source = 'order_payment';
--   wallet amount is restored at most once per refunded order
create unique index if not exists wallet_ledger_one_restore_per_order
  on public.wallet_ledger (order_id)
  where entry_type = 'credit' and source = 'order_refund';
--   a credit can be reversed at most once
create unique index if not exists wallet_ledger_one_reversal_per_entry
  on public.wallet_ledger (reverses_id)
  where entry_type = 'reversal';

create index if not exists wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);
create index if not exists wallet_ledger_due_idx  on public.wallet_ledger (available_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Append-only: no deletes, no truncate, and the only allowed UPDATE is
--   * status pending -> available | cancelled (stamping status_changed_at), or
--   * user_id / referral_id / order_id -> NULL (account deletion anonymises).
-- ---------------------------------------------------------------------------
create or replace function public.wallet_ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'wallet_ledger is append-only' using errcode = '42501';
  end if;

  if new.id            is distinct from old.id
  or new.entry_type    is distinct from old.entry_type
  or new.amount        is distinct from old.amount
  or new.source        is distinct from old.source
  or new.reverses_id   is distinct from old.reverses_id and new.reverses_id is not null
  or new.available_at  is distinct from old.available_at
  or new.expires_at    is distinct from old.expires_at
  or new.note          is distinct from old.note
  or new.created_at    is distinct from old.created_at
  or (new.user_id      is distinct from old.user_id     and new.user_id     is not null)
  or (new.referral_id  is distinct from old.referral_id and new.referral_id is not null)
  or (new.order_id     is distinct from old.order_id    and new.order_id    is not null) then
    raise exception 'wallet_ledger rows are immutable except status' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'pending' and new.status in ('available', 'cancelled')) then
      raise exception 'wallet_ledger: illegal status change % -> %', old.status, new.status
        using errcode = '42501';
    end if;
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_ledger_01_append_only on public.wallet_ledger;
create trigger wallet_ledger_01_append_only
  before update or delete on public.wallet_ledger
  for each row execute function public.wallet_ledger_append_only();

create or replace function public.wallet_ledger_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'wallet_ledger is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists wallet_ledger_02_no_truncate on public.wallet_ledger;
create trigger wallet_ledger_02_no_truncate
  before truncate on public.wallet_ledger
  for each statement execute function public.wallet_ledger_no_truncate();

drop trigger if exists wallet_ledger_00_block_client_writes on public.wallet_ledger;
create trigger wallet_ledger_00_block_client_writes
  before insert or update or delete on public.wallet_ledger
  for each row execute function public.block_client_writes();

-- ---------------------------------------------------------------------------
-- RLS / privileges: SELECT only
-- ---------------------------------------------------------------------------
alter table public.wallet_ledger enable row level security;

drop policy if exists "wallet_ledger_select_own" on public.wallet_ledger;
create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "wallet_ledger_select_admin" on public.wallet_ledger;
create policy "wallet_ledger_select_admin" on public.wallet_ledger
  for select to authenticated using (public.am_i_admin());

revoke all on public.wallet_ledger from public, anon, authenticated;
grant select on public.wallet_ledger to authenticated;
grant all on public.wallet_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Moves credits whose hold has elapsed from pending -> available, and marks the
-- referral as rewarded. Idempotent. p_user = null sweeps everyone (cron).
-- ---------------------------------------------------------------------------
create or replace function public.release_due_wallet_credits(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  n integer;
begin
  -- Called from get_my_wallet() under the student's role: tell the
  -- block_client_writes backstop this write is ours (transaction-local).
  perform set_config('app.trusted_order_write', 'true', true);
  with due as (
    update public.wallet_ledger
       set status = 'available'
     where entry_type = 'credit'
       and status = 'pending'
       and available_at <= now()
       and (p_user is null or user_id = p_user)
    returning id, referral_id
  )
  select array_agg(id), count(*) into v_ids, n from due;

  update public.referrals r
     set status = 'rewarded', rewarded_at = now()
   where r.status = 'qualified'
     and exists (
       select 1 from public.wallet_ledger l
        where l.referral_id = r.id and l.source = 'referral_reward'
          and l.entry_type = 'credit' and l.status = 'available'
     );

  perform set_config('app.trusted_order_write', 'false', true);
  return coalesce(n, 0);
end;
$$;

revoke all on function public.release_due_wallet_credits(uuid) from public, anon, authenticated;
grant execute on function public.release_due_wallet_credits(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Balance. Internal: the same maths is used to PRICE an order and to DISPLAY.
-- Callers must run release_due_wallet_credits(user) first.
-- ---------------------------------------------------------------------------
create or replace function public.wallet_balance_of(p_user uuid)
returns table (available numeric, pending numeric, total_earned numeric, next_available_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select
    greatest(0,
      coalesce(sum(amount) filter (where entry_type = 'credit' and status = 'available'
                                     and (expires_at is null or expires_at > now())), 0)
      - coalesce(sum(amount) filter (where entry_type in ('debit', 'reversal') and status = 'available'), 0)
    )::numeric(10, 2) as available,
    coalesce(sum(amount) filter (where entry_type = 'credit' and status = 'pending'), 0)::numeric(10, 2) as pending,
    coalesce(sum(amount) filter (where entry_type = 'credit' and status in ('pending', 'available')
                                   and source = 'referral_reward'), 0)::numeric(10, 2) as total_earned,
    min(available_at) filter (where entry_type = 'credit' and status = 'pending') as next_available_at
  from public.wallet_ledger
  where user_id = p_user;
$$;

revoke all on function public.wallet_balance_of(uuid) from public, anon, authenticated;
grant execute on function public.wallet_balance_of(uuid) to service_role;

-- What the app calls. Own balance only; the user id comes from the JWT.
create or replace function public.get_my_wallet()
returns table (available numeric, pending numeric, total_earned numeric, next_available_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform public.release_due_wallet_credits(auth.uid());
  return query select * from public.wallet_balance_of(auth.uid());
end;
$$;

revoke all on function public.get_my_wallet() from public, anon;
grant execute on function public.get_my_wallet() to authenticated;

-- ---------------------------------------------------------------------------
-- Referral list for the referrer: masked name, status, amount. (The old
-- get_my_referrals() is left untouched for released builds.)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_referral_list()
returns table (
  id uuid,
  friend_name text,
  joined_at timestamptz,
  status text,
  amount numeric,
  available_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    r.id,
    case
      when nullif(trim(coalesce(p.name, '')), '') is null then 'A friend'
      else initcap(split_part(trim(p.name), ' ', 1))
           || case when array_length(regexp_split_to_array(trim(p.name), '\s+'), 1) > 1
                   then ' ' || upper(left((regexp_split_to_array(trim(p.name), '\s+'))
                                          [array_length(regexp_split_to_array(trim(p.name), '\s+'), 1)], 1)) || '.'
                   else '' end
    end as friend_name,
    r.created_at as joined_at,
    case
      when r.status = 'rejected' or l.status = 'cancelled' or rev.id is not null then 'cancelled'
      when l.id is null then 'joined'
      when l.status = 'available' or l.available_at <= now() then 'credited'
      else 'purchased_pending'
    end as status,
    l.amount,
    case when l.status = 'pending' then l.available_at end as available_at
  from public.referrals r
  left join public.profiles p on p.id = r.referred_id
  left join public.wallet_ledger l
         on l.referral_id = r.id and l.source = 'referral_reward' and l.entry_type = 'credit'
  left join public.wallet_ledger rev
         on rev.reverses_id = l.id and rev.entry_type = 'reversal'
  where r.referrer_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_referral_list() from public, anon;
grant execute on function public.get_my_referral_list() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: claw back a credit that was ALREADY available (e.g. the friend's
-- refund arrived after the hold). Posts a reversal; never edits history.
-- The reversal can take the balance to 0, not below (balance is clamped).
-- ---------------------------------------------------------------------------
create or replace function public.admin_reverse_wallet_credit(p_ledger_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_ledger%rowtype;
begin
  if not public.am_i_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into v_row from public.wallet_ledger where id = p_ledger_id for update;
  if not found or v_row.entry_type <> 'credit' or v_row.status <> 'available' then
    raise exception 'Only an available credit can be reversed';
  end if;
  perform set_config('app.trusted_order_write', 'true', true);
  insert into public.wallet_ledger (user_id, entry_type, status, amount, source, reverses_id, referral_id, note)
  values (v_row.user_id, 'reversal', 'available', v_row.amount, 'admin_adjustment', v_row.id, v_row.referral_id,
          left(coalesce(p_note, 'admin reversal'), 500));
  perform set_config('app.trusted_order_write', 'false', true);
end;
$$;

revoke all on function public.admin_reverse_wallet_credit(uuid, text) from public, anon;
grant execute on function public.admin_reverse_wallet_credit(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Optional sweep every 15 minutes. Correctness does NOT depend on it (balance
-- reads and order pricing release the caller's due credits first); it only keeps
-- referrals.status fresh for the admin panel. Skipped quietly if pg_cron is not
-- available on this project.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('release-wallet-credits')
    where exists (select 1 from cron.job where jobname = 'release-wallet-credits');
  perform cron.schedule('release-wallet-credits', '*/15 * * * *',
                        'select public.release_due_wallet_credits(null)');
exception when others then
  raise notice 'PHASE2: pg_cron not scheduled (%). Enable it in Dashboard > Database > Extensions, or ignore.', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('authenticated', 'public.wallet_ledger', 'insert')
     or has_table_privilege('authenticated', 'public.wallet_ledger', 'update')
     or has_table_privilege('authenticated', 'public.wallet_ledger', 'delete')
     or has_table_privilege('anon', 'public.wallet_ledger', 'select') then
    raise exception 'PHASE2 self-check: wallet_ledger privileges too wide';
  end if;
  if has_function_privilege('authenticated', 'public.release_due_wallet_credits(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.wallet_balance_of(uuid)', 'execute') then
    raise exception 'PHASE2 self-check: internal wallet function executable by client';
  end if;
end;
$$;

commit;
