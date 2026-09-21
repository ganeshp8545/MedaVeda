-- ============================================================================
-- Batch 3b checks: returning-customer guard (deleted-and-recreated account) and the
-- shared-network hold. Run AFTER 20260927120000 + 20260927130000 (and Batch 1):
--   psql "$DB_URL" -f supabase/tests/batch3b_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL". Backfill: batch3b_backfill.sh.
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table b3b_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into b3b_results values (p_name, coalesce(p_ok, false), p_detail) $$;
create function pg_temp.attempt(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; res := 'OK'; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
create function pg_temp.q(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into res; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return coalesce(res, '<null>');
end $$;
create function pg_temp.srv(p_sql text) returns text
language plpgsql as $$
declare res text;
begin execute p_sql into res; return coalesce(res, '<null>'); exception when others then return 'ERR: ' || sqlerrm; end $$;
create function pg_temp.exec(p_sql text) returns text
language plpgsql as $$ begin execute p_sql; return 'OK'; exception when others then return 'ERR: ' || sqlerrm; end $$;
create function pg_temp.apply(p_uid uuid, p_code text) returns text
language sql as $fn$ select pg_temp.q('authenticated', p_uid, format($$select public.apply_referral_code(%L)->>'status'$$, p_code)) $fn$;
create function pg_temp.mkorder(p_uid uuid, p_product text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.create_priced_order(p_uid, p_product, false);
  if (r->>'ok')::boolean then update public.orders set razorpay_order_id = 'order_' || replace(r->>'order_id', '-', '') where id = r->>'order_id'; end if;
  return r;
end $$;
create function pg_temp.pay(p_order text) returns text
language plpgsql as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform public.grant_razorpay_payment('evt_' || p_order, o.razorpay_order_id, 'pay_' || p_order, round(o.amount * 100)::bigint);
  return 'OK';
exception when others then return 'ERR: ' || sqlerrm; end $$;
-- count rows of any (possibly missing) table without aborting: -1 when the query errors
create function pg_temp.cnt(p_sql text) returns bigint
language plpgsql as $$ declare n bigint; begin execute p_sql into n; return n; exception when others then return -1; end $$;
create function pg_temp.quote_disc(p_uid uuid, p_product text) returns text
language sql as $fn$ select pg_temp.q('authenticated', p_uid, format($$select (public.quote_my_order(%L, false)->>'referral_discount')$$, p_product)) $fn$;
-- make a referral fixture without going through apply_referral_code
create function pg_temp.refer(p_referrer uuid, p_friend uuid) returns text
language sql as $fn$ select pg_temp.exec(format($$insert into public.referrals(referrer_id, referred_id, code_used, status) values (%L, %L, 'X', 'pending')$$, p_referrer, p_friend)) $fn$;

\o /dev/null
insert into auth.users(id, email) values
  ('b9000000-0000-0000-0000-000000000001', 'ab@gmail.com'),                 -- OLD1: bought, then deletes the account
  ('b9000000-0000-0000-0000-000000000002', 'ref_a@example.com'),            -- referrer A
  ('b9000000-0000-0000-0000-000000000004', 'fresh2@example.com'),           -- NEW2: same PHONE as OLD1, other email
  ('b9000000-0000-0000-0000-000000000005', 'fresh3@example.com'),           -- NEW3: genuinely new
  ('b9000000-0000-0000-0000-000000000006', 'fresh4@example.com'),           -- NEW4: new, no phone
  ('b9000000-0000-0000-0000-000000000007', 'refunder@example.com'),         -- buys then full refund
  ('b9000000-0000-0000-0000-000000000008', 'own@example.com'),              -- buys two products (own history is not "prior")
  ('b9000000-0000-0000-0000-000000000063', 'b3b_adm@example.com');
insert into public.admins(id, email) values ('b9000000-0000-0000-0000-000000000063', 'b3b_adm@example.com');
\set OLD1 '''b9000000-0000-0000-0000-000000000001'''
\set A    '''b9000000-0000-0000-0000-000000000002'''
\set NEW1 '''b9000000-0000-0000-0000-000000000003'''
\set NEW2 '''b9000000-0000-0000-0000-000000000004'''
\set NEW3 '''b9000000-0000-0000-0000-000000000005'''
\set NEW4 '''b9000000-0000-0000-0000-000000000006'''
\set REF  '''b9000000-0000-0000-0000-000000000007'''
\set OWN  '''b9000000-0000-0000-0000-000000000008'''
\set ADM  '''b9000000-0000-0000-0000-000000000063'''
update public.profiles set phone = '+919000000001' where id = :OLD1;
update public.profiles set phone = '+919000000001' where id = :NEW2 and false;   -- set after OLD1 is gone (unique phone)
update public.profiles set phone = '+919000000003' where id = :NEW3;
insert into public.years(id, title, course_id) values ('bxy', 'BX year', 'bams');
insert into public.subjects(id, title, year_id) values ('bxs', 'BX subject', 'bxy');
insert into public.chapters(id, title, subject_id) select 'bxc' || n, 'c' || n, 'bxs' from generate_series(1, 12) n;
insert into public.products(id, title, scope, price, original_price, chapter_id, active, product_type)
  select 'bx' || n, 'notes ' || n, 'chapter', 500, 900, 'bxc' || n, true, 'notes' from generate_series(1, 12) n;
update public.referral_settings set enabled = true, friend_discount_percent = 10, friend_discount_max = 100,
  referrer_credit_amount = 50, credit_hold_days = 7, wallet_max_percent = 50, apply_window_days = 2, max_referrals_per_user = null where id = true;
select pg_temp.exec($$update public.referral_settings set require_verified_phone = false where id = true$$);
select referral_code as a_code from public.profiles where id = :A \gset

-- ============================================================================
-- the setting itself
-- ============================================================================
select pg_temp.chk('S0 require_verified_phone defaults to FALSE (no verification flow exists yet)',
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'referral_settings' and column_name = 'require_verified_phone') = 'false');

-- ============================================================================
-- 1. returning customer: deleted-and-recreated account
-- ============================================================================
select pg_temp.mkorder(:OLD1::uuid, 'bx1') as o1 \gset
select pg_temp.pay(:'o1'::jsonb->>'order_id');
select pg_temp.chk('R1 a purchase records ONE hash per identity (email + phone), never the raw values',
  pg_temp.cnt(format($$select count(*) from public.first_purchase_identities where account_id = %L$$, :OLD1)) = 2
  and pg_temp.cnt($$select count(*) from public.first_purchase_identities where length(identity_hash) <> 64 or identity_hash !~ '^[0-9a-f]+$'$$) = 0
  and pg_temp.cnt($$select count(*) from public.first_purchase_identities where identity_hash ~* '(gmail|@|9000000)'$$) = 0);
select pg_temp.srv(format($$select public.erase_user_data(%L)::text$$, :OLD1)) as er \gset
delete from auth.users where id = :OLD1;
select pg_temp.chk('R2 the account is really gone (profile and purchases)',
  not exists (select 1 from public.profiles where id = :OLD1) and not exists (select 1 from public.purchases where user_id = :OLD1), :'er');
select pg_temp.chk('R3 ... but the identity hashes survive the deletion',
  pg_temp.cnt(format($$select count(*) from public.first_purchase_identities where account_id = %L$$, :OLD1)) = 2);
-- the same person signs up again: same mailbox written differently (gmail dots / +tag), new number
insert into auth.users(id, email) values ('b9000000-0000-0000-0000-000000000003', 'a.b+resign@Gmail.com');
update public.profiles set phone = '+919000000009' where id = :NEW1;
select pg_temp.apply(:NEW1::uuid, :'a_code') as r \gset
select pg_temp.chk('R4 re-signup with the same mailbox (gmail dots / +tag / case): cannot apply a referral code', :'r' = 'already_purchased'
  and not exists (select 1 from public.referrals where referred_id = :NEW1), :'r');
select pg_temp.refer(:A::uuid, :NEW1::uuid);
select pg_temp.mkorder(:NEW1::uuid, 'bx2') as n1 \gset
select pg_temp.chk('R5 ... and even with a referral row in place, checkout gives NO friend discount',
  (:'n1'::jsonb->>'referral_discount')::numeric = 0 and (:'n1'::jsonb->>'amount')::numeric = 500, :'n1');
select pg_temp.chk('R6 ... and the quote the app shows says the same', pg_temp.quote_disc(:NEW1::uuid, 'bx2') = '0.00', pg_temp.quote_disc(:NEW1::uuid, 'bx2'));
select pg_temp.pay(:'n1'::jsonb->>'order_id');
select pg_temp.chk('R7 ... the purchase is granted, but the referrer gets NO credit and the referral is closed as returning_customer',
  (select count(*) from public.purchases where order_id = (:'n1'::jsonb->>'order_id') and status = 'success') = 1
  and (select count(*) from public.wallet_ledger where user_id = :A and source = 'referral_reward') = 0
  and (select status || ':' || reject_reason from public.referrals where referred_id = :NEW1) = 'rejected:returning_customer');

-- same PHONE, different email (the number of the deleted account)
update public.profiles set phone = '+919000000001' where id = :NEW2;
select pg_temp.apply(:NEW2::uuid, :'a_code') as r \gset
select pg_temp.chk('P1 same PHONE as a previous buyer (new email): cannot apply either', :'r' = 'already_purchased', :'r');

-- genuinely new users are not affected
select pg_temp.apply(:NEW3::uuid, :'a_code') as r \gset
select pg_temp.chk('G1 a genuinely new user (new email, new phone) can apply', :'r' = 'success', :'r');
select pg_temp.mkorder(:NEW3::uuid, 'bx3') as g \gset
select pg_temp.chk('G2 ... gets the 10% friend discount (50)', (:'g'::jsonb->>'referral_discount')::numeric = 50, :'g');
select pg_temp.pay(:'g'::jsonb->>'order_id');
select pg_temp.chk('G3 ... their own purchase history is not "prior": the referrer is credited 50 (pending)',
  (select count(*) from public.wallet_ledger where user_id = :A and source = 'referral_reward' and amount = 50 and status = 'pending') = 1
  and (select status from public.referrals where referred_id = :NEW3) = 'qualified');
select pg_temp.apply(:NEW4::uuid, :'a_code') as r \gset
select pg_temp.chk('G4 a new user with no phone at all can apply (a missing phone is not a match)', :'r' = 'success', :'r');

-- own history / refunds / a second purchase
select pg_temp.mkorder(:OWN::uuid, 'bx4') as w1 \gset
select pg_temp.pay(:'w1'::jsonb->>'order_id');
select pg_temp.mkorder(:OWN::uuid, 'bx5') as w2 \gset
select pg_temp.chk('O1 an existing customer buying a SECOND product is not blocked by their own earlier purchase', (:'w2'::jsonb->>'ok')::boolean, :'w2');
select pg_temp.mkorder(:REF::uuid, 'bx6') as f1 \gset
select pg_temp.pay(:'f1'::jsonb->>'order_id');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'f1'::jsonb->>'order_id')));
select pg_temp.chk('O2 a refund does NOT clear the identity (buy - refund - delete - re-signup is not a way back to "first purchase")',
  pg_temp.cnt(format($$select count(*) from public.first_purchase_identities where account_id = %L$$, :REF)) >= 1);

-- server-only
select pg_temp.q('authenticated', :NEW3::uuid, $$select count(*)::text from public.first_purchase_identities$$) as r \gset
select pg_temp.chk('V1 a student cannot read the identity table', :'r' like 'ERR:%permission denied%' or :'r' = '0', :'r');
select pg_temp.chk('V2 the helper functions exist and are not callable by clients',
  coalesce(to_regprocedure('public.has_prior_purchase_identity(uuid)') is not null
  and to_regprocedure('public.record_purchase_identity(uuid)') is not null
  and to_regprocedure('public.identity_hash(text,text)') is not null
  and to_regprocedure('public.accounts_share_network(uuid,uuid)') is not null
  and not has_function_privilege('authenticated', 'public.has_prior_purchase_identity(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_purchase_identity(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.identity_hash(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.accounts_share_network(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.accounts_share_network(uuid,uuid)', 'execute'), false));
select pg_temp.chk('V3 email normalisation: dots+plus+case collapse only for gmail; other domains keep dots',
  pg_temp.srv($$select (public.identity_hash('email', 'A.B+x@Gmail.com') = public.identity_hash('email', 'ab@googlemail.com')
  and public.identity_hash('email', 'a.b@yahoo.com') <> public.identity_hash('email', 'ab@yahoo.com')
  and public.identity_hash('email', 'x+tag@yahoo.com') = public.identity_hash('email', 'x@yahoo.com')
  and public.identity_hash('phone', '+91 98111-00001') = public.identity_hash('phone', '+919811100001')
  and public.identity_hash('phone', 'not a number') is null and public.identity_hash('email', '@x.com') is null)::text$$) = 'true');

-- ============================================================================
-- 2. shared network hold
-- ============================================================================
insert into auth.users(id, email) select ('b9000000-0000-0000-0000-' || lpad((10 + n)::text, 12, '0'))::uuid, 'net_' || n || '@example.com' from generate_series(1, 10) n;
-- pairs: (11 referrer, 12 friend) same IP; (13, 14) different IPs; (15, 16) same IP -> admin rejects; (17, 18) NULL ips; (19, 20) same IP, admin approves after
\set RA '''b9000000-0000-0000-0000-000000000011'''
\set FA '''b9000000-0000-0000-0000-000000000012'''
\set RB '''b9000000-0000-0000-0000-000000000013'''
\set FB '''b9000000-0000-0000-0000-000000000014'''
\set RC '''b9000000-0000-0000-0000-000000000015'''
\set FC '''b9000000-0000-0000-0000-000000000016'''
\set RD '''b9000000-0000-0000-0000-000000000017'''
\set FD '''b9000000-0000-0000-0000-000000000018'''
insert into auth.sessions(id, user_id, ip) values
  (gen_random_uuid(), :RA, '10.1.1.1'), (gen_random_uuid(), :FA, '10.1.1.1'),
  (gen_random_uuid(), :RB, '10.2.2.2'), (gen_random_uuid(), :FB, '10.3.3.3'),
  (gen_random_uuid(), :RC, '10.4.4.4'), (gen_random_uuid(), :FC, '10.4.4.4'),
  (gen_random_uuid(), :RD, null),       (gen_random_uuid(), :FD, null);
select pg_temp.refer(:RA::uuid, :FA::uuid); select pg_temp.refer(:RB::uuid, :FB::uuid); select pg_temp.refer(:RC::uuid, :FC::uuid); select pg_temp.refer(:RD::uuid, :FD::uuid);
select pg_temp.mkorder(:FA::uuid, 'bx7') as a1 \gset
select pg_temp.mkorder(:FB::uuid, 'bx7') as b1 \gset
select pg_temp.mkorder(:FC::uuid, 'bx7') as c1 \gset
select pg_temp.mkorder(:FD::uuid, 'bx7') as d1 \gset
select pg_temp.pay(:'a1'::jsonb->>'order_id'); select pg_temp.pay(:'b1'::jsonb->>'order_id'); select pg_temp.pay(:'c1'::jsonb->>'order_id'); select pg_temp.pay(:'d1'::jsonb->>'order_id');
select pg_temp.chk('N0 all four friends paid: four pending credits',
  (select count(*) from public.wallet_ledger where source = 'referral_reward' and status = 'pending' and user_id in (:RA, :RB, :RC, :RD)) = 4);
alter table public.wallet_ledger disable trigger wallet_ledger_01_append_only;
update public.wallet_ledger set available_at = now() - interval '1 minute' where source = 'referral_reward' and user_id in (:RA, :RB, :RC, :RD);
alter table public.wallet_ledger enable trigger wallet_ledger_01_append_only;
select pg_temp.srv('select public.release_due_wallet_credits(null)::text') as rel \gset
select pg_temp.chk('N1 same IP: the credit is HELD (still pending) even though its hold date has passed',
  (select status from public.wallet_ledger where user_id = :RA and source = 'referral_reward') = 'pending', :'rel');
select pg_temp.chk('N2 ... and an unresolved review flag says why, names both accounts and carries the caveat',
  (select count(*) from public.order_review_flags where order_id = (:'a1'::jsonb->>'order_id') and reason = 'referral_shared_network' and resolved_at is null
      and (details->>'friend_id') = :FA::text and (details->>'referrer_id') = :RA::text
      and details->>'caveat' like '%Wi-Fi%' and details->>'recommended_action' like '%admin_reject_referral%') = 1);
select pg_temp.chk('N3 different IPs: released normally, no flag',
  (select status from public.wallet_ledger where user_id = :RB and source = 'referral_reward') = 'available'
  and not exists (select 1 from public.order_review_flags where order_id = (:'b1'::jsonb->>'order_id')));
select pg_temp.chk('N4 sessions with NO ip are not a match: released normally',
  (select status from public.wallet_ledger where user_id = :RD and source = 'referral_reward') = 'available'
  and not exists (select 1 from public.order_review_flags where order_id = (:'d1'::jsonb->>'order_id')));
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('N5 running the job again neither releases the held credit nor adds a second flag',
  (select status from public.wallet_ledger where user_id = :RA and source = 'referral_reward') = 'pending'
  and (select count(*) from public.order_review_flags where reason = 'referral_shared_network' and order_id = (:'a1'::jsonb->>'order_id')) = 1);
select pg_temp.q('authenticated', :RA::uuid, $$select public.get_my_wallet()::text$$);
select pg_temp.chk('N6 the referrer opening their wallet (which also runs the release) does not release it either',
  (select status from public.wallet_ledger where user_id = :RA and source = 'referral_reward') = 'pending');
select coalesce((select id::text from public.order_review_flags where order_id = (:'a1'::jsonb->>'order_id') and reason = 'referral_shared_network'), '00000000-0000-0000-0000-000000000000') as fa_flag \gset
select pg_temp.attempt('authenticated', :RA::uuid, format($$select public.admin_resolve_order_flag(%L, 'x')$$, :'fa_flag')) as r \gset
select pg_temp.chk('N7 a student (even the referrer) cannot resolve the flag', :'r' like 'ERR:%admin only%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_resolve_order_flag(%L, 'classmates on hostel wifi')$$, :'fa_flag')) as r \gset
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('N8 an admin resolving the flag lets the credit release on the next run',
  :'r' = 'OK' and (select status from public.wallet_ledger where user_id = :RA and source = 'referral_reward') = 'available'
  and (select count(*) from public.order_review_flags where order_id = (:'a1'::jsonb->>'order_id') and reason = 'referral_shared_network') = 1, :'r');
-- rejecting instead
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select id as rc_ref from public.referrals where referred_id = :FC \gset
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reject_referral(%L, 'same person')$$, :'rc_ref')) as r \gset
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('N9 an admin rejecting the referral cancels the held credit, and it never releases',
  :'r' = 'OK' and (select status from public.wallet_ledger where user_id = :RC and source = 'referral_reward') = 'cancelled', :'r');
select pg_temp.q('authenticated', :ADM::uuid, $$select count(*)::text from public.order_review_flags where reason = 'referral_shared_network'$$) as r \gset
select pg_temp.chk('N10 admins can list the held credits; students cannot',
  :'r' = '2' and pg_temp.q('authenticated', :RB::uuid, $$select count(*)::text from public.order_review_flags$$) = '0', :'r');
-- no signal available
alter table auth.sessions rename to sessions_hidden;
select pg_temp.srv(format($$select public.accounts_share_network(%L, %L)::text$$, :RA, :FA)) as r \gset
alter table auth.sessions_hidden rename to sessions;
select pg_temp.chk('N11 if auth.sessions cannot be read there is simply no signal (false), never an error', :'r' = 'false', :'r');
select pg_temp.chk('N12 a pair and itself never "share a network"',
  pg_temp.srv(format($$select (public.accounts_share_network(%L, %L) = false and public.accounts_share_network(null, %L) = false)::text$$, :RA, :RA, :RA)) = 'true');

\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail from b3b_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from b3b_results;
rollback;
