-- Run against a disposable test database with migrations and synthetic seed.
-- Entire suite rolls back; no hosted data or Play API calls.
begin;
do $$
declare v_sku text; v_lease uuid; v_new text; v_result jsonb;
begin
  assert (select price=49 from public.products where id='seed_product'), 'seed price changed';
  assert (select status='pending' from public.play_price_sync where price_inr=49), 'insert trigger did not queue';
  assert (select count(*)=1 from public.play_price_sync where price_inr=49), 'duplicate price job';
  select candidate_sku,lease_id into v_sku,v_lease from public.claim_play_price_sync();
  assert v_sku is not null and v_lease is not null, 'claim failed';
  assert not public.finish_play_price_sync(49,gen_random_uuid(),v_sku,'buy'), 'wrong lease activated tier';
  assert (select count(*)=0 from public.claim_play_price_sync()), 'unexpired lease claimed twice';
  assert public.finish_play_price_sync(49,v_lease,v_sku,'buy'), 'verified tier completion failed';
  assert (select active and verified_at is not null and purchase_option_id='buy'
    from public.play_price_tiers where play_sku=v_sku), 'tier not verified';
  -- Requeuing the same price keeps the verified SKU and does not create another Play product.
  perform public.queue_play_price_sync(49);
  assert (select candidate_sku=v_sku and status='ready' from public.play_price_sync where price_inr=49),
    'identical price did not reuse tier';
  update public.products set price=137.25 where id='seed_product';
  assert (select price=137.25 and active from public.products where id='seed_product'), 'Admin price update not preserved';
  assert (select status='pending' from public.play_price_sync where price_inr=137.25), 'new price not queued';
  select candidate_sku,lease_id into v_new,v_lease from public.claim_play_price_sync();
  assert v_new is distinct from v_sku and v_new like 'notes_137_25_v_%', 'versioned SKU missing';
  assert public.finish_play_price_sync(137.25,v_lease,v_new,'buy'), 'new tier completion failed';
  assert (select active from public.play_price_tiers where play_sku=v_sku), 'old tier unexpectedly disabled';
  -- A new order must bind the purchased content, current price, SKU and BUY option.
  v_result := public.create_play_order('5eed0000-0000-0000-0000-00000000000b','seed_product');
  assert v_result->>'ok'='true' and v_result->>'play_sku'=v_new
    and v_result->>'purchase_option_id'='buy', 'new order did not bind verified tier';
  assert (select amount=137.25 and product_id='seed_product' and play_purchase_option_id='buy'
    from public.orders where id=v_result->>'order_id'), 'order content/price snapshot wrong';
  begin
    update public.orders set play_purchase_option_id='other' where id=v_result->>'order_id';
    raise exception 'BUY option snapshot was mutable';
  exception when insufficient_privilege then null;
  end;
  update public.play_price_sync set last_synced_at=now()-interval '25 hours' where price_inr=137.25;
  assert public.requeue_stale_play_price_sync()=1, 'stale tier not queued';
  v_result := public.create_play_order('5eed0000-0000-0000-0000-00000000000b','seed_product');
  assert v_result->>'code'='price_tier_pending', 'checkout accepted stale tier';
  assert (select count(*)>=4 from public.play_price_sync_logs), 'sync log missing';
end $$;
-- Classification is explicit; legacy rows and videos cannot enter Play even
-- when a target happens to contain paid notes. All four notes scopes can.
insert into public.years(id,title,course_id) values
  ('qa_notes_y1','Notes year one','bams'),('qa_notes_y2','Notes year two','bams');
insert into public.subjects(id,title,year_id) values
  ('qa_notes_s1','Notes subject one','qa_notes_y1'),
  ('qa_notes_s2','Notes subject two','qa_notes_y2');
insert into public.chapters(id,title,subject_id) values
  ('qa_notes_c1','Notes chapter one','qa_notes_s1'),
  ('qa_notes_c2','Notes chapter two','qa_notes_s2');
insert into public.notes(id,title,pdf_url,chapter_id,is_free_preview) values
  ('qa_notes_n1','Paid PDF one','qa-notes-one.pdf','qa_notes_c1',false),
  ('qa_notes_n2','Paid PDF two','qa-notes-two.pdf','qa_notes_c2',false);
insert into public.products(id,title,scope,price,active,chapter_id,subject_id,year_id,year_ids,course_id,product_type) values
  ('qa_legacy','Legacy ambiguous','chapter',101,true,'qa_notes_c1',null,null,null,'bams','other'),
  ('qa_testing','Testing product','chapter',104,true,'qa_notes_c1',null,null,null,'bams','other'),
  ('qa_video_product','Incorrect video product','chapter',102,true,'qa_notes_c2',null,null,null,'bams','video'),
  ('qa_wrong_type','Wrong bundle type','chapter',103,true,'qa_notes_c2',null,null,null,'bams','notes_bundle'),
  ('qa_chapter','Chapter paid notes','chapter',111,true,'qa_notes_c1',null,null,null,'bams','notes'),
  ('qa_subject','Subject paid notes','subject',112,true,null,'qa_notes_s1',null,null,'bams','notes'),
  ('qa_year','Year paid notes','year',113,true,null,null,'qa_notes_y2',null,'bams','notes'),
  ('qa_bundle','Bundle paid notes','bundle',114,true,null,null,null,array['qa_notes_y1','qa_notes_y2'],'bams','notes_bundle');
insert into public.chapters(id,title,subject_id) values ('qa_empty_pdf_c','Empty PDF chapter','qa_notes_s1');
insert into public.notes(id,title,pdf_url,chapter_id,is_free_preview)
  values ('qa_empty_pdf_n','Empty PDF note','   ','qa_empty_pdf_c',false);
insert into public.products(id,title,scope,price,active,chapter_id,course_id,product_type)
  values ('qa_empty_pdf','No usable PDF','chapter',105,true,'qa_empty_pdf_c','bams','notes');
insert into public.videos(id,title,youtube_url,subject_id,year_id,active,is_free_preview)
  values('qa_free_video','Free video','https://youtube.com/watch?v=qa','qa_notes_s2','qa_notes_y2',true,false);
do $$
declare v_job record; v_result jsonb; v_id text; v_scope text;
  v_last_order text; v_last_sku text;
begin
  assert public.user_can_access_video('5eed0000-0000-0000-0000-00000000000b','qa_free_video'),
    'video required a purchase';
  assert not public.user_can_access_note('5eed0000-0000-0000-0000-00000000000b','qa_notes_n2'),
    'paid PDF opened without entitlement';
  assert not public.play_price_has_eligible_product(101)
    and not public.play_price_has_eligible_product(102)
    and not public.play_price_has_eligible_product(103)
    and not public.play_price_has_eligible_product(104)
    and not public.play_price_has_eligible_product(105), 'invalid classification or missing PDF was billable';
  assert not exists(select 1 from public.play_price_sync where price_inr in (101,102,103,104,105)),
    'legacy/testing/video/empty-PDF price queued';
  foreach v_id in array array['qa_legacy','qa_video_product','qa_wrong_type','qa_testing','qa_empty_pdf'] loop
    v_result:=public.create_play_order('5eed0000-0000-0000-0000-00000000000b',v_id);
    assert v_result->>'code'='not_billable_notes', 'invalid product reached checkout';
  end loop;
  loop
    select * into v_job from public.claim_play_price_sync();
    exit when not found;
    assert v_job.price_inr=137.25 or v_job.price_inr between 111 and 114,
      'ineligible price was claimed';
    assert public.finish_play_price_sync(v_job.price_inr,v_job.lease_id,v_job.candidate_sku,'buy'),
      'eligible scope did not finish catalog sync';
  end loop;
  foreach v_id in array array['qa_chapter','qa_subject','qa_year','qa_bundle'] loop
    select scope into v_scope from public.products where id=v_id;
    v_result:=public.create_play_order('5eed0000-0000-0000-0000-00000000000b',v_id);
    assert v_result->>'ok'='true', 'notes scope could not create Play order';
    assert (select scope=v_scope and product_id=v_id and amount=(select price from public.products where id=v_id)
      from public.orders where id=v_result->>'order_id'), 'scope or Admin price not snapshotted';
    if v_id='qa_bundle' then
      v_last_order:=v_result->>'order_id';
      v_last_sku:=v_result->>'play_sku';
    end if;
  end loop;
  update public.products set product_type='other' where id='qa_bundle';
  assert (public.settle_play_purchase('5eed0000-0000-0000-0000-00000000000b',
    v_last_order,'qa_bundle',v_last_sku,'qa-preserved-play-token-123',now())->>'ok')::boolean,
    'existing valid Play order could not settle after catalog reclassification';
  assert (select scope='bundle' and year_ids=array['qa_notes_y1','qa_notes_y2']::text[]
    from public.purchases where order_id=v_last_order), 'existing order entitlement changed';
  assert (select status='success' and product_id is null from public.purchases where id='seed_purchase'),
    'existing purchase changed';
end $$;
-- Publishing a paid PDF after its product exists must enqueue that Admin price.
insert into public.chapters(id,title,subject_id)
  values('qa_notes_late_c','Late chapter','qa_notes_s1');
insert into public.products(id,title,scope,price,active,chapter_id,course_id,product_type)
  values('qa_notes_late','Late notes','chapter',115,true,'qa_notes_late_c','bams','notes');
do $$ begin
  assert not exists(select 1 from public.play_price_sync where price_inr=115),
    'empty notes product was queued';
end $$;
insert into public.notes(id,title,pdf_url,chapter_id,is_free_preview)
  values('qa_notes_late_n','Late paid PDF','qa-late.pdf','qa_notes_late_c',false);
do $$ begin
  assert (select status='pending' from public.play_price_sync where price_inr=115),
    'published paid PDF did not queue its Admin price';
end $$;
insert into auth.users(id,email) values
  ('a1000000-0000-0000-0000-000000000001','qa-chapter@example.invalid'),
  ('a1000000-0000-0000-0000-000000000002','qa-subject@example.invalid'),
  ('a1000000-0000-0000-0000-000000000003','qa-year@example.invalid'),
  ('a1000000-0000-0000-0000-000000000004','qa-bundle@example.invalid');
insert into public.purchases(id,user_id,scope,status,chapter_id,subject_id,year_id,year_ids,course_id,product_id) values
  ('qa_chapter_purchase','a1000000-0000-0000-0000-000000000001','chapter','success',
    'qa_notes_c1',null,null,null,'bams','qa_chapter'),
  ('qa_subject_purchase','a1000000-0000-0000-0000-000000000002','subject','success',
    null,'qa_notes_s1',null,null,'bams','qa_subject'),
  ('qa_year_purchase','a1000000-0000-0000-0000-000000000003','year','success',
    null,null,'qa_notes_y2',null,'bams','qa_year'),
  ('qa_bundle_purchase','a1000000-0000-0000-0000-000000000004','bundle','success',
    null,null,null,array['qa_notes_y1','qa_notes_y2'],'bams','qa_bundle');
do $$ begin
  assert public.user_can_access_note('a1000000-0000-0000-0000-000000000001','qa_notes_n1')
    and not public.user_can_access_note('a1000000-0000-0000-0000-000000000001','qa_notes_n2'),
    'chapter entitlement escaped scope';
  assert public.user_can_access_note('a1000000-0000-0000-0000-000000000002','qa_notes_n1')
    and not public.user_can_access_note('a1000000-0000-0000-0000-000000000002','qa_notes_n2'),
    'subject entitlement escaped scope';
  assert public.user_can_access_note('a1000000-0000-0000-0000-000000000003','qa_notes_n2')
    and not public.user_can_access_note('a1000000-0000-0000-0000-000000000003','qa_notes_n1'),
    'year entitlement escaped scope';
  assert public.user_can_access_note('a1000000-0000-0000-0000-000000000004','qa_notes_n1')
    and public.user_can_access_note('a1000000-0000-0000-0000-000000000004','qa_notes_n2'),
    'bundle entitlement did not cover both years';
end $$;
-- Direct client attempts to claim or activate a tier must fail.
set local role authenticated;
do $$
begin
  begin
    perform public.claim_play_price_sync();
    raise exception 'authenticated role claimed Play sync job';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.retry_play_price_sync(137.25);
    raise exception 'non-admin retried Play sync';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
