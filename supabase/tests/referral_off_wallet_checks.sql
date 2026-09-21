-- ============================================================================
-- Referral OFF => wallet cannot be spent (quote_my_order + create_priced_order).
-- Run AFTER 20260928110000_referral_off_blocks_wallet.sql:
--   psql "$DB_URL" -f supabase/tests/referral_off_wallet_checks.sql
-- One transaction, ROLLED BACK. Must end with "0 FAIL".
-- ============================================================================
\set ON_ERROR_STOP off
\set QUIET on
begin;
create temp table ow_results(name text, ok boolean, detail text);
create function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into ow_results values (p_name, coalesce(p_ok, false), p_detail) $$;
-- single-value select as a role/user -> text ('ERR: ...' on failure)
create function pg_temp.q(p_role text, p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into res; exception when others then res := 'ERR: ' || sqlerrm; end;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true); return res;
end $$;
\o /dev/null
insert into auth.users(id, email) values ('be000000-0000-0000-0000-000000000001', 'ow_student@example.com');
\set U '''be000000-0000-0000-0000-000000000001'''
insert into public.years(id, title, course_id) values ('owy', 'y', 'bams');
insert into public.subjects(id, title, year_id) values ('ows', 's', 'owy');
insert into public.chapters(id, title, subject_id) values ('owc1', 'c1', 'ows'), ('owc2', 'c2', 'ows'), ('owc3', 'c3', 'ows'), ('owc4', 'c4', 'ows');
insert into public.products(id, title, scope, price, chapter_id, active, product_type) values
  ('ow_notes', 'notes', 'chapter', 500, 'owc1', true, 'notes'),
  ('ow_notes2', 'notes 2', 'chapter', 500, 'owc2', true, 'notes'),
  ('ow_notes3', 'notes 3', 'chapter', 500, 'owc3', true, 'notes'),
  ('ow_video', 'video', 'chapter', 500, 'owc4', true, 'video');
update public.referral_settings set enabled = true, friend_discount_percent = 10, friend_discount_max = 100,
  wallet_max_percent = 50, wallet_product_types = array['notes', 'notes_bundle'] where id = true;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'referral_settings' and column_name = 'require_verified_phone') then
    update public.referral_settings set require_verified_phone = false where id = true;
  end if;
end $$;
-- a spendable balance of Rs 200
insert into public.wallet_ledger(user_id, entry_type, status, amount, source) values (:U, 'credit', 'available', 200, 'admin_adjustment');

-- ---- control: program ON, wallet works as before ------------------------------------------------
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', true)->>'wallet_amount')$$) as r \gset
select pg_temp.chk('N1 ON: quote applies the wallet (Rs 200 of a Rs 250 cap)', :'r'::numeric = 200, :'r');
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', true)->>'wallet_eligible')$$) as r \gset
select pg_temp.chk('N2 ON: quote says wallet_eligible', :'r' = 'true', :'r');
select (public.create_priced_order(:U::uuid, 'ow_notes', true))->>'wallet_amount' as r \gset
select pg_temp.chk('N3 ON: create_priced_order reserves the wallet', :'r'::numeric = 200, :'r');
select pg_temp.chk('N4 ON: a video with use_wallet is still refused (wallet_not_allowed)',
  (public.create_priced_order(:U::uuid, 'ow_video', true))->>'code' = 'wallet_not_allowed');
update public.orders set status = 'cancelled' where user_id = :U::uuid and status = 'created';

-- ---- program OFF ------------------------------------------------------------------------------------
update public.referral_settings set enabled = false where id = true;

select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', true)->>'wallet_amount')$$) as r \gset
select pg_temp.chk('Q1 OFF: quote_my_order ignores use_wallet = true (wallet_amount 0)', :'r'::numeric = 0, :'r');
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', true)->>'amount')$$) as r \gset
select pg_temp.chk('Q2 OFF: quote amount is the full list price', :'r'::numeric = 500, :'r');
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', false)->>'wallet_eligible')$$) as r \gset
select pg_temp.chk('Q3 OFF: quote reports wallet_eligible = false (the app shows no toggle)', :'r' = 'false', :'r');
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes', true)->>'wallet_max_usable')$$) as r \gset
select pg_temp.chk('Q4 OFF: quote reports nothing spendable', :'r'::numeric = 0, :'r');

select (public.create_priced_order(:U::uuid, 'ow_notes2', true))::text as res \gset
select pg_temp.chk('O1 OFF: create_priced_order with use_wallet = true succeeds (ignored, not an error)',
  (:'res'::jsonb)->>'ok' = 'true', :'res');
select pg_temp.chk('O2 OFF: ... priced with wallet_amount 0 and the full amount',
  ((:'res'::jsonb)->>'wallet_amount')::numeric = 0 and ((:'res'::jsonb)->>'amount')::numeric = 500, :'res');
select pg_temp.chk('O3 OFF: the stored order carries wallet_amount 0',
  (select wallet_amount = 0 and amount = 500 from public.orders where id = (:'res'::jsonb)->>'order_id'));
select pg_temp.chk('O4 OFF: a non-eligible product with use_wallet = true is also just priced, not refused',
  (public.create_priced_order(:U::uuid, 'ow_video', true))->>'ok' = 'true');

-- pay an order created while OFF: the balance must not move
update public.orders set status = 'cancelled' where user_id = :U::uuid and status = 'created';
select (public.create_priced_order(:U::uuid, 'ow_notes3', true))->>'order_id' as oid \gset
update public.orders set razorpay_order_id = 'order_ow1' where id = :'oid';
select public.grant_razorpay_payment('evt_ow1', 'order_ow1', 'pay_ow1', round(amount * 100)::bigint) is not null as paid from public.orders where id = :'oid' \gset
select pg_temp.chk('S1 OFF: the order settles for the full Rs 500 (a successful purchase exists)',
  exists (select 1 from public.purchases where user_id = :U::uuid and product_id = 'ow_notes3' and status = 'success'));
select pg_temp.chk('S2 OFF: no wallet debit was written', not exists (select 1 from public.wallet_ledger where user_id = :U::uuid and entry_type = 'debit'));

-- balances stay
select pg_temp.q('authenticated', :U::uuid, $$select (public.get_my_wallet()).available$$) as r \gset
select pg_temp.chk('B1 OFF: the existing balance is still shown by get_my_wallet (Rs 200)', :'r'::numeric = 200, :'r');
select pg_temp.chk('B2 OFF: the ledger holds exactly the one original credit',
  (select count(*) = 1 and sum(amount) = 200 from public.wallet_ledger where user_id = :U::uuid and entry_type = 'credit'));

-- ---- program back ON: the same balance is spendable again -------------------------------------------
update public.referral_settings set enabled = true where id = true;
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_video', false)->>'wallet_eligible')$$) as r \gset
select pg_temp.chk('R1 ON again: a video is still not wallet-eligible', :'r' = 'false', :'r');
insert into public.products(id, title, scope, price, chapter_id, active, product_type) values ('ow_notes4', 'notes 4', 'chapter', 500, 'owc1', true, 'notes');
select pg_temp.q('authenticated', :U::uuid, $$select (public.quote_my_order('ow_notes4', true)->>'wallet_amount')$$) as r \gset
select pg_temp.chk('R2 ON again: the balance is spendable again (Rs 200)', :'r'::numeric = 200, :'r');

-- ---- privileges unchanged --------------------------------------------------------------------------------
select pg_temp.chk('G1 create_priced_order is still server-only, quote_my_order student-callable',
  not has_function_privilege('authenticated', 'public.create_priced_order(uuid,text,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.create_priced_order(uuid,text,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.quote_my_order(text,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.quote_my_order(text,boolean)', 'execute'));

\o
\set QUIET off
select case when ok then 'PASS' else 'FAIL' end as verdict, name, detail from ow_results where not ok order by name;
select count(*) filter (where not ok) || ' FAIL, ' || count(*) filter (where ok) || ' PASS' as summary from ow_results;
rollback;
