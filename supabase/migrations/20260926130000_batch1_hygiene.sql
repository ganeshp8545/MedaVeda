-- ============================================================================
-- Batch 1 / hygiene: F9, F10, F14, F15, F16. Nothing here deletes or edits data.
-- Where a CHECK / FK is added it is added NOT VALID (enforced for every new or
-- changed row at once) and then VALIDATEd inside a guarded block, so a legacy
-- row that breaks a rule produces a NOTICE instead of failing the deploy.
-- ============================================================================

create or replace function pg_temp.try_validate(p_table regclass, p_constraint text) returns void
language plpgsql as $$
begin
  execute format('alter table %s validate constraint %I', p_table, p_constraint);
exception when others then
  raise notice 'HYGIENE: % on % left NOT VALID (existing rows break it): %', p_constraint, p_table, sqlerrm;
end $$;

-- ---- F9: analytics_events cannot be used to spam or to forge a user ---------
drop policy if exists "anyone can log analytics events" on public.analytics_events;
drop policy if exists analytics_insert_own_or_anon on public.analytics_events;
create policy analytics_insert_own_or_anon on public.analytics_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

alter table public.analytics_events drop constraint if exists analytics_events_name_len;
alter table public.analytics_events add constraint analytics_events_name_len
  check (char_length(name) between 1 and 64) not valid;
alter table public.analytics_events drop constraint if exists analytics_events_params_size;
alter table public.analytics_events add constraint analytics_events_params_size
  check (octet_length(params::text) <= 4096) not valid;
select pg_temp.try_validate('public.analytics_events', 'analytics_events_name_len');
select pg_temp.try_validate('public.analytics_events', 'analytics_events_params_size');

-- ---- F10: email is server-owned; changing the phone drops mobile_verified ----
create or replace function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_course_id text;
  v_client boolean := coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated');
  v_bypass boolean := coalesce(current_setting('app.allow_profile_admin_fields', true), 'false') = 'true';
  v_is_admin boolean := public.am_i_admin();
  v_protected text[] := array[
    'id', 'blocked', 'is_blocked', 'role', 'is_admin', 'is_staff', 'status',
    'email', 'email_verified', 'mobile_verified', 'referral_code', 'course_id', 'year_id',
    'created_at'
  ];
  v_old jsonb;
  v_new jsonb;
  v_col text;
begin
  if v_client and not v_bypass and not v_is_admin then
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
      foreach v_col in array v_protected loop
        if v_new -> v_col is distinct from v_old -> v_col then
          raise exception 'Cannot modify protected profile field "%"', v_col
            using errcode = '42501';
        end if;
      end loop;
      -- A verified number stops being verified the moment it is replaced.
      if public.normalize_phone(new.phone) is distinct from public.normalize_phone(old.phone) then
        new.mobile_verified := false;
      end if;
    else
      -- A client-created profile row starts unblocked and unverified.
      new.blocked := false;
      new.email_verified := false;
      new.mobile_verified := false;
    end if;
  end if;

  -- Self-heal: if year_id no longer belongs to course_id, clear it.
  if new.year_id is not null then
    select course_id into v_year_course_id from public.years where id = new.year_id;
    if v_year_course_id is null or v_year_course_id is distinct from new.course_id then
      new.year_id := null;
    end if;
  end if;

  return new;
end;
$$;

-- profiles.email now only changes when the auth email does.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    perform set_config('app.allow_profile_admin_fields', 'true', true);
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
    perform set_config('app.allow_profile_admin_fields', 'false', true);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ---- F14: quiz_scores cannot hold nonsense or someone else's email -----------
-- (The app still grades on the device, so a student can claim a perfect score;
-- what is closed here is score > total, negative, percentage 99999 and a forged
-- email. Real protection needs server-side grading.)
alter table public.quiz_scores drop constraint if exists quiz_scores_sane;
alter table public.quiz_scores add constraint quiz_scores_sane
  check (total > 0 and score >= 0 and score <= total and percentage between 0 and 100) not valid;
select pg_temp.try_validate('public.quiz_scores', 'quiz_scores_sane');

create or replace function public.quiz_scores_own_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    new.email := (select p.email from public.profiles p where p.id = new.user_id);
  end if;
  return new;
end;
$$;
revoke all on function public.quiz_scores_own_email() from public, anon, authenticated;

drop trigger if exists quiz_scores_own_email on public.quiz_scores;
create trigger quiz_scores_own_email
  before insert or update on public.quiz_scores
  for each row execute function public.quiz_scores_own_email();

-- ---- F15: integrity ----------------------------------------------------------
-- (a) an order is always for a positive amount
alter table public.orders drop constraint if exists orders_amount_positive;
alter table public.orders add constraint orders_amount_positive check (amount > 0) not valid;
select pg_temp.try_validate('public.orders', 'orders_amount_positive');

-- (b) the Phase 2 price-breakdown check was created NOT VALID; validate it
select pg_temp.try_validate('public.orders', 'orders_phase2_amounts');

-- (c) deleting an order must not silently delete its payment record
alter table public.payments drop constraint if exists payments_order_id_fkey;
alter table public.payments add constraint payments_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete restrict not valid;
select pg_temp.try_validate('public.payments', 'payments_order_id_fkey');

-- (d) referrals.first_order_id now points at a real order
alter table public.referrals drop constraint if exists referrals_first_order_id_fkey;
alter table public.referrals add constraint referrals_first_order_id_fkey
  foreign key (first_order_id) references public.orders(id) on delete set null not valid;
select pg_temp.try_validate('public.referrals', 'referrals_first_order_id_fkey');

-- (e) payments.razorpay_payment_id had two identical unique indexes; keep the
-- constraint (payments_razorpay_payment_id_key), drop the redundant plain index.
-- ON CONFLICT (razorpay_payment_id) keeps working against the constraint.
drop index if exists public.payments_razorpay_payment_id_unique;

-- ---- F16: the wallet cannot go below zero, in the database itself ------------
create or replace function public.wallet_ledger_no_overdraw()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal numeric;
begin
  if new.user_id is null or new.entry_type not in ('debit', 'reversal') or new.status <> 'available' then
    return new;
  end if;
  -- same lock key as create_priced_order / settle_razorpay_payment
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || new.user_id::text, 0));
  select coalesce(sum(amount) filter (where entry_type = 'credit' and status = 'available'
                                        and (expires_at is null or expires_at > now())), 0)
       - coalesce(sum(amount) filter (where entry_type in ('debit', 'reversal') and status = 'available'), 0)
    into v_bal
    from public.wallet_ledger where user_id = new.user_id;
  if v_bal < new.amount then
    raise exception 'wallet_ledger: a % of % would overdraw the wallet (available %)', new.entry_type, new.amount, v_bal
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.wallet_ledger_no_overdraw() from public, anon, authenticated;

drop trigger if exists wallet_ledger_03_no_overdraw on public.wallet_ledger;
create trigger wallet_ledger_03_no_overdraw
  before insert on public.wallet_ledger
  for each row execute function public.wallet_ledger_no_overdraw();

-- An admin reversal reverses what the referrer still HAS, never more, and never
-- an expired credit; a fully spent credit is refused with a clear message.
create or replace function public.admin_reverse_wallet_credit(p_ledger_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.wallet_ledger%rowtype;
  v_avail numeric(10, 2);
  v_amt numeric(10, 2);
begin
  if not public.am_i_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into v_row from public.wallet_ledger where id = p_ledger_id for update;
  if not found or v_row.entry_type <> 'credit' or v_row.status <> 'available' then
    raise exception 'Only an available credit can be reversed';
  end if;
  if v_row.user_id is null then
    raise exception 'This credit belongs to a deleted account';
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    raise exception 'This credit has already expired';
  end if;
  if exists (select 1 from public.wallet_ledger where entry_type = 'reversal' and reverses_id = v_row.id) then
    raise exception 'This credit was already reversed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_row.user_id::text, 0));
  select available into v_avail from public.wallet_balance_of(v_row.user_id);
  v_amt := least(v_row.amount, coalesce(v_avail, 0));
  if v_amt <= 0 then
    raise exception 'Nothing left to reverse: the student has already spent this credit';
  end if;

  perform set_config('app.trusted_order_write', 'true', true);
  insert into public.wallet_ledger (user_id, entry_type, status, amount, source, reverses_id, referral_id, note)
  values (v_row.user_id, 'reversal', 'available', v_amt, 'admin_adjustment', v_row.id, v_row.referral_id,
          left(coalesce(p_note, 'admin reversal')
               || case when v_amt < v_row.amount then ' (partial: ' || v_amt || ' of ' || v_row.amount || ' was still available)' else '' end, 500));
  perform set_config('app.trusted_order_write', 'false', true);
end;
$$;
revoke all on function public.admin_reverse_wallet_credit(uuid, text) from public, anon;
grant execute on function public.admin_reverse_wallet_credit(uuid, text) to authenticated;
