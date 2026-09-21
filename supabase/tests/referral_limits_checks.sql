-- ============================================================================
-- Referral settings limits + audit checks.
-- Run AFTER 20260928100000_referral_settings_limits_and_audit.sql:
--   psql "$DB_URL" -f supabase/tests/referral_limits_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL".
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table rl_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into rl_results values (p_name, coalesce(p_ok, false), p_detail) $$;
-- Runs p_sql as p_role / p_uid; returns 'OK <rows>' or 'ERR: <message>'.
create function pg_temp.dml(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text; n bigint;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}' else json_build_object('sub', p_uid, 'role', p_role, 'email', p_role || '@example.com')::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; res := 'OK ' || n::text;
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
-- Same as dml but as the table owner (what the SQL editor / a bypassed form does): only the CHECK matters.
create function pg_temp.upd(p_set text) returns text
language plpgsql as $$
begin
  execute 'update public.referral_settings set ' || p_set || ' where id = true';
  return 'OK';
exception when others then return 'ERR: ' || sqlerrm;
end $$;
\o /dev/null
insert into auth.users(id, email) values ('bd000000-0000-0000-0000-000000000001', 'rl_admin@example.com'), ('bd000000-0000-0000-0000-000000000002', 'rl_student@example.com');
insert into public.admins(id, email) values ('bd000000-0000-0000-0000-000000000001', 'rl_admin@example.com');
\set ADM '''bd000000-0000-0000-0000-000000000001'''
\set STU '''bd000000-0000-0000-0000-000000000002'''

-- start from known-good values so each check varies exactly one field
update public.referral_settings set
  friend_discount_percent = 10, friend_discount_max = 100, referrer_credit_amount = 50,
  credit_hold_days = 7, wallet_max_percent = 50, apply_window_days = 2, max_referrals_per_user = 5
 where id = true;
delete from public.referral_settings_audit;

-- ---- CHECK constraints: value -> expected verdict ------------------------------------------------
-- (field, value, ok?)   boundaries on both sides of every range; the constraint name proves WHICH rule fired
create temp table rl_cases(field text, val text, ok boolean);
insert into rl_cases values
  ('friend_discount_percent', '0', true),  ('friend_discount_percent', '50', true), ('friend_discount_percent', '20.5', true),
  ('friend_discount_percent', '-1', false), ('friend_discount_percent', '50.01', false), ('friend_discount_percent', '51', false),
  ('friend_discount_percent', '100', false), ('friend_discount_percent', 'null', false), ('friend_discount_percent', '''NaN''::numeric', false),
  ('friend_discount_max', 'null', true), ('friend_discount_max', '1', true), ('friend_discount_max', '10000', true),
  ('friend_discount_max', '0', false), ('friend_discount_max', '0.5', false), ('friend_discount_max', '10001', false), ('friend_discount_max', '-5', false),
  ('referrer_credit_amount', '0', true), ('referrer_credit_amount', '10000', true),
  ('referrer_credit_amount', '-1', false), ('referrer_credit_amount', '10001', false), ('referrer_credit_amount', 'null', false),
  ('credit_hold_days', '0', true), ('credit_hold_days', '90', true),
  ('credit_hold_days', '-1', false), ('credit_hold_days', '91', false), ('credit_hold_days', '365', false), ('credit_hold_days', 'null', false),
  ('wallet_max_percent', '1', true), ('wallet_max_percent', '100', true),
  ('wallet_max_percent', '0', false), ('wallet_max_percent', '100.01', false), ('wallet_max_percent', '-10', false), ('wallet_max_percent', 'null', false),
  ('apply_window_days', '1', true), ('apply_window_days', '30', true),
  ('apply_window_days', '0', false), ('apply_window_days', '31', false), ('apply_window_days', 'null', false),
  ('max_referrals_per_user', 'null', true), ('max_referrals_per_user', '1', true), ('max_referrals_per_user', '1000', true),
  ('max_referrals_per_user', '0', false), ('max_referrals_per_user', '1001', false), ('max_referrals_per_user', '-3', false);

do $$
declare c record; r text;
begin
  for c in select * from rl_cases loop
    begin
      r := pg_temp.upd(format('%I = %s', c.field, c.val));
      insert into rl_results values (
        format('C %s = %s is %s', c.field, c.val, case when c.ok then 'accepted' else 'rejected' end),
        case when c.ok then r = 'OK'
             -- a bad value must be refused BY that field's own constraint (or the column's NOT NULL)
             else r like 'ERR: new row for relation "referral_settings" violates check constraint "referral_settings_' || c.field || '_range"%'
               or (c.val = 'null' and r like 'ERR: null value in column "' || c.field || '"%') end,
        r);
    end;
    -- put the known-good value back (the upd() above rolled back on failure, but not on success)
    perform pg_temp.upd(format('%I = %s', c.field,
      case c.field when 'friend_discount_percent' then '10' when 'friend_discount_max' then '100' when 'referrer_credit_amount' then '50'
                   when 'credit_hold_days' then '7' when 'wallet_max_percent' then '50' when 'apply_window_days' then '2' else '5' end));
  end loop;
end $$;

-- the catch-all Phase 2 constraint is gone; its other rules still hold
select pg_temp.chk('K1 old referral_settings_phase2_ranges is replaced, the seven range constraints exist',
  not exists (select 1 from pg_constraint where conname = 'referral_settings_phase2_ranges')
  and (select count(*) from pg_constraint where conrelid = 'public.referral_settings'::regclass and conname like 'referral\_settings\_%\_range') = 7);
select pg_temp.chk('K2 checkout_expiry_minutes 4 is still rejected', pg_temp.upd('checkout_expiry_minutes = 4') like 'ERR:%referral_settings_other_ranges%');
select pg_temp.chk('K3 an unknown wallet product type is still rejected', pg_temp.upd($$wallet_product_types = array['notes','gold']$$) like 'ERR:%referral_settings_other_ranges%');
select pg_temp.chk('K4 credit_expiry_days 0 is still rejected, blank still allowed',
  pg_temp.upd('credit_expiry_days = 0') like 'ERR:%referral_settings_other_ranges%' and pg_temp.upd('credit_expiry_days = null') = 'OK');

-- ---- a rejected save changes nothing --------------------------------------------------------------------
select pg_temp.chk('R1 a multi-column update with one bad value is refused as a whole',
  pg_temp.upd('friend_discount_percent = 20, wallet_max_percent = 0') like 'ERR:%'
  and (select friend_discount_percent = 10 and wallet_max_percent = 50 from public.referral_settings));

-- ---- bypassing the form: an admin session hitting the table directly ------------------------------
select pg_temp.chk('B1 admin session, direct PATCH with a bad value is rejected by the database',
  pg_temp.dml('authenticated', :ADM::uuid, 'update public.referral_settings set friend_discount_percent = 90 where id = true') like 'ERR:%referral_settings_friend_discount_percent_range%');
select pg_temp.chk('B2 admin session, a valid change is accepted',
  pg_temp.dml('authenticated', :ADM::uuid, 'update public.referral_settings set friend_discount_percent = 12 where id = true') = 'OK 1');
select pg_temp.chk('B3 a student cannot change settings at all',
  pg_temp.dml('authenticated', :STU::uuid, 'update public.referral_settings set friend_discount_percent = 12 where id = true') = 'OK 0');

-- ---- audit ------------------------------------------------------------------------------------------------
delete from public.referral_settings_audit;
select pg_temp.dml('authenticated', :ADM::uuid, 'update public.referral_settings set wallet_max_percent = 60, credit_hold_days = 3 where id = true');
select pg_temp.chk('A1 one change = one audit row, with admin id and email',
  (select count(*) = 1 and bool_and(changed_by = :ADM::uuid) and bool_and(changed_by_email = 'authenticated@example.com') from public.referral_settings_audit));
select pg_temp.chk('A2 only the changed columns are logged, old and new',
  (select old_values = '{"wallet_max_percent": 50, "credit_hold_days": 7}'::jsonb and new_values = '{"wallet_max_percent": 60, "credit_hold_days": 3}'::jsonb
     from public.referral_settings_audit));
select pg_temp.chk('A3 changed_at is set', (select changed_at > now() - interval '1 minute' from public.referral_settings_audit));
select pg_temp.upd('max_referrals_per_user = null') as a4_update \gset
select pg_temp.chk('A4 blank -> value and value -> blank both keep the null in the log',
  :'a4_update' = 'OK'
  and (select old_values = '{"max_referrals_per_user": 5}'::jsonb and new_values = '{"max_referrals_per_user": null}'::jsonb
         from public.referral_settings_audit order by id desc limit 1));
select pg_temp.upd('wallet_max_percent = wallet_max_percent') as a5_update \gset
select pg_temp.chk('A5 an update that changes nothing writes no audit row',
  :'a5_update' = 'OK' and (select count(*) from public.referral_settings_audit) = 2);
select pg_temp.upd('wallet_max_percent = 0') as a6_update \gset
select pg_temp.chk('A6 a REJECTED update writes no audit row',
  :'a6_update' like 'ERR:%' and (select count(*) from public.referral_settings_audit) = 2);
select pg_temp.chk('A7 the audit row is written by an update run outside a user session too (changed_by null)',
  (select changed_by is null and changed_by_email is null from public.referral_settings_audit order by id desc limit 1));

-- ---- audit table access -----------------------------------------------------------------------------------------
select pg_temp.chk('P1 admin can read the audit table', pg_temp.dml('authenticated', :ADM::uuid, 'select * from public.referral_settings_audit') = 'OK 2');
select pg_temp.chk('P2 a student sees no audit rows', pg_temp.dml('authenticated', :STU::uuid, 'select * from public.referral_settings_audit') = 'OK 0');
select pg_temp.chk('P3 anon cannot read the audit table', pg_temp.dml('anon', null, 'select * from public.referral_settings_audit') like 'ERR: permission denied%');
select pg_temp.chk('P4 not even an admin can insert, edit or delete audit rows',
  pg_temp.dml('authenticated', :ADM::uuid, $$insert into public.referral_settings_audit(old_values,new_values) values ('{}','{}')$$) like 'ERR: permission denied%'
  and pg_temp.dml('authenticated', :ADM::uuid, 'update public.referral_settings_audit set changed_by = null') like 'ERR: permission denied%'
  and pg_temp.dml('authenticated', :ADM::uuid, 'delete from public.referral_settings_audit') like 'ERR: permission denied%');
select pg_temp.chk('P5 the trigger function cannot be called by clients',
  not has_function_privilege('authenticated', 'public.log_referral_settings_change()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.log_referral_settings_change()', 'EXECUTE'));
select pg_temp.chk('P6 a student cannot forge a change through the admin-only settings policy',
  pg_temp.dml('authenticated', :STU::uuid, 'update public.referral_settings set wallet_max_percent = 99 where id = true') = 'OK 0'
  and (select count(*) from public.referral_settings_audit) = 2);

\o
\set QUIET off
select case when ok then 'PASS' else 'FAIL' end as verdict, name, case when ok then '' else detail end as detail
  from rl_results where not ok order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from rl_results;
rollback;
