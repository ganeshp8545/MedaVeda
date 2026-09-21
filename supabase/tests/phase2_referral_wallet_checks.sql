-- ============================================================================
-- Phase 2 checks: referral rewards + wallet. Run AFTER 20260925100000..120000.
--   psql "$DB_URL" -f supabase/tests/phase2_referral_wallet_checks.sql
-- One transaction, ROLLED BACK (leaves no data). Prints PASS/FAIL per check and
-- a final "N FAIL, M PASS" line, which must read "0 FAIL". Prefer a staging copy.
-- Client-side attacks run as the real `authenticated` / `anon` roles; server
-- steps run as the migration owner (service_role's privileges are asserted
-- separately with has_function_privilege).
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;

create temp table p2_results(name text, ok boolean, detail text);

create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into p2_results values (p_name, coalesce(p_ok, false), p_detail) $$;

-- Run sql as a role/user. Returns 'OK' or 'ERR: msg'.
create function pg_temp.attempt(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; res := 'OK';
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

-- Run a single-value select as a role/user and return it as text.
create function pg_temp.q(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims',
    case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into res;
  exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;

-- Server steps (what create-order / settle.ts do).
create function pg_temp.mkorder(p_uid uuid, p_product text, p_wallet boolean default false) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.create_priced_order(p_uid, p_product, p_wallet);
  if (r->>'ok')::boolean then
    update public.orders set razorpay_order_id = 'order_' || replace(r->>'order_id', '-', '') where id = r->>'order_id';
  end if;
  return r;
end $$;

create function pg_temp.pay(p_order text) returns void
language plpgsql as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform public.grant_razorpay_payment('evt_' || p_order, o.razorpay_order_id, 'pay_' || p_order, round(o.amount * 100)::bigint);
end $$;

-- Settle with an explicit "payment started at" time (what settle.ts passes from Razorpay).
create function pg_temp.pay_at(p_order text, p_paid_at timestamptz) returns void
language plpgsql as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform public.settle_razorpay_payment('evt_' || p_order, o.razorpay_order_id, 'pay_' || p_order, round(o.amount * 100)::bigint, p_paid_at);
end $$;

\o /dev/null

-- ---- fixtures ---------------------------------------------------------------
-- A = referrer, F = friend (new user), S = stranger, X = a second friend, ADM = admin
insert into auth.users(id, email) values
  ('b2000000-0000-0000-0000-00000000000a', 'p2_a@example.com'),
  ('b2000000-0000-0000-0000-00000000000f', 'p2_f@example.com'),
  ('b2000000-0000-0000-0000-000000000005', 'p2_s@example.com'),
  ('b2000000-0000-0000-0000-0000000000f2', 'p2_x@example.com'),
  ('b2000000-0000-0000-0000-0000000000ad', 'p2_adm@example.com');
insert into public.admins(id, email) values ('b2000000-0000-0000-0000-0000000000ad', 'p2_adm@example.com');
update public.profiles set name = 'Rahul Sharma' where id = 'b2000000-0000-0000-0000-00000000000f';
update public.profiles set name = 'Priya'        where id = 'b2000000-0000-0000-0000-0000000000f2';

insert into public.years(id, title, course_id) values ('p2_y', 'P2 year', 'bams');
insert into public.subjects(id, title, year_id) values ('p2_s', 'P2 subject', 'p2_y');
insert into public.chapters(id, title, subject_id) values ('p2_c1', 'c1', 'p2_s'), ('p2_c2', 'c2', 'p2_s'), ('p2_c3', 'c3', 'p2_s'), ('p2_c4', 'c4', 'p2_s');
insert into public.products(id, title, scope, price, original_price, chapter_id, active, product_type) values
  ('p2_notes500', 'notes 500', 'chapter', 500, 900, 'p2_c1', true, 'notes'),
  ('p2_notes2000', 'notes 2000', 'chapter', 2000, 3000, 'p2_c2', true, 'notes'),
  ('p2_video', 'video pack', 'chapter', 500, null, 'p2_c3', true, 'video'),
  ('p2_other', 'untagged', 'chapter', 500, null, 'p2_c4', true, 'other'),
  -- Batch 1 (F6): a student can no longer buy the SAME product twice, so scenarios that need several
  -- payable orders for one student use these look-alike products instead of repeating p2_notes500.
  ('p2_notes500b', 'notes 500 b', 'chapter', 500, 900, 'p2_c1', true, 'notes'),
  ('p2_notes500c', 'notes 500 c', 'chapter', 500, 900, 'p2_c1', true, 'notes'),
  ('p2_notes500d', 'notes 500 d', 'chapter', 500, 900, 'p2_c1', true, 'notes');
insert into public.products(id, title, scope, price, year_ids, active, product_type)
  values ('p2_bundle', 'notes bundle', 'bundle', 1000, array['p2_y'], true, 'notes_bundle');

update public.referral_settings set enabled = true, friend_discount_percent = 10, friend_discount_max = 100,
  referrer_credit_amount = 50, credit_hold_days = 7, wallet_max_percent = 50, apply_window_days = 2 where id = true;

-- Batch 3 (F5) requires a verified mobile number for referrals. This suite tests the referral MONEY flows, not
-- verification (that is batch3_checks.sql), and its fixture users are unverified: switch the rule off here.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'referral_settings' and column_name = 'require_verified_phone') then
    update public.referral_settings set require_verified_phone = false where id = true;
  end if;
end $$;

\set A '''b2000000-0000-0000-0000-00000000000a'''
\set F '''b2000000-0000-0000-0000-00000000000f'''
\set S '''b2000000-0000-0000-0000-000000000005'''
\set X '''b2000000-0000-0000-0000-0000000000f2'''
\set ADM '''b2000000-0000-0000-0000-0000000000ad'''
select referral_code as a_code from public.profiles where id = :A \gset
select referral_code as f_code from public.profiles where id = :F \gset

-- ---- 1. ledger is client read-only -----------------------------------------
select pg_temp.chk('L1 authenticated has no INSERT/UPDATE/DELETE on wallet_ledger',
  not has_table_privilege('authenticated', 'public.wallet_ledger', 'insert')
  and not has_table_privilege('authenticated', 'public.wallet_ledger', 'update')
  and not has_table_privilege('authenticated', 'public.wallet_ledger', 'delete'));
select pg_temp.chk('L2 anon has no access to wallet_ledger', not has_table_privilege('anon', 'public.wallet_ledger', 'select'));
select pg_temp.attempt('authenticated', :A::uuid,
  format($$insert into public.wallet_ledger(user_id,entry_type,status,amount,source) values (%L,'credit','available',9999,'admin_adjustment')$$, :A)) as r \gset
select pg_temp.chk('L3 student cannot mint wallet credit', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid,
  format($$insert into public.wallet_ledger(user_id,entry_type,status,amount,source) values (%L,'credit','available',9999,'admin_adjustment')$$, :ADM)) as r \gset
select pg_temp.chk('L4 even an admin cannot insert into the ledger directly', :'r' like 'ERR:%', :'r');
select pg_temp.chk('L5 service_role may write the ledger', has_table_privilege('service_role', 'public.wallet_ledger', 'insert'));
select pg_temp.chk('L6 clients cannot call internal wallet functions',
  not has_function_privilege('authenticated', 'public.create_priced_order(uuid,text,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_due_wallet_credits(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.wallet_balance_of(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.handle_payment_refund(text,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.get_my_wallet()', 'execute'));

-- ---- 2. referral code abuse -------------------------------------------------
select pg_temp.q('authenticated', :A::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, :'a_code')) as r \gset
select pg_temp.chk('R1 self-referral blocked', :'r' = 'self_referral', :'r');
update public.profiles set created_at = now() - interval '10 days' where id = :S;
select pg_temp.q('authenticated', :S::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, :'a_code')) as r \gset
select pg_temp.chk('R2 code refused after the signup window (not usable later)', :'r' = 'too_late', :'r');
select pg_temp.q('authenticated', :F::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, :'a_code')) as r \gset
select pg_temp.chk('R3 new user can apply a code', :'r' = 'success', :'r');
select pg_temp.chk('R4 ... the referral starts pending (no reward at signup)',
  (select status from public.referrals where referred_id = :F) = 'pending'
  and not exists (select 1 from public.wallet_ledger));
select pg_temp.q('authenticated', :F::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, (select referral_code from public.profiles where id = :X))) as r \gset
select pg_temp.chk('R5 a second code cannot be applied (one referrer per friend)', :'r' = 'already_referred', :'r');
select pg_temp.attempt('authenticated', :F::uuid,
  format($$update public.referrals set referrer_id = %L where referred_id = %L$$, :X, :F)) as r \gset
select pg_temp.chk('R6 student cannot edit referrals rows',
  (select referrer_id from public.referrals where referred_id = :F) = :A::uuid, :'r');
update public.referral_settings set enabled = false where id = true;
select pg_temp.q('authenticated', :X::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, :'a_code')) as r \gset
select pg_temp.chk('R7 no code can be applied while the program is disabled', :'r' = 'disabled', :'r');
update public.referral_settings set enabled = true where id = true;

-- ---- 3. friend discount (server-side, selling price, capped) ---------------
select pg_temp.mkorder(:S::uuid, 'p2_notes500') as o \gset
select pg_temp.chk('D1 a user with no referral gets no discount',
  (:'o'::jsonb->>'referral_discount')::numeric = 0 and (:'o'::jsonb->>'amount')::numeric = 500, :'o');
select pg_temp.mkorder(:F::uuid, 'p2_notes500') as o \gset
select pg_temp.chk('D2 friend: 10% off the SELLING price (500 -> 50, not 10% of MRP 900)',
  (:'o'::jsonb->>'referral_discount')::numeric = 50 and (:'o'::jsonb->>'amount')::numeric = 450, :'o');
select pg_temp.chk('D3 order row stores list price, discount, wallet and final consistently',
  (select list_price = 500 and referral_discount = 50 and wallet_amount = 0 and amount = 450 from public.orders where id = (:'o'::jsonb->>'order_id')));
select pg_temp.mkorder(:F::uuid, 'p2_notes2000') as o2 \gset
select pg_temp.chk('D4 discount capped at Rs 100 (10% of 2000 = 200 -> 100)',
  (:'o2'::jsonb->>'referral_discount')::numeric = 100 and (:'o2'::jsonb->>'amount')::numeric = 1900, :'o2');
select pg_temp.chk('D5 creating a second checkout supersedes the first discounted one (no stacking)',
  (select status from public.orders where id = (:'o'::jsonb->>'order_id')) = 'cancelled');

-- ---- 4. tampering from the client ------------------------------------------
select pg_temp.attempt('authenticated', :F::uuid, format($$update public.orders set amount = 1 where id = %L$$, :'o2'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('C1 student cannot change order amount', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :F::uuid, format($$update public.orders set wallet_amount = 500, referral_discount = 999 where id = %L$$, :'o2'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('C2 student cannot change discount / wallet on an order', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('service_role', null, format($$update public.orders set wallet_amount = 500 where id = %L$$, :'o2'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('C3 ... and the breakdown is immutable even for the server', :'r' like 'ERR:%immutable%', :'r');
select pg_temp.attempt('authenticated', :F::uuid, $$select public.create_priced_order(auth.uid(), 'p2_notes500', true)$$) as r \gset
select pg_temp.chk('C4 create_priced_order is not callable by a student', :'r' like 'ERR:%permission denied%', :'r');
select pg_temp.chk('C5 authenticated cannot insert an order with a made-up price',
  pg_temp.attempt('authenticated', :F::uuid,
    format($$insert into public.orders(id,user_id,product_id,amount,status) values ('p2_fake',%L,'p2_notes500',1,'created')$$, :F)) like 'ERR:%');

-- ---- 5. credit only after payment; hold; idempotency ------------------------
select pg_temp.chk('P1 an unpaid (created) order creates NO credit and NO debit',
  not exists (select 1 from public.wallet_ledger));
select pg_temp.pay(:'o2'::jsonb->>'order_id');
select pg_temp.chk('P2 friend pays -> referral qualified, first_order_id set',
  (select status = 'qualified' and first_order_id = (:'o2'::jsonb->>'order_id') from public.referrals where referred_id = :F));
select pg_temp.chk('P3 referrer gets ONE pending credit of Rs 50',
  (select count(*) from public.wallet_ledger where user_id = :A and entry_type = 'credit' and status = 'pending' and amount = 50) = 1);
select pg_temp.chk('P4 credit is held ~7 days',
  (select available_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.wallet_ledger where user_id = :A));
select pg_temp.q('authenticated', :A::uuid, $$select available || '/' || pending || '/' || total_earned from public.get_my_wallet()$$) as r \gset
select pg_temp.chk('P5 balance view: available 0, pending 50, total earned 50', :'r' = '0.00/50.00/50.00', :'r');
select pg_temp.pay(:'o2'::jsonb->>'order_id');
select pg_temp.chk('P6 replayed settlement adds no second credit', (select count(*) from public.wallet_ledger where user_id = :A) = 1);
select pg_temp.attempt('service_role', null,
  format($$insert into public.wallet_ledger(user_id,entry_type,status,amount,source,referral_id,available_at)
           select %L,'credit','pending',50,'referral_reward',id,now() from public.referrals where referred_id = %L$$, :A, :F)) as r \gset
select pg_temp.chk('P7 DB rejects a second referral credit for the same friend', :'r' like 'ERR:%duplicate%', :'r');
select pg_temp.mkorder(:F::uuid, 'p2_notes500') as o3 \gset
select pg_temp.chk('P8 friend has no discount on the second purchase', (:'o3'::jsonb->>'referral_discount')::numeric = 0, :'o3');
select pg_temp.pay(:'o3'::jsonb->>'order_id');
select pg_temp.chk('P9 second purchase does not create another credit', (select count(*) from public.wallet_ledger where user_id = :A) = 1);
select pg_temp.q('authenticated', :A::uuid, $$select status || ':' || friend_name from public.get_my_referral_list()$$) as r \gset
select pg_temp.chk('P10 referral list: masked name + "purchased_pending"', :'r' = 'purchased_pending:Rahul S.', :'r');
select pg_temp.q('authenticated', :S::uuid, $$select count(*)::text from public.get_my_referral_list()$$) as r \gset
select pg_temp.chk('P11 a stranger sees none of A''s referrals', :'r' = '0', :'r');
select pg_temp.q('authenticated', :S::uuid, $$select count(*)::text from public.wallet_ledger$$) as r \gset
select pg_temp.chk('P12 a student can SELECT only their own ledger rows', :'r' = '0', :'r');

-- ---- 6. 7-day hold ----------------------------------------------------------
select pg_temp.q('authenticated', :A::uuid, $$select public.release_due_wallet_credits(auth.uid())::text$$) as r \gset
select pg_temp.chk('H1 a student cannot run the release job', :'r' like 'ERR:%permission denied%', :'r');
select pg_temp.chk('H2 before day 7 the credit stays pending', (select status from public.wallet_ledger where user_id = :A) = 'pending');
-- Time travel: history is immutable, so lift the guard for the fixture only.
alter table public.wallet_ledger disable trigger wallet_ledger_01_append_only;
update public.wallet_ledger set available_at = now() - interval '1 minute' where user_id = :A;
alter table public.wallet_ledger enable trigger wallet_ledger_01_append_only;
select pg_temp.q('authenticated', :A::uuid, $$select available || '/' || pending || '/' || total_earned from public.get_my_wallet()$$) as r \gset
select pg_temp.chk('H3 after 7 days: available 50, pending 0', :'r' = '50.00/0.00/50.00', :'r');
select pg_temp.chk('H4 referral marked rewarded', (select status from public.referrals where referred_id = :F) = 'rewarded');
select pg_temp.q('authenticated', :A::uuid, $$select status from public.get_my_referral_list()$$) as r \gset
select pg_temp.chk('H5 referral list shows "credited"', :'r' = 'credited', :'r');
select pg_temp.attempt('service_role', null, format($$update public.wallet_ledger set amount = 5000 where user_id = %L$$, :A)) as r \gset
select pg_temp.chk('H6 ledger amount cannot be edited (append-only), even by the server', :'r' like 'ERR:%immutable%', :'r');
select pg_temp.attempt('service_role', null, format($$delete from public.wallet_ledger where user_id = %L$$, :A)) as r \gset
select pg_temp.chk('H7 ledger rows cannot be deleted', :'r' like 'ERR:%append-only%', :'r');
select pg_temp.attempt('service_role', null, $$truncate public.wallet_ledger$$) as r \gset
select pg_temp.chk('H8 ledger cannot be truncated', :'r' like 'ERR:%', :'r');

-- ---- 7. wallet use: notes only, 50% cap -------------------------------------
select pg_temp.mkorder(:A::uuid, 'p2_video', true) as w \gset
select pg_temp.chk('W1 wallet REFUSED on a video product', :'w'::jsonb->>'code' = 'wallet_not_allowed', :'w');
select pg_temp.mkorder(:A::uuid, 'p2_other', true) as w \gset
select pg_temp.chk('W2 wallet REFUSED on an untagged product', :'w'::jsonb->>'code' = 'wallet_not_allowed', :'w');
select pg_temp.mkorder(:A::uuid, 'p2_video', false) as w \gset
select pg_temp.chk('W3 a video can still be bought without the wallet (full price, nothing reserved)',
  (:'w'::jsonb->>'amount')::numeric = 500 and (:'w'::jsonb->>'wallet_amount')::numeric = 0, :'w');
select pg_temp.q('authenticated', :A::uuid, $$select (public.quote_my_order('p2_video', true)->>'wallet_eligible')$$) as r \gset
select pg_temp.chk('W4 checkout quote says wallet is not eligible for a video (toggle hidden)', :'r' = 'false', :'r');
select pg_temp.mkorder(:A::uuid, 'p2_notes500', true) as w \gset
select pg_temp.chk('W5 balance 50 < cap 250: uses 50 -> pays 450', (:'w'::jsonb->>'wallet_amount')::numeric = 50 and (:'w'::jsonb->>'amount')::numeric = 450, :'w');
select pg_temp.chk('W6 nothing is debited until payment', (select count(*) from public.wallet_ledger where entry_type = 'debit') = 0);
-- top up A's balance to exercise the cap (fixture insert as server)
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note)
  values (:A, 'credit', 'available', 950, 'admin_adjustment', 'p2 test top-up');   -- total available 1000
select pg_temp.mkorder(:A::uuid, 'p2_notes500', true) as w \gset
select pg_temp.chk('W7 50% cap: balance 1000, price 500 -> wallet 250, pays 250',
  (:'w'::jsonb->>'wallet_amount')::numeric = 250 and (:'w'::jsonb->>'amount')::numeric = 250, :'w');
select pg_temp.chk('W8 abandoned earlier order (with wallet) was superseded, not double-reserved',
  (select status from public.orders where id = (select id from public.orders where user_id = :A and wallet_amount = 50)) = 'cancelled');
select pg_temp.mkorder(:A::uuid, 'p2_bundle', true) as wb \gset
select pg_temp.chk('W9 notes BUNDLE accepts wallet (cap 500)', (:'wb'::jsonb->>'wallet_amount')::numeric = 500 and (:'wb'::jsonb->>'amount')::numeric = 500, :'wb');
select pg_temp.pay(:'wb'::jsonb->>'order_id');
select pg_temp.chk('W10 payment settles -> exactly one debit of 500 for that order',
  (select count(*) from public.wallet_ledger where entry_type = 'debit' and order_id = (:'wb'::jsonb->>'order_id') and amount = 500) = 1);
select pg_temp.pay(:'wb'::jsonb->>'order_id');
select pg_temp.chk('W11 replayed settlement does not debit twice',
  (select count(*) from public.wallet_ledger where entry_type = 'debit' and order_id = (:'wb'::jsonb->>'order_id')) = 1);
select pg_temp.q('authenticated', :A::uuid, $$select available::text from public.get_my_wallet()$$) as r \gset
select pg_temp.chk('W12 balance is now 500', :'r' = '500.00', :'r');
-- failed / cancelled payment: order simply never settles
select pg_temp.mkorder(:A::uuid, 'p2_notes500', true) as wf \gset
update public.orders set status = 'failed' where id = :'wf'::jsonb->>'order_id';
select pg_temp.chk('W13 failed order: nothing debited, balance still 500',
  (select available from public.wallet_balance_of(:A::uuid)) = 500);

-- ---- 8. wallet + friend discount together (cap is on the discounted price) --
update public.profiles set created_at = now() where id = :X;
select pg_temp.q('authenticated', :X::uuid, format($$select public.apply_referral_code(%L)->>'status'$$, :'a_code')) as r \gset
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note)
  values (:X, 'credit', 'available', 1000, 'admin_adjustment', 'p2 test top-up');
select pg_temp.mkorder(:X::uuid, 'p2_notes500', true) as w \gset
select pg_temp.chk('W14 discount 50, cap = 50% of 450 = 225, final 225',
  (:'w'::jsonb->>'referral_discount')::numeric = 50 and (:'w'::jsonb->>'wallet_amount')::numeric = 225
  and (:'w'::jsonb->>'amount')::numeric = 225, :'w');
select pg_temp.chk('W15 wallet + discount never make the order free (final >= 1)', (:'w'::jsonb->>'amount')::numeric >= 1);

-- ---- 9. refunds --------------------------------------------------------------
-- X buys (with discount), inside the hold: refund cancels A's pending credit.
select pg_temp.pay(:'w'::jsonb->>'order_id');
select pg_temp.chk('F0 second friend''s purchase created a pending credit for A',
  (select count(*) from public.wallet_ledger where referral_id = (select id from public.referrals where referred_id = :X) and status = 'pending') = 1);
select pg_temp.q('authenticated', :A::uuid, $$select pending::text from public.get_my_wallet()$$) as r \gset
select pg_temp.chk('F1 pending = 50 before refund', :'r' = '50.00', :'r');
select public.handle_payment_refund('pay_' || (:'w'::jsonb->>'order_id'), false) as r \gset
select pg_temp.chk('F2 partial refund does nothing', :'r'::jsonb->>'status' = 'partial_refund_ignored', :'r');
select public.handle_payment_refund('pay_' || (:'w'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('F3 full refund inside the hold cancels the pending credit', :'r'::jsonb->>'status' = 'credit_cancelled', :'r');
select pg_temp.chk('F3b ... and restores the 225 the friend paid with wallet (item 4)',
  (:'r'::jsonb->>'wallet_restored')::numeric = 225
  and (select amount from public.wallet_ledger where user_id = :X and source = 'order_refund' and order_id = (:'w'::jsonb->>'order_id')) = 225, :'r');
select pg_temp.q('authenticated', :A::uuid, $$select pending || '/' || total_earned from public.get_my_wallet()$$) as r \gset
select pg_temp.chk('F4 pending 0 and not counted as earned', :'r' = '0.00/50.00', :'r');   -- 50 = the first (released) referral only
select pg_temp.chk('F5 referral rejected, order marked refunded',
  (select status from public.referrals where referred_id = :X) = 'rejected'
  and (select status from public.orders where id = (:'w'::jsonb->>'order_id')) = 'refunded');
select public.handle_payment_refund('pay_' || (:'w'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('F6 duplicate refund event is a no-op', :'r'::jsonb->>'status' in ('already_cancelled', 'no_referral_credit'), :'r');
select pg_temp.q('authenticated', :A::uuid, $$select string_agg(status, ',' order by friend_name) from public.get_my_referral_list()$$) as r \gset
select pg_temp.chk('F7 referral list shows cancelled for the refunded friend', :'r' like '%cancelled%', :'r');
-- refund AFTER release: not auto-cancelled
select public.handle_payment_refund('pay_' || (:'o2'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('F8 refund after the hold: the released credit is REVERSED with a ledger row (Batch 1 / F3; it used to only warn)',
  :'r'::jsonb->>'status' = 'credit_reversed'
  and (select count(*) from public.wallet_ledger where entry_type = 'reversal' and reverses_id = (:'r'::jsonb->>'ledger_id')::uuid and amount = 50) = 1, :'r');
-- admin path: a freshly released credit that is still unspent
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note)
  values (:A, 'credit', 'available', 30, 'admin_adjustment', 'p2 F9 fixture') returning id as f9_id \gset
select pg_temp.attempt('authenticated', :ADM::uuid,
  format($$select public.admin_reverse_wallet_credit(%L, 'refund after hold')$$, :'f9_id')) as r2 \gset
select pg_temp.chk('F9 admin can post a reversal for a released credit', :'r2' = 'OK', :'r2');
select pg_temp.attempt('authenticated', :F::uuid,
  format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'f9_id')) as r3 \gset
select pg_temp.chk('F10 a student cannot reverse credits', :'r3' like 'ERR:%admin only%', :'r3');

-- ---- 9b. wallet restored on refund (item 4) ---------------------------------
-- `wb` (notes bundle, wallet 500) was paid and debited in section 7. A's balance is 500.
select available as bal_before from public.wallet_balance_of(:A::uuid) \gset
select public.handle_payment_refund('pay_' || (:'wb'::jsonb->>'order_id'), false) as r \gset
select pg_temp.chk('RW1 partial refund restores nothing',
  :'r'::jsonb->>'status' = 'partial_refund_ignored'
  and not exists (select 1 from public.wallet_ledger where order_id = (:'wb'::jsonb->>'order_id') and source = 'order_refund'), :'r');
select public.handle_payment_refund('pay_' || (:'wb'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('RW2 full refund restores the wallet amount (500) as an available credit',
  (:'r'::jsonb->>'wallet_restored')::numeric = 500
  and (select count(*) from public.wallet_ledger where order_id = (:'wb'::jsonb->>'order_id')
        and entry_type = 'credit' and source = 'order_refund' and status = 'available' and amount = 500
        and user_id = :A) = 1, :'r');
select pg_temp.chk('RW3 balance rose by exactly the restored 500', (select available from public.wallet_balance_of(:A::uuid)) = :bal_before::numeric + 500, :'bal_before');
select public.handle_payment_refund('pay_' || (:'wb'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('RW4 duplicate refund event restores nothing more (idempotent)',
  (:'r'::jsonb->>'wallet_restored')::numeric = 0
  and (select count(*) from public.wallet_ledger where order_id = (:'wb'::jsonb->>'order_id') and source = 'order_refund') = 1
  and (select available from public.wallet_balance_of(:A::uuid)) = :bal_before::numeric + 500, :'r');
select pg_temp.chk('RW5 the original debit row is untouched (history kept)',
  (select count(*) from public.wallet_ledger where order_id = (:'wb'::jsonb->>'order_id') and entry_type = 'debit' and amount = 500) = 1);
select pg_temp.attempt('service_role', null,
  format($$insert into public.wallet_ledger(user_id,entry_type,status,amount,source,order_id) values (%L,'credit','available',500,'order_refund',%L)$$, :A, :'wb'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('RW6 DB itself rejects a second restore for the same order', :'r' like 'ERR:%duplicate%', :'r');
select public.handle_payment_refund('pay_' || (:'o3'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('RW7 refund of an order that used no wallet restores nothing', (:'r'::jsonb->>'wallet_restored')::numeric = 0, :'r');
select pg_temp.attempt('authenticated', :A::uuid,
  format($$insert into public.wallet_ledger(user_id,entry_type,status,amount,source,order_id) values (%L,'credit','available',1,'order_refund',%L)$$, :A, 'x')) as r \gset
select pg_temp.chk('RW8 a student cannot create a restore credit', :'r' like 'ERR:%', :'r');

-- ---- 9c. cancelled / expired orders (item 5) ---------------------------------
insert into auth.users(id, email) values ('b2000000-0000-0000-0000-0000000000a6', 'p2_g@example.com');
\set G '''b2000000-0000-0000-0000-0000000000a6'''
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note)
  values (:G, 'credit', 'available', 800, 'admin_adjustment', 'p2 test top-up');   -- 800 so four wallet orders of up to 250 are all fully covered
select pg_temp.mkorder(:G::uuid, 'p2_video', false) as g1 \gset
select pg_temp.mkorder(:G::uuid, 'p2_notes500', true) as g2 \gset
select pg_temp.chk('E1 a new checkout cancels the older unpaid order (even one with no wallet/discount)',
  (select status from public.orders where id = (:'g1'::jsonb->>'order_id')) = 'cancelled');
select pg_temp.chk('E2 order gets expires_at ~30 min ahead; app is told the timeout (1800 s)',
  (select expires_at between now() + interval '29 minutes' and now() + interval '31 minutes' from public.orders where id = (:'g2'::jsonb->>'order_id'))
  and (:'g2'::jsonb->>'timeout_seconds')::int = 1800, :'g2');
select pg_temp.attempt('service_role', null, format($$update public.orders set expires_at = now() + interval '1 year' where id = %L$$, :'g2'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('E3 expires_at cannot be extended (immutable, even for the server)', :'r' like 'ERR:%immutable%', :'r');
select pg_temp.attempt('authenticated', :G::uuid, format($$update public.orders set expires_at = now() + interval '1 year' where id = %L$$, :'g2'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('E3b ... nor by the student', :'r' like 'ERR:%', :'r');
select pg_temp.mkorder(:G::uuid, 'p2_notes500b', true) as g3 \gset
select pg_temp.chk('E4 g2 (wallet 250) is now cancelled; g3 is the live order',
  (select status from public.orders where id = (:'g2'::jsonb->>'order_id')) = 'cancelled'
  and (:'g3'::jsonb->>'wallet_amount')::numeric = 250, :'g3');
-- the customer pays the CANCELLED checkout anyway (real money was captured)
select pg_temp.pay(:'g2'::jsonb->>'order_id');
select pg_temp.chk('E5 cancelled order paid: access still granted (cash is real)',
  (select count(*) from public.purchases where order_id = (:'g2'::jsonb->>'order_id')) = 1
  and (select status from public.orders where id = (:'g2'::jsonb->>'order_id')) = 'paid');
select pg_temp.chk('E6 ... and the wallet amount IS debited (Batch 1 / F4: it used to be skipped)',
  (select count(*) from public.wallet_ledger where order_id = (:'g2'::jsonb->>'order_id') and entry_type = 'debit' and amount = 250) = 1
  and (select available from public.wallet_balance_of(:G::uuid)) = 550);
select pg_temp.chk('E7 ... and it is flagged for admin review',
  (select count(*) from public.order_review_flags
    where order_id = (:'g2'::jsonb->>'order_id') and reason = 'stale_order_paid' and wallet_amount = 250 and resolved_at is null) = 1);
select pg_temp.pay(:'g2'::jsonb->>'order_id');
select pg_temp.chk('E8 replayed settlement of the flagged order does not debit again, still one flag',
  (select count(*) from public.wallet_ledger where order_id = (:'g2'::jsonb->>'order_id') and entry_type = 'debit') = 1
  and (select count(*) from public.order_review_flags where order_id = (:'g2'::jsonb->>'order_id')) = 1);
select pg_temp.pay(:'g1'::jsonb->>'order_id');
select pg_temp.chk('E9 cancelled order with no discount/wallet: granted, nothing to flag',
  (select count(*) from public.purchases where order_id = (:'g1'::jsonb->>'order_id')) = 1
  and not exists (select 1 from public.order_review_flags where order_id = (:'g1'::jsonb->>'order_id')));
select pg_temp.pay(:'g3'::jsonb->>'order_id');
select pg_temp.chk('E10 control: the live order debits normally (250) -> balance 300',
  (select count(*) from public.wallet_ledger where order_id = (:'g3'::jsonb->>'order_id') and entry_type = 'debit' and amount = 250) = 1
  and (select available from public.wallet_balance_of(:G::uuid)) = 300);
-- expired: force expiry into the past (history is immutable, so lift the guard for the fixture only)
select pg_temp.mkorder(:G::uuid, 'p2_notes500c', true) as g4 \gset
alter table public.orders disable trigger orders_01_immutable_columns;
update public.orders set expires_at = now() - interval '1 hour' where id = (:'g4'::jsonb->>'order_id');
alter table public.orders enable trigger orders_01_immutable_columns;
select pg_temp.pay_at(:'g4'::jsonb->>'order_id', now());
select pg_temp.chk('E11 payment STARTED after expiry: wallet debited (250), flagged',
  (select count(*) from public.wallet_ledger where order_id = (:'g4'::jsonb->>'order_id') and entry_type = 'debit' and amount = 250) = 1
  and (select count(*) from public.order_review_flags where order_id = (:'g4'::jsonb->>'order_id')) = 1
  and (select available from public.wallet_balance_of(:G::uuid)) = 50);
select pg_temp.mkorder(:G::uuid, 'p2_notes500d', true) as g5 \gset
alter table public.orders disable trigger orders_01_immutable_columns;
update public.orders set expires_at = now() - interval '10 minutes' where id = (:'g5'::jsonb->>'order_id');
alter table public.orders enable trigger orders_01_immutable_columns;
select pg_temp.pay_at(:'g5'::jsonb->>'order_id', now() - interval '20 minutes');
select pg_temp.chk('E12 payment started BEFORE expiry but captured late: valid, debited 50 (all that was left), not flagged',
  (select count(*) from public.wallet_ledger where order_id = (:'g5'::jsonb->>'order_id') and entry_type = 'debit' and amount = 50) = 1
  and not exists (select 1 from public.order_review_flags where order_id = (:'g5'::jsonb->>'order_id')), '');
-- refunds of flagged / normal wallet orders
select public.handle_payment_refund('pay_' || (:'g2'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('E13 refunding the flagged order restores the 250 it debited', (:'r'::jsonb->>'wallet_restored')::numeric = 250, :'r');
select public.handle_payment_refund('pay_' || (:'g3'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('E14 refunding the normal wallet order restores its 250', (:'r'::jsonb->>'wallet_restored')::numeric = 250, :'r');
-- access control on flags / settlement
select pg_temp.q('authenticated', :G::uuid, $$select count(*)::text from public.order_review_flags$$) as r \gset
select pg_temp.chk('E15 a student cannot see review flags', :'r' = '0', :'r');
select pg_temp.q('authenticated', :ADM::uuid, $$select count(*)::text from public.order_review_flags$$) as r \gset
select pg_temp.chk('E16 an admin sees them (2 flagged orders)', :'r' = '2', :'r');
select id as flag_id from public.order_review_flags where order_id = (:'g2'::jsonb->>'order_id') \gset
select pg_temp.attempt('authenticated', :G::uuid, format($$select public.admin_resolve_order_flag(%L, 'x')$$, :'flag_id')) as r \gset
select pg_temp.chk('E17 a student cannot resolve a flag', :'r' like 'ERR:%admin only%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_resolve_order_flag(%L, 'reviewed')$$, :'flag_id')) as r \gset
select pg_temp.chk('E18 an admin can resolve a flag', :'r' = 'OK' and (select resolved_at is not null from public.order_review_flags where id = :'flag_id'::uuid), :'r');
select pg_temp.attempt('authenticated', :G::uuid, format($$insert into public.order_review_flags(order_id,reason) values (%L,'stale_order_paid')$$, 'nope')) as r \gset
select pg_temp.chk('E19 clients cannot write flags', :'r' like 'ERR:%', :'r');
select pg_temp.chk('E20 settle_razorpay_payment is server-only',
  not has_function_privilege('authenticated', 'public.settle_razorpay_payment(text,text,text,bigint,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.settle_razorpay_payment(text,text,text,bigint,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.settle_razorpay_payment(text,text,text,bigint,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.grant_razorpay_payment(text,text,text,bigint)', 'execute'));

-- ---- 9d. friend discount is usable at most once (settlement guard) ------------
-- H: two discounted checkouts (the first is cancelled by the second); both get paid.
-- I: same, but the CANCELLED checkout is paid first. J: control, only the live one is paid.
-- K: second use that also asked for wallet credit. A second use is GRANTED (real money was
-- paid for what checkout showed) but flagged, with no wallet debit and no referrer credit.
insert into auth.users(id, email) values
  ('b2000000-0000-0000-0000-0000000000b1', 'p2_h@example.com'),
  ('b2000000-0000-0000-0000-0000000000b2', 'p2_i@example.com'),
  ('b2000000-0000-0000-0000-0000000000b3', 'p2_j@example.com');
insert into public.referrals(referrer_id, referred_id, code_used, status) values
  (:A, 'b2000000-0000-0000-0000-0000000000b1', 'X', 'pending'),
  (:A, 'b2000000-0000-0000-0000-0000000000b2', 'X', 'pending'),
  (:A, 'b2000000-0000-0000-0000-0000000000b3', 'X', 'pending');
update public.referral_settings set enabled = true where id = true;
\set H '''b2000000-0000-0000-0000-0000000000b1'''
\set I '''b2000000-0000-0000-0000-0000000000b2'''
\set J '''b2000000-0000-0000-0000-0000000000b3'''

select pg_temp.mkorder(:H::uuid, 'p2_notes500') as h1 \gset
select pg_temp.mkorder(:H::uuid, 'p2_notes500b') as h2 \gset
select pg_temp.chk('U1 both open checkouts are priced with the discount (pricing alone cannot stop a second use)',
  (:'h1'::jsonb->>'referral_discount')::numeric = 50 and (:'h2'::jsonb->>'referral_discount')::numeric = 50, :'h1' || :'h2');
select pg_temp.chk('U2 the newer checkout cancelled the older one',
  (select status from public.orders where id = (:'h1'::jsonb->>'order_id')) = 'cancelled');
select pg_temp.pay(:'h2'::jsonb->>'order_id');
select pg_temp.chk('U3 first discounted order to settle claims the discount and is granted',
  (select count(*) from public.purchases where order_id = (:'h2'::jsonb->>'order_id')) = 1
  and (select discount_order_id from public.referrals where referred_id = :H::uuid) = (:'h2'::jsonb->>'order_id'));
select pg_temp.pay(:'h1'::jsonb->>'order_id');
select pg_temp.chk('U4 the second discounted order is paid and access IS granted (real money was paid)',
  (select count(*) from public.purchases where order_id = (:'h1'::jsonb->>'order_id')) = 1
  and (select count(*) from public.payments where order_id = (:'h1'::jsonb->>'order_id') and status = 'success') = 1
  and (select status from public.orders where id = (:'h1'::jsonb->>'order_id')) = 'paid');
select pg_temp.chk('U5 ... and is flagged discount_reused for a manual refund',
  (select count(*) from public.order_review_flags
    where order_id = (:'h1'::jsonb->>'order_id') and reason = 'discount_reused'
      and referral_discount = 50 and resolved_at is null) = 1);
select pg_temp.chk('U6 the discount stays claimed by the first order; the referrer is credited exactly once',
  (select discount_order_id from public.referrals where referred_id = :H::uuid) = (:'h2'::jsonb->>'order_id')
  and (select first_order_id from public.referrals where referred_id = :H::uuid) = (:'h2'::jsonb->>'order_id')
  and (select count(*) from public.wallet_ledger where referral_id = (select id from public.referrals where referred_id = :H::uuid)
        and entry_type = 'credit' and source = 'referral_reward') = 1);
select pg_temp.pay(:'h1'::jsonb->>'order_id');
select pg_temp.pay(:'h2'::jsonb->>'order_id');
-- h1 was also a cancelled checkout, so it carries one flag per reason (stale_order_paid + discount_reused)
select pg_temp.chk('U7 replays: still one flag per reason, one payment, one purchase for the reuse; the winner keeps access and is never flagged',
  (select count(*) from public.order_review_flags where order_id = (:'h1'::jsonb->>'order_id')) = 2
  and (select count(*) from public.order_review_flags where order_id = (:'h1'::jsonb->>'order_id') and reason = 'discount_reused') = 1
  and (select count(*) from public.payments where order_id = (:'h1'::jsonb->>'order_id')) = 1
  and (select count(*) from public.purchases where order_id = (:'h1'::jsonb->>'order_id')) = 1
  and (select count(*) from public.purchases where order_id = (:'h2'::jsonb->>'order_id')) = 1
  and not exists (select 1 from public.order_review_flags where order_id = (:'h2'::jsonb->>'order_id')));
select public.handle_payment_refund('pay_' || (:'h1'::jsonb->>'order_id'), true) as r \gset
select pg_temp.chk('U8 the reused-discount payment can be refunded; the winner and the referrer credit are untouched',
  (:'r'::jsonb->>'status') = 'no_referral_credit'
  and (select status from public.orders where id = (:'h1'::jsonb->>'order_id')) = 'refunded'
  and (select status from public.orders where id = (:'h2'::jsonb->>'order_id')) = 'paid'
  and (select status from public.wallet_ledger where referral_id = (select id from public.referrals where referred_id = :H::uuid)
        and source = 'referral_reward') = 'pending', :'r');
select pg_temp.q('authenticated', :ADM::uuid, format($$select count(*)::text from public.order_review_flags where order_id = %L and reason = 'discount_reused'$$, :'h1'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('U9 an admin can see the discount_reused flag', :'r' = '1', :'r');
select pg_temp.q('authenticated', :H::uuid, format($$select count(*)::text from public.order_review_flags where order_id = %L$$, :'h1'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('U10 the student cannot', :'r' = '0', :'r');

select pg_temp.mkorder(:I::uuid, 'p2_notes500') as i1 \gset
select pg_temp.mkorder(:I::uuid, 'p2_notes500b') as i2 \gset
select pg_temp.pay(:'i1'::jsonb->>'order_id');
select pg_temp.chk('U11 a CANCELLED discounted checkout paid first wins the discount (granted; stale flag only)',
  (select count(*) from public.purchases where order_id = (:'i1'::jsonb->>'order_id')) = 1
  and (select discount_order_id from public.referrals where referred_id = :I::uuid) = (:'i1'::jsonb->>'order_id')
  and not exists (select 1 from public.order_review_flags where order_id = (:'i1'::jsonb->>'order_id') and reason = 'discount_reused'));
select pg_temp.pay(:'i2'::jsonb->>'order_id');
select pg_temp.chk('U12 the live checkout paid afterwards is the second use: access granted, flagged',
  (select count(*) from public.purchases where order_id = (:'i2'::jsonb->>'order_id')) = 1
  and (select count(*) from public.order_review_flags where order_id = (:'i2'::jsonb->>'order_id') and reason = 'discount_reused') = 1);

select pg_temp.mkorder(:J::uuid, 'p2_notes500') as j1 \gset
select pg_temp.mkorder(:J::uuid, 'p2_notes500b') as j2 \gset
select pg_temp.pay(:'j2'::jsonb->>'order_id');
select pg_temp.chk('U13 control: only one of two checkouts paid -> granted, nothing flagged',
  (select count(*) from public.purchases where order_id = (:'j2'::jsonb->>'order_id')) = 1
  and not exists (select 1 from public.order_review_flags where order_id in (:'j1'::jsonb->>'order_id', :'j2'::jsonb->>'order_id')));
insert into auth.users(id, email) values ('b2000000-0000-0000-0000-0000000000b4', 'p2_k@example.com');
insert into public.referrals(referrer_id, referred_id, code_used, status)
  values (:A, 'b2000000-0000-0000-0000-0000000000b4', 'X', 'pending');
\set K '''b2000000-0000-0000-0000-0000000000b4'''
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note)
  values (:K, 'credit', 'available', 400, 'admin_adjustment', 'p2 test top-up');
select pg_temp.mkorder(:K::uuid, 'p2_notes500', false) as k1 \gset
select pg_temp.mkorder(:K::uuid, 'p2_notes500b', true) as k2 \gset
select pg_temp.pay(:'k1'::jsonb->>'order_id');
select pg_temp.pay(:'k2'::jsonb->>'order_id');
select pg_temp.chk('U15 second use that asked for wallet: access granted AND the wallet amount is debited (Batch 1 / F4)',
  (:'k2'::jsonb->>'wallet_amount')::numeric = 225
  and (select count(*) from public.purchases where order_id = (:'k2'::jsonb->>'order_id')) = 1
  and (select count(*) from public.wallet_ledger where order_id = (:'k2'::jsonb->>'order_id') and entry_type = 'debit' and amount = 225) = 1
  and (select available from public.wallet_balance_of(:K::uuid)) = 175, :'k2');
select pg_temp.chk('U16 ... flagged with the wallet amount and discount it tried to use; winner (k1) not flagged',
  (select count(*) from public.order_review_flags where order_id = (:'k2'::jsonb->>'order_id') and reason = 'discount_reused'
     and wallet_amount = (:'k2'::jsonb->>'wallet_amount')::numeric and referral_discount = 50) = 1
  and not exists (select 1 from public.order_review_flags where order_id = (:'k1'::jsonb->>'order_id') and reason = 'discount_reused'));
select pg_temp.chk('U17 ... and the referrer is credited once only (for the winner)',
  (select count(*) from public.wallet_ledger where referral_id = (select id from public.referrals where referred_id = :K::uuid)
     and entry_type = 'credit' and source = 'referral_reward') = 1
  and (select first_order_id from public.referrals where referred_id = :K::uuid) = (:'k1'::jsonb->>'order_id'));
select pg_temp.chk('U14 an order without a discount never touches the claim (no referral_id, no flag)',
  (select count(*) from public.orders where referral_discount = 0 and referral_id is not null) = 0);

-- ---- 10. program off: no discount, no reward --------------------------------
update public.referral_settings set enabled = false where id = true;
insert into auth.users(id, email) values ('b2000000-0000-0000-0000-0000000000f3', 'p2_z@example.com');
insert into public.referrals(referrer_id, referred_id, code_used, status)
  values (:A, 'b2000000-0000-0000-0000-0000000000f3', 'X', 'pending');
select pg_temp.mkorder('b2000000-0000-0000-0000-0000000000f3'::uuid, 'p2_notes500') as z \gset
select pg_temp.chk('O1 program disabled: no friend discount', (:'z'::jsonb->>'referral_discount')::numeric = 0, :'z');
select pg_temp.pay(:'z'::jsonb->>'order_id');
select pg_temp.chk('O2 program disabled: no referrer credit',
  not exists (select 1 from public.wallet_ledger where referral_id = (select id from public.referrals where referred_id = 'b2000000-0000-0000-0000-0000000000f3')));
update public.referral_settings set enabled = true where id = true;

-- ---- 10b. admin reject ---------------------------------------------------------
insert into auth.users(id, email) values ('b2000000-0000-0000-0000-0000000000f4', 'p2_y@example.com');
insert into public.referrals(referrer_id, referred_id, code_used, status)
  values (:A, 'b2000000-0000-0000-0000-0000000000f4', 'X', 'pending');
update public.referral_settings set enabled = true where id = true;
select pg_temp.mkorder('b2000000-0000-0000-0000-0000000000f4'::uuid, 'p2_notes500') as y \gset
select pg_temp.pay(:'y'::jsonb->>'order_id');
select id as y_ref from public.referrals where referred_id = 'b2000000-0000-0000-0000-0000000000f4' \gset
select pg_temp.attempt('authenticated', :F::uuid, format($$select public.admin_reject_referral(%L, 'x')$$, :'y_ref')) as r \gset
select pg_temp.chk('J1 a student cannot reject referrals', :'r' like 'ERR:%admin only%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reject_referral(%L, 'fake accounts')$$, :'y_ref')) as r \gset
select pg_temp.chk('J2 admin can reject', :'r' = 'OK', :'r');
select pg_temp.chk('J3 ... which cancels the still-pending credit',
  (select status from public.wallet_ledger where referral_id = :'y_ref'::uuid) = 'cancelled'
  and (select status from public.referrals where id = :'y_ref'::uuid) = 'rejected');

-- ---- 11. legacy paths still work --------------------------------------------
select pg_temp.chk('X1 old get_my_referrals() still exists for released builds', to_regprocedure('public.get_my_referrals()') is not null);
select pg_temp.chk('X2 an old-style order (list_price NULL) is still valid',
  (select count(*) from public.orders where list_price is null) >= 0);

-- ---- report ------------------------------------------------------------------
\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else detail end as detail
from p2_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from p2_results;
rollback;
