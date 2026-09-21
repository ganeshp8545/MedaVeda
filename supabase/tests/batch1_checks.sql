-- ============================================================================
-- Batch 1 checks: F2/F3 refund + dispute, F4 wallet on stale orders, F6 owned
-- product, F9/F10/F14/F15/F16 hygiene.
-- Run AFTER 20260926100000..130000 (and everything before them):
--   psql "$DB_URL" -f supabase/tests/batch1_checks.sql
-- One transaction, ROLLED BACK. Prints PASS/FAIL per check and a final
-- "N FAIL, M PASS" line, which must read "0 FAIL".
-- Run against the state BEFORE Batch 1 it must FAIL (that is the point: every
-- check here fails against the old code). Server steps run as the migration
-- owner; client attacks run as the real `authenticated` / `anon` roles.
-- Every risky call goes through pg_temp.srv()/attempt()/q() so one failing
-- check never aborts the transaction and hides the rest.
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;

create temp table b1_results(name text, ok boolean, detail text);

create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into b1_results values (p_name, coalesce(p_ok, false), p_detail) $$;

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
  return coalesce(res, '<null>');
end $$;

-- Server-side single-value call, as the current (owner) role; never aborts.
create function pg_temp.srv(p_sql text) returns text
language plpgsql as $$
declare res text;
begin execute p_sql into res; return coalesce(res, '<null>');
exception when others then return 'ERR: ' || sqlerrm; end $$;

-- text -> jsonb, NULL when it is not JSON (e.g. 'ERR: ...').
create function pg_temp.j(t text) returns jsonb
language plpgsql as $$ begin return t::jsonb; exception when others then return null; end $$;

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

create function pg_temp.pay(p_order text) returns text
language plpgsql as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order;
  perform public.grant_razorpay_payment('evt_' || p_order, o.razorpay_order_id, 'pay_' || p_order, round(o.amount * 100)::bigint);
  return 'OK';
exception when others then return 'ERR: ' || sqlerrm; end $$;

create function pg_temp.owns(p_uid uuid, p_chapter text) returns text
language sql as $fn$ select pg_temp.q('authenticated', p_uid, format($$select public.user_owns_chapter(%L)::text$$, p_chapter)) $fn$;

\o /dev/null

-- ---- fixtures ---------------------------------------------------------------
insert into auth.users(id, email)
  select ('b3000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'b1_' || n || '@example.com' from generate_series(1, 40) n;
insert into auth.users(id, email) values ('b3000000-0000-0000-0000-000000000063', 'b1_adm@example.com');
insert into public.admins(id, email) values ('b3000000-0000-0000-0000-000000000063', 'b1_adm@example.com');
\set ADM '''b3000000-0000-0000-0000-000000000063'''
\set R '''b3000000-0000-0000-0000-000000000001'''
\set D '''b3000000-0000-0000-0000-000000000002'''
\set A1 '''b3000000-0000-0000-0000-000000000003'''
\set F1 '''b3000000-0000-0000-0000-000000000004'''
\set A2 '''b3000000-0000-0000-0000-000000000005'''
\set F2 '''b3000000-0000-0000-0000-000000000006'''
\set A3 '''b3000000-0000-0000-0000-000000000007'''
\set F3 '''b3000000-0000-0000-0000-000000000008'''
\set A4 '''b3000000-0000-0000-0000-000000000009'''
\set F4 '''b3000000-0000-0000-0000-000000000010'''
\set A5 '''b3000000-0000-0000-0000-000000000011'''
\set F5 '''b3000000-0000-0000-0000-000000000012'''
\set W '''b3000000-0000-0000-0000-000000000013'''
\set A6 '''b3000000-0000-0000-0000-000000000014'''
\set F6 '''b3000000-0000-0000-0000-000000000015'''
\set DU '''b3000000-0000-0000-0000-000000000016'''
\set O '''b3000000-0000-0000-0000-000000000017'''
\set H '''b3000000-0000-0000-0000-000000000018'''
\set Z '''b3000000-0000-0000-0000-000000000019'''
\set A7 '''b3000000-0000-0000-0000-000000000020'''
\set F7 '''b3000000-0000-0000-0000-000000000021'''
\set D2 '''b3000000-0000-0000-0000-000000000022'''

insert into public.years(id, title, course_id) values ('pb_y', 'B1 year', 'bams');
insert into public.subjects(id, title, year_id) values ('pb_s', 'B1 subject', 'pb_y');
insert into public.chapters(id, title, subject_id) select 'pb_c' || n, 'c' || n, 'pb_s' from generate_series(1, 14) n;
insert into public.notes(id, title, pdf_url, chapter_id) values ('pb_note1', 'n1', 'https://x/notes/pb1.pdf', 'pb_c1');
insert into public.products(id, title, scope, price, original_price, chapter_id, active, product_type)
  select 'pb_n' || n, 'notes ' || n, 'chapter', 500, 900, 'pb_c' || n, true, 'notes' from generate_series(1, 13) n;
update public.referral_settings set enabled = true, friend_discount_percent = 10, friend_discount_max = 100,
  referrer_credit_amount = 50, credit_hold_days = 7, wallet_max_percent = 50, apply_window_days = 2 where id = true;

-- Batch 3 (F5) requires a verified mobile number for referrals. This suite tests the referral MONEY flows, not
-- verification (that is batch3_checks.sql), and its fixture users are unverified: switch the rule off here.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'referral_settings' and column_name = 'require_verified_phone') then
    update public.referral_settings set require_verified_phone = false where id = true;
  end if;
end $$;

-- ============================================================================
-- F2  a full refund takes the access back; a partial refund does not
-- ============================================================================
select pg_temp.mkorder(:R::uuid, 'pb_n1') as r1 \gset
select pg_temp.pay(:'r1'::jsonb->>'order_id');
select pg_temp.chk('R1 after paying, the student owns the chapter and the note is readable',
  pg_temp.owns(:R::uuid, 'pb_c1') = 'true' and public.user_can_access_note(:R::uuid, 'pb_note1'));
select pg_temp.srv(format($$select public.handle_payment_refund(%L, false)::text$$, 'pay_' || (:'r1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('R2 PARTIAL refund: ignored, access untouched, purchase still success, order still paid',
  pg_temp.j(:'r')->>'status' = 'partial_refund_ignored'
  and pg_temp.owns(:R::uuid, 'pb_c1') = 'true'
  and (select status from public.purchases where order_id = (:'r1'::jsonb->>'order_id')) = 'success'
  and (select status from public.orders where id = (:'r1'::jsonb->>'order_id')) = 'paid', :'r');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'r1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('R3 FULL refund: purchase becomes refunded, access is gone (chapter and note)',
  (select status from public.purchases where order_id = (:'r1'::jsonb->>'order_id')) = 'refunded'
  and (select status from public.orders where id = (:'r1'::jsonb->>'order_id')) = 'refunded'
  and pg_temp.owns(:R::uuid, 'pb_c1') = 'false'
  and not public.user_can_access_note(:R::uuid, 'pb_note1')
  and (pg_temp.j(:'r')->>'purchases_revoked')::int = 1, :'r');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'r1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('R4 a replayed refund is a no-op', (pg_temp.j(:'r')->>'purchases_revoked')::int = 0
  and (select status from public.purchases where order_id = (:'r1'::jsonb->>'order_id')) = 'refunded', :'r');
select pg_temp.pay(:'r1'::jsonb->>'order_id');
select pg_temp.chk('R5 a LATE replay of the capture event does not flip the refunded order back to paid or give access back',
  (select status from public.orders where id = (:'r1'::jsonb->>'order_id')) = 'refunded'
  and (select status from public.purchases where order_id = (:'r1'::jsonb->>'order_id')) = 'refunded'
  and pg_temp.owns(:R::uuid, 'pb_c1') = 'false');
select pg_temp.mkorder(:R::uuid, 'pb_n1') as r2 \gset
select pg_temp.pay(:'r2'::jsonb->>'order_id');
select pg_temp.chk('R6 a refunded student can buy the product again (a refunded row is not "owned")',
  (:'r2'::jsonb->>'ok')::boolean and pg_temp.owns(:R::uuid, 'pb_c1') = 'true'
  and (select count(*) from public.purchases where user_id = :R and product_id = 'pb_n1' and status = 'success') = 1, :'r2');
select pg_temp.chk('R7 refund/dispute routines are server-only',
  not has_function_privilege('authenticated', 'public.handle_payment_refund(text,boolean)', 'execute')
  and coalesce(to_regprocedure('public.handle_payment_dispute(text,text)') is not null
      and not has_function_privilege('authenticated', 'public.handle_payment_dispute(text,text)', 'execute')
      and not has_function_privilege('anon', 'public.handle_payment_dispute(text,text)', 'execute')
      and has_function_privilege('service_role', 'public.handle_payment_dispute(text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.reverse_payment(text,text,boolean)', 'execute'), false));

-- ============================================================================
-- F2  disputes: open suspends, won restores, lost = reversed
-- ============================================================================
select pg_temp.mkorder(:D::uuid, 'pb_n2') as d1 \gset
select pg_temp.pay(:'d1'::jsonb->>'order_id');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'opened')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D1 dispute opened: access suspended, order and payment untouched',
  (select status from public.purchases where order_id = (:'d1'::jsonb->>'order_id')) = 'disputed'
  and pg_temp.owns(:D::uuid, 'pb_c2') = 'false'
  and (select status from public.orders where id = (:'d1'::jsonb->>'order_id')) = 'paid', :'r');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'opened')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D2 a second "opened" event (under_review / action_required) changes nothing', pg_temp.j(:'r')->>'status' = 'nothing_to_suspend', :'r');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'won')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D3 dispute won: access restored',
  (select status from public.purchases where order_id = (:'d1'::jsonb->>'order_id')) = 'success'
  and pg_temp.owns(:D::uuid, 'pb_c2') = 'true', :'r');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'nonsense')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D4 an unknown outcome is rejected, not guessed', :'r' like 'ERR:%', :'r');
-- lost, with a wallet amount on the order: chargeback, no wallet restore
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note) values (:D2, 'credit', 'available', 300, 'admin_adjustment', 'b1');
select pg_temp.mkorder(:D2::uuid, 'pb_n3', true) as d2o \gset
select pg_temp.pay(:'d2o'::jsonb->>'order_id');
select available as d2_bal from public.wallet_balance_of(:D2::uuid) \gset
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'lost')::text$$, 'pay_' || (:'d2o'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D5 dispute LOST: purchase chargeback, no access, order refunded, wallet NOT given back',
  (select status from public.purchases where order_id = (:'d2o'::jsonb->>'order_id')) = 'chargeback'
  and pg_temp.owns(:D2::uuid, 'pb_c3') = 'false'
  and (select status from public.orders where id = (:'d2o'::jsonb->>'order_id')) = 'refunded'
  and (select available from public.wallet_balance_of(:D2::uuid)) = :d2_bal::numeric, :'r');
-- won after the student re-bought: the old row becomes 'duplicate', nothing errors
-- D owns pb_n2 again (status success), so a new checkout is refused
select pg_temp.mkorder(:D::uuid, 'pb_n2') as d3 \gset
select pg_temp.chk('D6 an owned product cannot be bought while the access is active', :'d3'::jsonb->>'code' = 'already_owned', :'d3');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'opened')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.mkorder(:D::uuid, 'pb_n2') as d4 \gset
select pg_temp.pay(:'d4'::jsonb->>'order_id');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'won')::text$$, 'pay_' || (:'d1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('D7 dispute won after a re-purchase: the old row becomes duplicate (no unique-index failure), access via the new one',
  (select status from public.purchases where order_id = (:'d1'::jsonb->>'order_id')) = 'duplicate'
  and (select status from public.purchases where order_id = (:'d4'::jsonb->>'order_id')) = 'success'
  and pg_temp.owns(:D::uuid, 'pb_c2') = 'true', :'r');

-- ============================================================================
-- F3  the referrer's credit in every state
-- ============================================================================
insert into public.referrals(referrer_id, referred_id, code_used, status) values
  (:A1, :F1, 'X', 'pending'), (:A2, :F2, 'X', 'pending'), (:A3, :F3, 'X', 'pending'),
  (:A4, :F4, 'X', 'pending'), (:A5, :F5, 'X', 'pending'), (:A6, :F6, 'X', 'pending'), (:A7, :F7, 'X', 'pending');
select pg_temp.mkorder(:F1::uuid, 'pb_n4') as c1 \gset
select pg_temp.mkorder(:F2::uuid, 'pb_n4') as c2 \gset
select pg_temp.pay(:'c1'::jsonb->>'order_id');
select pg_temp.pay(:'c2'::jsonb->>'order_id');
select pg_temp.mkorder(:F3::uuid, 'pb_n4') as c3 \gset
select pg_temp.pay(:'c3'::jsonb->>'order_id');
select pg_temp.mkorder(:F4::uuid, 'pb_n4') as c4 \gset
select pg_temp.pay(:'c4'::jsonb->>'order_id');
select pg_temp.chk('C0 four friends paid -> four pending credits',
  (select count(*) from public.wallet_ledger where source = 'referral_reward' and status = 'pending'
     and user_id in (:A1, :A2, :A3, :A4)) = 4);

-- C1: due (available_at passed) but the release job has not run yet -> must be CANCELLED, not "already released"
alter table public.wallet_ledger disable trigger wallet_ledger_01_append_only;
update public.wallet_ledger set available_at = now() - interval '1 minute' where order_id = (:'c1'::jsonb->>'order_id') and source = 'referral_reward';
alter table public.wallet_ledger enable trigger wallet_ledger_01_append_only;
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c1'::jsonb->>'order_id'))) as r \gset
select pg_temp.srv('select public.release_due_wallet_credits(null)::text') as rel \gset
select pg_temp.chk('C1 credit past its hold date but still pending: cancelled on refund, and the release job does NOT release it afterwards',
  pg_temp.j(:'r')->>'status' = 'credit_cancelled'
  and (select status from public.wallet_ledger where order_id = (:'c1'::jsonb->>'order_id') and source = 'referral_reward') = 'cancelled'
  and (select available from public.wallet_balance_of(:A1::uuid)) = 0
  and (select status from public.referrals where referred_id = :F1) = 'rejected', :'r' || ' / ' || :'rel');

-- C2: the friend deleted their account first (referrals row and purchases are gone)
select pg_temp.srv(format($$select public.erase_user_data(%L)::text$$, :F2)) as er \gset
select pg_temp.chk('C2a the friend''s erasure removed the referral row (the situation being tested)',
  not exists (select 1 from public.referrals where referred_id = :F2), :'er');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c2'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('C2 refund after the friend deleted their account STILL cancels the referrer''s credit (found by order id)',
  pg_temp.j(:'r')->>'status' = 'credit_cancelled'
  and (select status from public.wallet_ledger where order_id = (:'c2'::jsonb->>'order_id') and source = 'referral_reward') = 'cancelled'
  and (select pending from public.wallet_balance_of(:A2::uuid)) = 0, :'r');

-- C3: credit already released, unspent -> reversal row for the full amount
alter table public.wallet_ledger disable trigger wallet_ledger_01_append_only;
update public.wallet_ledger set available_at = now() - interval '1 minute' where order_id in (:'c3'::jsonb->>'order_id', :'c4'::jsonb->>'order_id') and source = 'referral_reward';
alter table public.wallet_ledger enable trigger wallet_ledger_01_append_only;
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('C3a both credits are released (available 50 each)',
  (select available from public.wallet_balance_of(:A3::uuid)) = 50 and (select available from public.wallet_balance_of(:A4::uuid)) = 50);
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c3'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('C3 refund after release: a reversal row takes the credit back, balance 0, referral rejected',
  pg_temp.j(:'r')->>'status' = 'credit_reversed'
  and (select count(*) from public.wallet_ledger where entry_type = 'reversal' and user_id = :A3 and amount = 50) = 1
  and (select available from public.wallet_balance_of(:A3::uuid)) = 0
  and (select status from public.referrals where referred_id = :F3) = 'rejected', :'r');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c3'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('C4 replayed refund: no second reversal',
  pg_temp.j(:'r')->>'status' = 'already_reversed'
  and (select count(*) from public.wallet_ledger where entry_type = 'reversal' and user_id = :A3) = 1, :'r');

-- C5: released and PARTLY spent -> reverse only what is left, flag the rest, never negative
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note) values (:A4, 'debit', 'available', 30, 'order_payment', 'b1 spent');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c4'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('C5 partly spent credit: 20 reversed, 30 flagged for review, wallet is exactly 0 and the ledger sum is not negative',
  pg_temp.j(:'r')->>'status' = 'credit_reversed' and (pg_temp.j(:'r')->>'reversed')::numeric = 20
  and (select available from public.wallet_balance_of(:A4::uuid)) = 0
  and (select coalesce(sum(case when entry_type = 'credit' then amount else -amount end), 0)
         from public.wallet_ledger where user_id = :A4 and status = 'available') = 0
  and (select count(*) from public.order_review_flags where order_id = (:'c4'::jsonb->>'order_id')
        and reason = 'referral_credit_unrecovered' and (details->>'unrecovered')::numeric = 30) = 1, :'r');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'c4'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('C6 ... and a replay adds no second reversal or flag',
  (select count(*) from public.wallet_ledger where entry_type = 'reversal' and user_id = :A4) = 1
  and (select count(*) from public.order_review_flags where order_id = (:'c4'::jsonb->>'order_id') and reason = 'referral_credit_unrecovered') = 1, :'r');

-- C7: a credit that belongs to a disputed payment is not released while the dispute is open
select pg_temp.mkorder(:F5::uuid, 'pb_n4') as c5 \gset
select pg_temp.pay(:'c5'::jsonb->>'order_id');
alter table public.wallet_ledger disable trigger wallet_ledger_01_append_only;
update public.wallet_ledger set available_at = now() - interval '1 minute' where order_id = (:'c5'::jsonb->>'order_id') and source = 'referral_reward';
alter table public.wallet_ledger enable trigger wallet_ledger_01_append_only;
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'opened')::text$$, 'pay_' || (:'c5'::jsonb->>'order_id')));
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('C7 open dispute: the referrer credit stays pending', (select status from public.wallet_ledger where order_id = (:'c5'::jsonb->>'order_id') and source = 'referral_reward') = 'pending');
select pg_temp.srv(format($$select public.handle_payment_dispute(%L, 'won')::text$$, 'pay_' || (:'c5'::jsonb->>'order_id')));
select pg_temp.srv('select public.release_due_wallet_credits(null)::text');
select pg_temp.chk('C8 dispute won: the credit is released on the next run', (select status from public.wallet_ledger where order_id = (:'c5'::jsonb->>'order_id') and source = 'referral_reward') = 'available');

-- ============================================================================
-- F4  the wallet is consumed even when the order was superseded / expired
-- ============================================================================
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note) values (:W, 'credit', 'available', 500, 'admin_adjustment', 'b1');
select pg_temp.mkorder(:W::uuid, 'pb_n5', true) as w1 \gset
select pg_temp.mkorder(:W::uuid, 'pb_n6', true) as w2 \gset
select pg_temp.mkorder(:W::uuid, 'pb_n7', true) as w3 \gset
select pg_temp.chk('W0 three checkouts in a row, each priced with 250 of the same 500 balance; the first two are cancelled',
  (:'w1'::jsonb->>'wallet_amount')::numeric = 250 and (:'w2'::jsonb->>'wallet_amount')::numeric = 250 and (:'w3'::jsonb->>'wallet_amount')::numeric = 250
  and (select status from public.orders where id = (:'w1'::jsonb->>'order_id')) = 'cancelled', :'w3');
select pg_temp.pay(:'w1'::jsonb->>'order_id');
select pg_temp.pay(:'w2'::jsonb->>'order_id');
select pg_temp.pay(:'w3'::jsonb->>'order_id');
select pg_temp.chk('W1 THE EXPLOIT: paying all three uses the 500 balance once, not 750 - the two stale orders are debited (250 each)',
  (select coalesce(sum(amount), 0) from public.wallet_ledger where user_id = :W and entry_type = 'debit') = 500
  and (select available from public.wallet_balance_of(:W::uuid)) = 0
  and (select count(*) from public.wallet_ledger where order_id in (:'w1'::jsonb->>'order_id', :'w2'::jsonb->>'order_id') and entry_type = 'debit' and amount = 250) = 2);
select pg_temp.chk('W2 the third order finds an empty wallet: access granted, shortfall of 250 flagged with instructions',
  (select count(*) from public.purchases where order_id = (:'w3'::jsonb->>'order_id') and status = 'success') = 1
  and (select count(*) from public.order_review_flags where order_id = (:'w3'::jsonb->>'order_id') and reason = 'wallet_shortfall'
        and (details->>'shortfall')::numeric = 250 and details->>'recommended_action' like '%pay_%') = 1);
select pg_temp.pay(:'w1'::jsonb->>'order_id');
select pg_temp.pay(:'w3'::jsonb->>'order_id');
select pg_temp.chk('W3 replays debit nothing more and add no flag',
  (select coalesce(sum(amount), 0) from public.wallet_ledger where user_id = :W and entry_type = 'debit') = 500
  and (select count(*) from public.order_review_flags where order_id = (:'w3'::jsonb->>'order_id')) = 1);
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'w1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('W4 refunding a stale order that was debited gives its 250 back', (pg_temp.j(:'r')->>'wallet_restored')::numeric = 250
  and (select available from public.wallet_balance_of(:W::uuid)) = 250, :'r');

-- discount_reused: access is granted; the flag says exactly what to do
select pg_temp.mkorder(:F6::uuid, 'pb_n8') as x1 \gset
select pg_temp.mkorder(:F6::uuid, 'pb_n9') as x2 \gset
select pg_temp.pay(:'x2'::jsonb->>'order_id');
select pg_temp.pay(:'x1'::jsonb->>'order_id');
select pg_temp.chk('X1 the reused-discount order still GRANTS access',
  (select status from public.purchases where order_id = (:'x1'::jsonb->>'order_id')) = 'success'
  and pg_temp.owns(:F6::uuid, 'pb_c8') = 'true');
select coalesce((select details::text from public.order_review_flags where order_id = (:'x1'::jsonb->>'order_id') and reason = 'discount_reused'), '{}') as x_flag \gset
select pg_temp.chk('X2 the flag names the order that legitimately used the discount, the under-charge, the payment id and says how to refund',
  (:'x_flag'::jsonb->>'discount_first_order_id') = (:'x2'::jsonb->>'order_id')
  and (:'x_flag'::jsonb->>'discount_not_owed')::numeric = 50
  and (:'x_flag'::jsonb->>'access_granted')::boolean
  and (:'x_flag'::jsonb->>'referrer_credited')::boolean = false
  and (:'x_flag'::jsonb->>'razorpay_payment_id') = 'pay_' || (:'x1'::jsonb->>'order_id')
  and (:'x_flag'::jsonb->>'recommended_action') like '%FULL refund of payment pay_%'
  and (:'x_flag'::jsonb->>'product_title') = 'notes 8', :'x_flag');
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (:'x1'::jsonb->>'order_id'))) as r \gset
select pg_temp.chk('X3 following the advice (full refund) revokes exactly that purchase; the legitimate one and the referrer credit are untouched',
  (select status from public.purchases where order_id = (:'x1'::jsonb->>'order_id')) = 'refunded'
  and pg_temp.owns(:F6::uuid, 'pb_c8') = 'false'
  and pg_temp.owns(:F6::uuid, 'pb_c9') = 'true'
  and (select status from public.wallet_ledger where user_id = :A6 and source = 'referral_reward') = 'pending', :'r');

-- ============================================================================
-- F6  owning a product blocks buying it again; the DB enforces it
-- ============================================================================
select pg_temp.mkorder(:O::uuid, 'pb_n11') as o1 \gset
select pg_temp.pay(:'o1'::jsonb->>'order_id');
select pg_temp.mkorder(:O::uuid, 'pb_n11') as o2 \gset
select pg_temp.chk('O1 create_priced_order refuses an owned product with code already_owned and creates no order',
  :'o2'::jsonb->>'code' = 'already_owned' and not (:'o2'::jsonb->>'ok')::boolean
  and (select count(*) from public.orders where user_id = :O and product_id = 'pb_n11') = 1, :'o2');
select pg_temp.q('authenticated', :O::uuid, $$select public.quote_my_order('pb_n11', false)->>'code'$$) as r \gset
select pg_temp.chk('O2 quote_my_order says already_owned too', :'r' = 'already_owned', :'r');
select pg_temp.mkorder(:O::uuid, 'pb_n12') as o3 \gset
select pg_temp.chk('O3 a different product is unaffected', (:'o3'::jsonb->>'ok')::boolean, :'o3');
select pg_temp.attempt('service_role', null, format($$insert into public.purchases(user_id, scope, course_id, product_id, status)
  values (%L, 'chapter', 'bams', 'pb_n11', 'success')$$, :O)) as r \gset
select pg_temp.chk('O4 the DATABASE refuses a second successful purchase of the same product', :'r' like 'ERR:%duplicate%', :'r');
select pg_temp.attempt('service_role', null, format($$insert into public.purchases(user_id, scope, course_id, product_id, status)
  values (%L, 'chapter', 'bams', 'pb_n11', 'refunded')$$, :O)) as r \gset
select pg_temp.chk('O5 ... but a refunded / duplicate row for it is fine', :'r' = 'OK', :'r');
select pg_temp.attempt('service_role', null, format($$insert into public.purchases(user_id, scope, course_id, product_id, status)
  values (%L, 'chapter', 'bams', 'pb_n11', 'lost')$$, :O)) as r \gset
select pg_temp.chk('O6 purchases.status is a closed vocabulary', :'r' like 'ERR:%check%', :'r');
select pg_temp.attempt('service_role', null, format($$insert into public.purchases(user_id, scope, course_id, product_id, status)
  values (%L, 'chapter', 'bams', 'pb_n11', null)$$, :O)) as r \gset
select pg_temp.chk('O7 ... and NOT NULL', :'r' like 'ERR:%null%', :'r');
-- two checkouts created before either is paid, both paid: second is recorded as duplicate, settlement does not fail
select pg_temp.mkorder(:DU::uuid, 'pb_n10') as u1 \gset
select pg_temp.mkorder(:DU::uuid, 'pb_n10') as u2 \gset
select pg_temp.pay(:'u2'::jsonb->>'order_id') as p2 \gset
select pg_temp.pay(:'u1'::jsonb->>'order_id') as p1 \gset
select pg_temp.chk('U1 paying both checkouts of one product: neither settlement fails (money is never lost to the unique index)', :'p1' = 'OK' and :'p2' = 'OK', :'p1' || :'p2');
select pg_temp.chk('U2 exactly one successful purchase; the other is stored as duplicate and grants nothing',
  (select count(*) from public.purchases where user_id = :DU and product_id = 'pb_n10' and status = 'success') = 1
  and (select count(*) from public.purchases where user_id = :DU and product_id = 'pb_n10' and status = 'duplicate') = 1
  and pg_temp.owns(:DU::uuid, 'pb_c10') = 'true');
select pg_temp.chk('U3 the duplicate is flagged with the payment id and a refund instruction',
  (select count(*) from public.order_review_flags where reason = 'duplicate_purchase'
      and order_id = (select order_id from public.purchases where user_id = :DU and status = 'duplicate')
      and details->>'recommended_action' like '%Refund payment pay_%') = 1);
select pg_temp.srv(format($$select public.handle_payment_refund(%L, true)::text$$, 'pay_' || (select order_id from public.purchases where user_id = :DU and status = 'duplicate')));
select pg_temp.chk('U4 refunding the duplicate leaves the student''s real access alone', pg_temp.owns(:DU::uuid, 'pb_c10') = 'true');

-- ============================================================================
-- F9  analytics_events
-- ============================================================================
select pg_temp.attempt('anon', null, $$insert into public.analytics_events(name, params) values ('app_open', '{"v":1}')$$) as r \gset
select pg_temp.chk('A1 anon can still log an anonymous event', :'r' = 'OK', :'r');
select pg_temp.attempt('anon', null, format($$insert into public.analytics_events(name, user_id) values ('x', %L)$$, :H)) as r \gset
select pg_temp.chk('A2 anon CANNOT attribute an event to a user', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.analytics_events(name, user_id) values ('x', %L)$$, :Z)) as r \gset
select pg_temp.chk('A3 a student CANNOT attribute an event to someone else', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.analytics_events(name, user_id) values ('screen_view', %L)$$, :H)) as r \gset
select pg_temp.chk('A4 a student can log their own event', :'r' = 'OK', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.analytics_events(name, user_id) values (repeat('n', 65), %L)$$, :H)) as r \gset
select pg_temp.chk('A5 an oversized event name is refused', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('anon', null, $$insert into public.analytics_events(name, params) values ('x', jsonb_build_object('blob', repeat('a', 5000)))$$) as r \gset
select pg_temp.chk('A6 an oversized params blob is refused', :'r' like 'ERR:%', :'r');

-- ============================================================================
-- F10  profiles.email is server-owned; a changed phone loses its verification
-- ============================================================================
update public.profiles set phone = '+919811100001', mobile_verified = true where id = :H;
select pg_temp.attempt('authenticated', :H::uuid, format($$update public.profiles set email = 'victim@example.com' where id = %L$$, :H)) as r \gset
select pg_temp.chk('P1 a student cannot edit profiles.email', :'r' like 'ERR:%protected%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$update public.profiles set name = 'New Name', phone = '+919811100001' where id = %L$$, :H)) as r \gset
select pg_temp.chk('P2 name still editable; saving the SAME phone keeps mobile_verified',
  :'r' = 'OK' and (select mobile_verified from public.profiles where id = :H), :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$update public.profiles set phone = '+919811100002' where id = %L$$, :H)) as r \gset
select pg_temp.chk('P3 changing the phone resets mobile_verified',
  :'r' = 'OK' and not (select mobile_verified from public.profiles where id = :H), :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$update public.profiles set mobile_verified = true where id = %L$$, :H)) as r \gset
select pg_temp.chk('P4 ... and the student cannot set it back', :'r' like 'ERR:%protected%', :'r');
update auth.users set email = 'b1_renamed@example.com' where id = :H;
select pg_temp.chk('P5 when the AUTH email changes, profiles.email follows (server path)',
  (select email from public.profiles where id = :H) = 'b1_renamed@example.com');

-- ============================================================================
-- F14  quiz_scores
-- ============================================================================
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.quiz_scores(id, user_id, score, total, percentage) values ('qa1', %L, 11, 10, 110)$$, :H)) as r \gset
select pg_temp.chk('Q1 score above total is refused', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.quiz_scores(id, user_id, score, total, percentage) values ('qa2', %L, 5, 10, 99999)$$, :H)) as r \gset
select pg_temp.chk('Q2 percentage 99999 is refused', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.quiz_scores(id, user_id, score, total, percentage) values ('qa3', %L, -1, 10, 0)$$, :H)) as r \gset
select pg_temp.chk('Q3 a negative score is refused', :'r' like 'ERR:%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$insert into public.quiz_scores(id, user_id, score, total, percentage, email) values ('qa4', %L, 7, 10, 70, 'ceo@example.com')$$, :H)) as r \gset
select pg_temp.chk('Q4 a normal attempt is accepted and the forged email is replaced by the student''s own',
  :'r' = 'OK' and (select email from public.quiz_scores where id = 'qa4') = (select email from public.profiles where id = :H), :'r');

-- ============================================================================
-- F15  integrity
-- ============================================================================
select pg_temp.attempt('service_role', null, format($$insert into public.orders(id, user_id, product_id, amount, status, course_id) values ('zero-amt', %L, 'pb_n1', 0, 'created', 'bams')$$, :Z)) as r \gset
select pg_temp.chk('I1 an order for amount 0 (or less) is refused', :'r' like 'ERR:%', :'r');
select pg_temp.chk('I2 the Phase 2 price-breakdown check is now VALIDATED',
  (select convalidated from pg_constraint where conname = 'orders_phase2_amounts'));
select pg_temp.attempt('service_role', null, format($$delete from public.orders where id = %L$$, :'r1'::jsonb->>'order_id')) as r \gset
select pg_temp.chk('I3 an order that has a payment record cannot be deleted (no silent cascade of accounting rows)', :'r' like 'ERR:%foreign key%', :'r');
select pg_temp.attempt('service_role', null, $$insert into public.referrals(referrer_id, referred_id, code_used, first_order_id) select id, (select id from public.profiles where id <> p.id limit 1), 'X', 'no-such-order' from public.profiles p limit 1$$) as r \gset
select pg_temp.chk('I4 referrals.first_order_id must be a real order', :'r' like 'ERR:%', :'r');
select pg_temp.chk('I5 payments.razorpay_payment_id has ONE unique index/constraint, not two',
  (select count(*) from pg_index i join pg_class c on c.oid = i.indrelid
    where c.relname = 'payments' and i.indisunique and i.indnatts = 1
      and (select attname from pg_attribute where attrelid = c.oid and attnum = i.indkey[0]) = 'razorpay_payment_id') = 1);
select pg_temp.chk('I6 ON CONFLICT (razorpay_payment_id) still works (settlement replays are idempotent)',
  pg_temp.pay(:'o1'::jsonb->>'order_id') = 'OK');

-- ============================================================================
-- F16  the wallet cannot be overdrawn, in the database itself
-- ============================================================================
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note) values (:Z, 'credit', 'available', 100, 'admin_adjustment', 'b1') returning id as z_credit \gset
select pg_temp.attempt('service_role', null, format($$insert into public.wallet_ledger(user_id, entry_type, status, amount, source) values (%L, 'debit', 'available', 100.01, 'order_payment')$$, :Z)) as r \gset
select pg_temp.chk('L1 a debit above the balance is refused by the ledger', :'r' like 'ERR:%overdraw%', :'r');
select pg_temp.attempt('service_role', null, format($$insert into public.wallet_ledger(user_id, entry_type, status, amount, source) values (%L, 'debit', 'available', 100, 'order_payment')$$, :Z)) as r \gset
select pg_temp.chk('L2 a debit of exactly the balance is fine', :'r' = 'OK', :'r');
select pg_temp.attempt('service_role', null, format($$insert into public.wallet_ledger(user_id, entry_type, status, amount, source, reverses_id) values (%L, 'reversal', 'available', 1, 'admin_adjustment', %L)$$, :Z, :'z_credit')) as r \gset
select pg_temp.chk('L3 a reversal on an empty wallet is refused too', :'r' like 'ERR:%overdraw%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'z_credit')) as r \gset
select pg_temp.chk('L4 admin cannot reverse a credit the student already spent (clear message)', :'r' like 'ERR:%already spent%', :'r');
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, note) values (:H, 'credit', 'available', 100, 'admin_adjustment', 'b1') returning id as h_credit \gset
insert into public.wallet_ledger(user_id, entry_type, status, amount, source) values (:H, 'debit', 'available', 70, 'order_payment');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'h_credit')) as r \gset
select pg_temp.chk('L5 partly spent: admin reversal takes only the 30 that is left (never negative), noted as partial',
  :'r' = 'OK' and (select amount from public.wallet_ledger where reverses_id = :'h_credit'::uuid) = 30
  and (select available from public.wallet_balance_of(:H::uuid)) = 0
  and (select note from public.wallet_ledger where reverses_id = :'h_credit'::uuid) like '%partial%', :'r');
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'h_credit')) as r \gset
select pg_temp.chk('L6 a second reversal of the same credit is refused', :'r' like 'ERR:%already reversed%', :'r');
insert into public.wallet_ledger(user_id, entry_type, status, amount, source, expires_at, note) values (:Z, 'credit', 'available', 40, 'admin_adjustment', now() - interval '1 day', 'b1 expired') returning id as z_exp \gset
select pg_temp.attempt('authenticated', :ADM::uuid, format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'z_exp')) as r \gset
select pg_temp.chk('L7 an expired credit cannot be reversed (it would eat other credits)', :'r' like 'ERR:%expired%', :'r');
select pg_temp.attempt('authenticated', :H::uuid, format($$select public.admin_reverse_wallet_credit(%L, 'x')$$, :'z_credit')) as r \gset
select pg_temp.chk('L8 a student still cannot reverse anything', :'r' like 'ERR:%admin only%', :'r');

-- ---- report ------------------------------------------------------------------
\o
select case when ok then 'PASS' else 'FAIL' end as result, name, case when ok then '' else left(detail, 300) end as detail
from b1_results order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from b1_results;
rollback;
