-- Run on a scratch DB after applying 20260921130000_account_deletion_support.sql.
-- Everything happens in one transaction that is rolled back.
begin;

do $$
declare
  a uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  c uuid := 'cccccccc-0000-4000-8000-000000000003';
  v_prod text; r jsonb; n int;
begin
  select id into v_prod from public.products limit 1;
  insert into auth.users (id, email, aud, role) values
    (a, 'del.a@example.test', 'authenticated', 'authenticated'),
    (b, 'del.b@example.test', 'authenticated', 'authenticated'),
    (c, 'del.c@example.test', 'authenticated', 'authenticated');

  -- A: paid order + payment + purchase, an open checkout session, quiz, token, analytics
  insert into public.orders (id, user_id, product_id, amount, status, razorpay_order_id, razorpay_payment_id)
    values ('ord-a', a, v_prod, 99, 'paid', 'rzp_o_a', 'rzp_p_a'),
           ('ord-b', b, v_prod, 99, 'paid', 'rzp_o_b', 'rzp_p_b');
  insert into public.payments (order_id, user_id, product_id, amount, razorpay_order_id, razorpay_payment_id)
    values ('ord-a', a, v_prod, 99, 'rzp_o_a', 'rzp_p_a'), ('ord-b', b, v_prod, 99, 'rzp_o_b', 'rzp_p_b');
  insert into public.purchases (user_id, order_id, product_id, scope, amount, course_id)
    values (a, 'ord-a', v_prod, 'chapter', 99, (select course_id from public.products where id = v_prod)),
           (b, 'ord-b', v_prod, 'chapter', 99, (select course_id from public.products where id = v_prod));
  insert into public.orders (id, user_id, product_id, amount, status) values ('ord-a2', a, v_prod, 99, 'created');
  insert into public.payment_sessions (id, order_id, user_id, product_id, expires_at)
    values (gen_random_uuid(), 'ord-a2', a, v_prod, now() + interval '10 min');
  insert into public.quiz_scores (user_id, email, score, total, percentage) values (a, 'del.a@example.test', 3, 5, 60), (b, 'del.b@example.test', 4, 5, 80);
  insert into public.push_tokens (user_id, expo_push_token, platform) values (a, 'tok-a', 'android'), (b, 'tok-b', 'android');
  insert into public.analytics_events (name, params, user_id) values ('search', '{"q":"secret"}', a), ('search', '{"q":"other"}', b);
  -- referrals: A referred B (A = referrer); C referred A (A = referred); B->? none
  insert into public.referrals (referrer_id, referred_id, code_used) values (a, b, 'X'), (c, a, 'Y');

  -- 1. erase A
  r := public.erase_user_data(a);
  assert r->>'status' = 'erased', 'status erased';

  assert not exists (select 1 from public.profiles where id = a), 'profile gone';
  assert not exists (select 1 from public.quiz_scores where user_id = a), 'quiz gone';
  assert not exists (select 1 from public.push_tokens where user_id = a), 'tokens gone';
  assert not exists (select 1 from public.purchases where user_id = a), 'purchases gone';
  assert not exists (select 1 from public.payment_sessions where user_id = a), 'sessions gone';
  assert not exists (select 1 from public.analytics_events where user_id = a), 'analytics gone';
  assert not exists (select 1 from public.referrals where referrer_id = a or referred_id = a), 'referrals gone (both roles)';
  -- retained, anonymised
  assert (select user_id is null and amount = 99 and razorpay_payment_id = 'rzp_p_a' from public.orders where id = 'ord-a'), 'paid order kept, anonymous';
  assert (select user_id is null and razorpay_order_id = 'rzp_o_a' from public.payments where order_id = 'ord-a'), 'payment kept, anonymous';
  assert (select user_id is null from public.orders where id = 'ord-a2'), 'unpaid order anonymised';
  -- others untouched
  assert exists (select 1 from public.profiles where id = b) and exists (select 1 from public.profiles where id = c), 'B, C profiles kept';
  assert (select count(*) from public.quiz_scores where user_id = b) = 1, 'B quiz kept';
  assert (select count(*) from public.push_tokens where user_id = b) = 1, 'B token kept';
  assert (select count(*) from public.purchases where user_id = b) = 1, 'B purchase kept';
  assert (select count(*) from public.analytics_events where user_id = b) = 1, 'B analytics kept';
  assert (select user_id from public.orders where id = 'ord-b') = b, 'B order still linked';
  raise notice 'PASS erase removes personal data, keeps anonymous payment records, leaves others alone';

  -- 2. idempotent retry
  r := public.erase_user_data(a);
  assert r->>'status' = 'erased' and (r->'counts'->>'profiles')::int = 0, 'retry is a no-op';
  raise notice 'PASS idempotent retry';

  -- 3. auth user deletion (what the Edge Function does next / dashboard delete) keeps retained rows
  delete from auth.users where id = a;
  assert exists (select 1 from public.orders where id = 'ord-a') and exists (select 1 from public.payments where order_id = 'ord-a'), 'rows survive auth delete';
  -- deleting B directly via auth (no erase) also keeps orders/payments via SET NULL
  delete from auth.users where id = b;
  assert (select user_id is null from public.orders where id = 'ord-b'), 'SET NULL on direct auth delete';
  assert exists (select 1 from public.payments where order_id = 'ord-b'), 'payment survives direct auth delete';
  raise notice 'PASS FK SET NULL keeps orders/payments';

  -- 4. admin refused, data intact
  insert into auth.users (id, email, aud, role) values ('dddddddd-0000-4000-8000-000000000004', 'del.admin@example.test', 'authenticated', 'authenticated');
  insert into public.admins (email, id) values ('del.admin@example.test', 'dddddddd-0000-4000-8000-000000000004');
  r := public.erase_user_data('dddddddd-0000-4000-8000-000000000004');
  assert r->>'status' = 'admin_blocked', 'admin blocked';
  assert exists (select 1 from public.profiles where id = 'dddddddd-0000-4000-8000-000000000004'), 'admin profile intact';
  raise notice 'PASS admin accounts refused';

  -- 5. webhook guard: order whose user was deleted
  update public.orders set razorpay_order_id = 'rzp_o_late' where id = 'ord-a2';
  perform public.grant_razorpay_payment('evt-late', 'rzp_o_late', 'rzp_p_late', 9900);
  assert (select status = 'paid' and user_id is null from public.orders where id = 'ord-a2'), 'late order marked paid, anonymous';
  assert exists (select 1 from public.payments where razorpay_payment_id = 'rzp_p_late' and user_id is null), 'late payment recorded';
  assert not exists (select 1 from public.purchases where order_id = 'ord-a2'), 'no purchase for deleted user';
  perform public.grant_razorpay_payment('evt-late', 'rzp_o_late', 'rzp_p_late', 9900);  -- webhook retry
  raise notice 'PASS late webhook for deleted user records payment, grants nothing, is idempotent';

  -- 6. normal grant for a live user still works
  insert into auth.users (id, email, aud, role) values ('eeeeeeee-0000-4000-8000-000000000005', 'del.e@example.test', 'authenticated', 'authenticated');
  insert into public.orders (id, user_id, product_id, amount, status, razorpay_order_id) values ('ord-e', 'eeeeeeee-0000-4000-8000-000000000005', v_prod, 99, 'created', 'rzp_o_e');
  -- pay marks a payment_sessions row used before settlement; grant_razorpay_payment now requires it (Phase 1)
  insert into public.payment_sessions (id, order_id, user_id, product_id, expires_at, used) values (gen_random_uuid(), 'ord-e', 'eeeeeeee-0000-4000-8000-000000000005', v_prod, now() + interval '1 hour', true);
  perform public.grant_razorpay_payment('evt-e', 'rzp_o_e', 'rzp_p_e', 9900);
  assert exists (select 1 from public.purchases where order_id = 'ord-e' and user_id = 'eeeeeeee-0000-4000-8000-000000000005'), 'normal grant creates purchase';
  raise notice 'PASS normal grant unaffected';
end $$;

-- 7. privileges: a signed-in user cannot erase anyone (themselves or others); old RPC is gone
set local role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-4000-8000-000000000005', true);
do $$ begin
  begin perform public.erase_user_data('eeeeeeee-0000-4000-8000-000000000005'); raise notice 'FAIL authenticated can call erase_user_data';
  exception when insufficient_privilege then raise notice 'PASS authenticated cannot call erase_user_data'; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.erase_user_data('eeeeeeee-0000-4000-8000-000000000005'); raise notice 'FAIL anon can call erase_user_data';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call erase_user_data'; end;
end $$;
reset role;
-- Phase 1A keeps delete_my_account() as a backward-compatible wrapper (signed-in users only)
select case when to_regprocedure('public.delete_my_account()') is not null
             and has_function_privilege('authenticated', 'public.delete_my_account()', 'execute')
             and not has_function_privilege('anon', 'public.delete_my_account()', 'execute')
            then 'PASS delete_my_account kept as signed-in-only wrapper'
            else 'FAIL delete_my_account wrapper missing or exposed to anon' end;

rollback;
