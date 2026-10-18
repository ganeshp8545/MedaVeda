-- Run against disposable local DB with 20261015120000 applied. Roll back fixtures.
begin;
insert into public.chapters(id,title,subject_id) values
  ('qa_new_chapter','Changed chapter','seed_s');
insert into public.play_price_tiers(price_inr,play_sku,active,purchase_option_id,verified_at)
  values(49,'notes_49',true,'buy',now())
  on conflict (play_sku) do update set active=true,verified_at=now();
update public.play_price_sync set candidate_sku='notes_49',status='ready',last_synced_at=now()
  where price_inr=49;

do $$
declare v_order text; v_result jsonb;
begin
  v_result:=public.create_play_order('5eed0000-0000-0000-0000-00000000000b','seed_product');
  assert v_result->>'ok'='true','Play order was not created';
  v_order:=v_result->>'order_id';
  update public.products set chapter_id='qa_new_chapter' where id='seed_product';
  perform public.settle_play_purchase('5eed0000-0000-0000-0000-00000000000b',
    v_order,'seed_product','notes_49','qa-snapshot-token-000001',now());
  assert (select chapter_id='seed_c' and scope='chapter' and course_id='bams'
    from public.purchases where order_id=v_order), 'Play entitlement changed with catalog';
  raise notice 'PASS Play entitlement uses immutable order snapshot';
end $$;

-- A Razorpay purchase keeps its caller-supplied entitlement fields.
insert into public.orders(id,user_id,product_id,scope,chapter_id,course_id,
  amount,list_price,status,provider,razorpay_order_id)
values('qa_razor_snapshot','5eed0000-0000-0000-0000-00000000000b','seed_product',
  'chapter','seed_c','bams',49,49,'paid','razorpay','order_qa_razor_snapshot');
insert into public.purchases(id,user_id,order_id,product_id,scope,chapter_id,course_id,amount,status)
values('qa_razor_snapshot_purchase','5eed0000-0000-0000-0000-00000000000b',
  'qa_razor_snapshot','seed_product','chapter','qa_new_chapter','bams',49,'duplicate');
do $$ begin
  assert (select chapter_id='qa_new_chapter' from public.purchases
    where id='qa_razor_snapshot_purchase'), 'Razorpay purchase was changed';
  raise notice 'PASS Razorpay entitlement insert unchanged';
end $$;
rollback;
