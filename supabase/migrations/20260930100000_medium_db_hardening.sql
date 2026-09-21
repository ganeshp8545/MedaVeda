-- ============================================================================
-- MEDIUM-priority audit fixes (database side).
--   1. function search_path pinned on the 5 functions the linter flagged
--   2. EXECUTE removed from anon (and, for trigger functions, from everyone) where no
--      client path needs it (Supabase advisor: *_security_definer_function_executable)
--   3. RLS policies re-written with (select auth.uid()) so it is evaluated once per query
--   4. exact-duplicate permissive policies dropped (same rows, evaluated twice)
--   5. indexes on foreign keys that had none
--   6. abuse limits on client-writable tables: quiz_scores, analytics_events, push_tokens
--   7. register_push_token(): a device token moves to whoever is signed in on that device
--   8. groundwork for phone verification: when Supabase Auth confirms a phone (SMS OTP,
--      once a provider is configured), profiles.mobile_verified is set by the server
-- ============================================================================

-- 1. search_path -------------------------------------------------------------------------
alter function public.normalize_phone(text)          set search_path = public, pg_temp;
alter function public.app_config_touch_updated_at()  set search_path = public, pg_temp;
alter function public.orders_immutable_columns()     set search_path = public, pg_temp;
alter function public.wallet_ledger_append_only()    set search_path = public, pg_temp;
alter function public.wallet_ledger_no_truncate()    set search_path = public, pg_temp;

-- 2. EXECUTE ------------------------------------------------------------------------------
-- Trigger / event-trigger functions are never called through the API and do not need
-- EXECUTE to fire (the privilege is only checked when the trigger is created).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- RPCs that need a signed-in user: anon gets nothing.
revoke execute on function public.set_my_course_year(text, text) from public, anon;
revoke execute on function public.my_course_id() from public, anon;
revoke execute on function public.my_year_id() from public, anon;
revoke execute on function public.has_content_access(text, text) from public, anon;
grant execute on function public.set_my_course_year(text, text) to authenticated;
grant execute on function public.my_course_id() to authenticated;
grant execute on function public.my_year_id() to authenticated;
grant execute on function public.has_content_access(text, text) to authenticated;
-- am_i_admin() and user_owns_chapter() stay executable by anon on purpose: RLS policies that
-- apply to the public role call them, and a permission error there would break anon reads.

-- 3. auth.uid() -> (select auth.uid()) ----------------------------------------------------
do $$
declare r record; v_q text; v_w text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
      and (coalesce(qual, '') || coalesce(with_check, '')) !~* 'select auth\.uid\(\)'
  loop
    v_q := regexp_replace(r.qual,       'auth\.uid\(\)', '(select auth.uid())', 'g');
    v_w := regexp_replace(r.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    if r.qual is not null and r.with_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', r.policyname, r.schemaname, r.tablename, v_q, v_w);
    elsif r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', r.policyname, r.schemaname, r.tablename, v_q);
    else
      execute format('alter policy %I on %I.%I with check (%s)', r.policyname, r.schemaname, r.tablename, v_w);
    end if;
  end loop;
end $$;

-- 4. duplicate policies (each is fully covered by the policy kept) ----------------------------
drop policy if exists "Admins can view all orders"     on public.orders;     -- orders_select_own_or_admin
drop policy if exists "Users can view own orders"      on public.orders;
drop policy if exists "Admins can view all payments"   on public.payments;   -- payments_admin_read
drop policy if exists "Admins can view all purchases"  on public.purchases;  -- purchases_select_own_or_admin
drop policy if exists "Users can view own purchases"   on public.purchases;
drop policy if exists "Users manage their own push tokens" on public.push_tokens; -- push_tokens_own
drop policy if exists "user write own quiz_scores"     on public.quiz_scores; -- quiz_scores_own_or_admin

-- 5. foreign-key indexes ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, c.conrelid::regclass::text as tname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', 'idx_' || replace(r.tname, 'public.', '') || '_' || r.col, r.tbl, r.col);
  end loop;
end $$;

-- 6. abuse limits on client-writable tables ---------------------------------------------------
-- quiz_scores: a student can save scores, not flood the table.
create or replace function public.quiz_scores_rate_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
     and not public.rate_limit_hit('quiz-score:' || new.user_id::text, 120, 3600) then
    raise exception 'Too many quiz results saved recently. Please try again later.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists quiz_scores_rate_limit on public.quiz_scores;
create trigger quiz_scores_rate_limit before insert on public.quiz_scores
  for each row execute function public.quiz_scores_rate_limit();

-- analytics_events: excess events are dropped silently (analytics must never break the app).
-- Signed-in: 600 per user per hour. Anonymous: 300 per minute across all anonymous clients.
create or replace function public.analytics_events_rate_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated') then
    if new.user_id is null then
      if not public.rate_limit_hit('analytics-anon', 300, 60) then return null; end if;
    elsif not public.rate_limit_hit('analytics-user:' || new.user_id::text, 600, 3600) then
      return null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists analytics_events_rate_limit on public.analytics_events;
create trigger analytics_events_rate_limit before insert on public.analytics_events
  for each row execute function public.analytics_events_rate_limit();

-- push_tokens: only real Expo tokens, at most 10 devices per user.
alter table public.push_tokens drop constraint if exists push_tokens_token_format;
alter table public.push_tokens add constraint push_tokens_token_format
  check (expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$');

create or replace function public.push_tokens_cap()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('role', true), 'none') in ('anon', 'authenticated')
     and not exists (select 1 from public.push_tokens where expo_push_token = new.expo_push_token)
     and (select count(*) from public.push_tokens where user_id = new.user_id) >= 10 then
    raise exception 'Too many registered devices.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists push_tokens_cap on public.push_tokens;
create trigger push_tokens_cap before insert on public.push_tokens
  for each row execute function public.push_tokens_cap();

-- the trigger functions created in this migration follow the same rule
revoke all on function public.quiz_scores_rate_limit()      from public, anon, authenticated;
revoke all on function public.analytics_events_rate_limit() from public, anon, authenticated;
revoke all on function public.push_tokens_cap()             from public, anon, authenticated;

-- 7. register_push_token ------------------------------------------------------------------------
-- A plain upsert cannot take over a token row that belongs to the previous user of a shared
-- device (RLS hides it), so the new user never got pushes and the old one kept getting them.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' then
    raise exception 'Invalid push token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web') then
    raise exception 'Invalid platform' using errcode = '22023';
  end if;
  if not public.rate_limit_hit('push-register:' || v_uid::text, 30, 3600) then
    raise exception 'Too many requests' using errcode = '54000';
  end if;

  insert into public.push_tokens (user_id, expo_push_token, platform, updated_at)
  values (v_uid, p_token, p_platform, now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();

  -- keep only this user's 10 most recent devices
  delete from public.push_tokens
  where user_id = v_uid
    and id not in (select id from public.push_tokens where user_id = v_uid order by updated_at desc limit 10);
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- 8. phone verification groundwork ---------------------------------------------------------------
-- Inert until an SMS provider is enabled in Supabase Auth and the app starts a phone OTP flow
-- (auth.updateUser({phone}) then auth.verifyOtp). When Auth confirms a phone number this marks
-- that number as the profile's verified number. Nothing on the client can set mobile_verified.
create or replace function public.sync_profile_mobile_verified()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_norm text;
begin
  if new.phone_confirmed_at is null or coalesce(new.phone, '') = '' then return new; end if;
  if tg_op = 'UPDATE' and old.phone_confirmed_at is not distinct from new.phone_confirmed_at
     and old.phone is not distinct from new.phone then
    return new;
  end if;
  v_norm := public.normalize_phone('+' || ltrim(new.phone, '+'));
  if v_norm is null then return new; end if;
  perform set_config('app.allow_profile_admin_fields', 'true', true);
  begin
    update public.profiles set phone = v_norm, mobile_verified = true, updated_at = now() where id = new.id;
  exception when unique_violation then
    null;   -- that number already belongs to another profile: leave this one unverified
  end;
  perform set_config('app.allow_profile_admin_fields', 'false', true);
  return new;
end $$;
revoke all on function public.sync_profile_mobile_verified() from public, anon, authenticated;
drop trigger if exists on_auth_user_phone_confirmed on auth.users;
create trigger on_auth_user_phone_confirmed
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_profile_mobile_verified();
