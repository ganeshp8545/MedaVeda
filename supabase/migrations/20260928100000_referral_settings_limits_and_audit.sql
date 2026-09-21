-- ============================================================================
-- Referral settings: hard limits + audit trail.
--
--   1. One named CHECK constraint per admin-editable number, so the server
--      rejects a bad value even if the admin form is bypassed (direct API call,
--      SQL editor) and the error names the field:
--        friend_discount_percent  0-50          friend_discount_max      blank or 1-10000
--        referrer_credit_amount   0-10000       credit_hold_days         0-90
--        wallet_max_percent       1-100         apply_window_days        1-30
--        max_referrals_per_user   blank or 1-1000
--      The Phase 2 catch-all constraint is replaced: its ranges for these
--      columns were wider, and the checks it also carried (expiry, checkout
--      minutes, product types) move to referral_settings_other_ranges.
--      If the live row violates a new limit this migration FAILS (it does not
--      rewrite the admin's values) - fix the row in the admin panel first.
--
--   2. referral_settings_audit: one row per change (who, when, old and new
--      values of the columns that changed). Written by a trigger, readable by
--      admins only, never writable or editable by clients.
-- Idempotent.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Limits
-- ---------------------------------------------------------------------------
alter table public.referral_settings drop constraint if exists referral_settings_phase2_ranges;

alter table public.referral_settings drop constraint if exists referral_settings_other_ranges;
alter table public.referral_settings
  add constraint referral_settings_other_ranges check (
        (credit_expiry_days is null or credit_expiry_days > 0)
    and checkout_expiry_minutes between 5 and 240
    and wallet_product_types <@ array['notes', 'notes_bundle', 'video', 'other']
  );

alter table public.referral_settings drop constraint if exists referral_settings_friend_discount_percent_range;
alter table public.referral_settings
  add constraint referral_settings_friend_discount_percent_range
  check (friend_discount_percent between 0 and 50);

alter table public.referral_settings drop constraint if exists referral_settings_friend_discount_max_range;
alter table public.referral_settings
  add constraint referral_settings_friend_discount_max_range
  check (friend_discount_max is null or friend_discount_max between 1 and 10000);

alter table public.referral_settings drop constraint if exists referral_settings_referrer_credit_amount_range;
alter table public.referral_settings
  add constraint referral_settings_referrer_credit_amount_range
  check (referrer_credit_amount between 0 and 10000);

alter table public.referral_settings drop constraint if exists referral_settings_credit_hold_days_range;
alter table public.referral_settings
  add constraint referral_settings_credit_hold_days_range
  check (credit_hold_days between 0 and 90);

alter table public.referral_settings drop constraint if exists referral_settings_wallet_max_percent_range;
alter table public.referral_settings
  add constraint referral_settings_wallet_max_percent_range
  check (wallet_max_percent between 1 and 100);

alter table public.referral_settings drop constraint if exists referral_settings_apply_window_days_range;
alter table public.referral_settings
  add constraint referral_settings_apply_window_days_range
  check (apply_window_days between 1 and 30);

alter table public.referral_settings drop constraint if exists referral_settings_max_referrals_per_user_range;
alter table public.referral_settings
  add constraint referral_settings_max_referrals_per_user_range
  check (max_referrals_per_user is null or max_referrals_per_user between 1 and 1000);

-- ---------------------------------------------------------------------------
-- 2. Audit table
-- ---------------------------------------------------------------------------
create table if not exists public.referral_settings_audit (
  id               bigint generated always as identity primary key,
  changed_at       timestamptz not null default now(),
  changed_by       uuid,          -- auth.uid(); null when changed outside a user session (SQL editor, service role)
  changed_by_email text,
  old_values       jsonb not null, -- only the columns that changed
  new_values       jsonb not null
);

create index if not exists referral_settings_audit_changed_at_idx
  on public.referral_settings_audit (changed_at desc);

alter table public.referral_settings_audit enable row level security;

drop policy if exists "referral_settings_audit_admin_read" on public.referral_settings_audit;
create policy "referral_settings_audit_admin_read"
  on public.referral_settings_audit for select to authenticated
  using (public.am_i_admin());

-- Read-only for clients; rows are written by the trigger below (owner) only.
revoke all on public.referral_settings_audit from public, anon, authenticated;
grant select on public.referral_settings_audit to authenticated;
grant all on public.referral_settings_audit to service_role;

create or replace function public.log_referral_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_key text;
  v_o   jsonb := to_jsonb(old) - 'updated_at';
  v_n   jsonb := to_jsonb(new) - 'updated_at';
begin
  for v_key in select jsonb_object_keys(v_n) loop
    if v_o -> v_key is distinct from v_n -> v_key then
      v_old := v_old || jsonb_build_object(v_key, v_o -> v_key);
      v_new := v_new || jsonb_build_object(v_key, v_n -> v_key);
    end if;
  end loop;

  if v_new = '{}'::jsonb then
    return new; -- nothing but updated_at changed
  end if;

  insert into public.referral_settings_audit (changed_by, changed_by_email, old_values, new_values)
  values (auth.uid(), nullif(auth.jwt() ->> 'email', ''), v_old, v_new);
  return new;
end;
$$;

revoke all on function public.log_referral_settings_change() from public, anon, authenticated;

drop trigger if exists referral_settings_audit_trg on public.referral_settings;
create trigger referral_settings_audit_trg
  after update on public.referral_settings
  for each row execute function public.log_referral_settings_change();

-- ---------------------------------------------------------------------------
-- 3. Self-check
-- ---------------------------------------------------------------------------
do $$
begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.referral_settings'::regclass
         and conname like 'referral\_settings\_%\_range') <> 7 then
    raise exception 'REFERRAL LIMITS self-check: expected 7 range constraints';
  end if;
  if has_table_privilege('authenticated', 'public.referral_settings_audit', 'INSERT')
     or has_table_privilege('authenticated', 'public.referral_settings_audit', 'UPDATE')
     or has_table_privilege('authenticated', 'public.referral_settings_audit', 'DELETE')
     or has_table_privilege('anon', 'public.referral_settings_audit', 'SELECT') then
    raise exception 'REFERRAL LIMITS self-check: audit table privileges too wide';
  end if;
end;
$$;

commit;
