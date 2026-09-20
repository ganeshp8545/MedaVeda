-- Attack simulation for 20260924*. Run on STAGING (or a restored copy) as postgres:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/critical_fixes_checks.sql
-- Everything runs in one transaction that is ROLLED BACK. Each block impersonates
-- a normal student and must be REJECTED; a block that is unexpectedly allowed
-- raises 'ATTACK SUCCEEDED: ...' and aborts the script.
begin;

do $$
declare
  v_uid uuid; v_product text; v_other text; v_order text := 'attack-order-' || gen_random_uuid()::text;
begin
  -- pick a real student (non-admin) and two products
  select p.id into v_uid from public.profiles p
   where not exists (select 1 from public.admins a where a.id = p.id) limit 1;
  select id into v_product from public.products where active order by price limit 1;
  select id into v_other   from public.products where active order by price desc limit 1;
  if v_uid is null or v_product is null then raise exception 'need at least one student and one product'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. direct RPC: settle a payment for free
  begin
    perform public.grant_razorpay_payment('evt', 'order_fake', 'pay_fake', 4900);
    raise exception 'ATTACK SUCCEEDED: grant_razorpay_payment callable by student';
  exception when insufficient_privilege then null; end;

  -- 2. fake paid order / order insert
  begin
    insert into public.orders (id, user_id, product_id, scope, amount, status) values (v_order, v_uid, v_product, 'chapter', 0, 'paid');
    raise exception 'ATTACK SUCCEEDED: student inserted an order';
  exception when insufficient_privilege then null; end;

  -- 3. fake purchase row
  begin
    insert into public.purchases (user_id, product_id, scope, amount, status) values (v_uid, v_other, 'bundle', 0, 'success');
    raise exception 'ATTACK SUCCEEDED: student inserted a purchase';
  exception when insufficient_privilege then null; end;

  -- 4. rewrite an existing order (product / amount) - RLS shows 0 rows or privilege error
  begin
    update public.orders set product_id = v_other, amount = 1 where user_id = v_uid;
    raise exception 'ATTACK SUCCEEDED: student updated orders';
  exception when insufficient_privilege then null; end;

  -- 5. self-unblock / role / verification / course
  begin
    update public.profiles set blocked = false where id = v_uid;
    -- only reachable if the column privilege allowed it: the trigger must reject a CHANGE
    update public.profiles set blocked = not blocked where id = v_uid;
    raise exception 'ATTACK SUCCEEDED: student changed profiles.blocked';
  exception when insufficient_privilege then null; end;

  begin
    update public.profiles set email_verified = not email_verified where id = v_uid;
    raise exception 'ATTACK SUCCEEDED: student changed email_verified';
  exception when insufficient_privilege then null; end;

  -- 6. other-user profile update affects 0 rows
  update public.profiles set name = name where id <> v_uid;
  if found then raise exception 'ATTACK SUCCEEDED: student updated another profile'; end if;

  reset role;
end;
$$;

-- 7. notes bucket private and no client read policy
do $$
begin
  if exists (select 1 from storage.buckets where id = 'notes' and public) then
    raise exception 'ATTACK SUCCEEDED: notes bucket is public';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('SELECT', 'ALL') and coalesce(qual, '') ilike '%notes%' and coalesce(qual, '') not ilike '%am_i_admin%') then
    raise exception 'ATTACK SUCCEEDED: client read policy on notes bucket';
  end if;
end;
$$;

-- 8. immutability applies even to the service role / postgres
do $$
declare v_id text;
begin
  select id into v_id from public.orders where razorpay_order_id is not null limit 1;
  if v_id is null then raise notice 'no order with razorpay_order_id to test immutability'; return; end if;
  begin update public.orders set amount = amount + 1 where id = v_id;
    raise exception 'ATTACK SUCCEEDED: orders.amount changed'; exception when insufficient_privilege then null; end;
  begin update public.orders set razorpay_order_id = 'order_x' where id = v_id;
    raise exception 'ATTACK SUCCEEDED: orders.razorpay_order_id changed'; exception when insufficient_privilege then null; end;
end;
$$;

select 'ALL ATTACKS REJECTED' as result;
rollback;
