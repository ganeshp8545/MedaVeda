begin;
do $$
declare j record; first_order jsonb; second_order jsonb; result jsonb;
begin
  select * into j from public.claim_play_price_sync();
  assert public.finish_play_price_sync(49,j.lease_id,j.candidate_sku,'buy');
  first_order:=public.create_play_order('5eed0000-0000-0000-0000-00000000000b','seed_product');
  second_order:=public.create_play_order('5eed0000-0000-0000-0000-00000000000b','seed_product');
  result:=public.settle_play_purchase('5eed0000-0000-0000-0000-00000000000b',
    first_order->>'order_id','seed_product',j.candidate_sku,'qa-first-duplicate-token',now());
  assert (result->>'ok')::boolean and not (result->>'duplicate')::boolean;
  result:=public.settle_play_purchase('5eed0000-0000-0000-0000-00000000000b',
    second_order->>'order_id','seed_product',j.candidate_sku,'qa-second-duplicate-token',now());
  assert (result->>'ok')::boolean and (result->>'duplicate')::boolean;
  result:=public.settle_play_purchase('5eed0000-0000-0000-0000-00000000000b',
    second_order->>'order_id','seed_product',j.candidate_sku,'qa-second-duplicate-token',now());
  assert (result->>'already_settled')::boolean and coalesce((result->>'duplicate')::boolean,false),
    'duplicate purchase replay was reported as ordinary success';
  assert (select count(*)=1 from public.purchases where product_id='seed_product' and status='success'),
    'duplicate created another entitlement';
end $$;
rollback;
