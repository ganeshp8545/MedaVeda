-- Only run on the disposable local database built by run-all.sh.
-- Provisioning a catalog entry is never a purchase or a notes entitlement.
begin;
insert into auth.users(id,email)
  values('a1000000-0000-0000-0000-000000000049','catalog-no-purchase@example.invalid');
do $$
declare j record; retry boolean; result jsonb;
  buyer uuid := 'a1000000-0000-0000-0000-000000000049';
  orders_before bigint; payments_before bigint; purchases_before bigint;
begin
  select count(*) into orders_before from public.orders;
  select count(*) into payments_before from public.payments;
  select count(*) into purchases_before from public.purchases;
  foreach retry in array array[true,false] loop
    update public.play_price_sync set status='pending',next_attempt_at=now() where price_inr=49;
    select * into j from public.claim_play_price_sync();
    assert public.fail_play_price_sync(49,j.lease_id,'fixture catalog API failure',retry);
    assert not exists(select 1 from public.play_price_tiers where play_sku=j.candidate_sku and active),
      'catalog failure created a usable tier';
    result := public.create_play_order(buyer,'seed_product');
    assert result->>'code'='price_tier_pending', 'failed or backing-off sync allowed checkout';
    assert not public.user_can_access_note(buyer,'seed_note'), 'catalog failure granted notes access';
  end loop;
  update public.play_price_sync set status='pending',next_attempt_at=now() where price_inr=49;
  select * into j from public.claim_play_price_sync();
  assert public.finish_play_price_sync(49,j.lease_id,j.candidate_sku,'buy');
  assert not public.user_can_access_note(buyer,'seed_note'), 'catalog readiness granted notes access';
  assert (select count(*)=orders_before from public.orders), 'sync/failure created an order';
  assert (select count(*)=payments_before from public.payments), 'sync/failure created a payment';
  assert (select count(*)=purchases_before from public.purchases), 'sync/failure created a purchase';
  assert (select price=49 from public.products where id='seed_product'), 'configured price changed';
end $$;
rollback;
