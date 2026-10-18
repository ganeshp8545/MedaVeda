-- Run only against a disposable database built through 20261013110000 plus
-- the reviewed 20261015 Play migrations. All fixture changes roll back.
begin;

do $$
declare
  v_lease uuid;
  v_new uuid;
  v_state text;
  v_cursor jsonb;
  v_razorpay_before jsonb;
begin
  insert into public.orders(id,user_id,product_id,scope,chapter_id,amount,list_price,course_id,status,
    provider,play_sku,purchase_token,play_consumption_status)
  values('qa_play_1','5eed0000-0000-0000-0000-00000000000b','seed_product','chapter','seed_c',49,49,'bams',
    'paid','play','notes_49','qa-token-play-000001','pending');
  insert into public.orders(id,user_id,product_id,amount,list_price,course_id,status,
    provider,razorpay_order_id)
  values('qa_razorpay_1','5eed0000-0000-0000-0000-00000000000b','seed_product',49,49,'bams',
    'paid','razorpay','order_qa_razorpay_1');
  select to_jsonb(o) into v_razorpay_before from public.orders o where id='qa_razorpay_1';

  perform public.enqueue_play_payment_jobs();
  assert (select count(*)=2 from public.play_payment_jobs where order_id='qa_play_1'),
    'Play consume and reconcile were not enqueued';
  assert not exists(select 1 from public.play_payment_jobs where order_id='qa_razorpay_1'),
    'Razorpay order entered Play queue';
  perform public.enqueue_play_payment_jobs();
  assert (select count(*)=2 from public.play_payment_jobs where order_id='qa_play_1'),
    'Repeated enqueue duplicated jobs';

  select lease_id into v_lease from public.claim_play_payment_jobs('consume',1)
    where order_id='qa_play_1';
  assert v_lease is not null,'consume claim failed';
  assert (select count(*)=0 from public.claim_play_payment_jobs('consume',1)),
    'unexpired lease was claimed again';
  assert public.finish_play_payment_job('consume','qa_play_1',gen_random_uuid(),true,null)
    ='lease_lost','wrong lease completed job';
  update public.play_payment_jobs set lease_until=now()-interval '1 second'
    where kind='consume' and order_id='qa_play_1';
  select lease_id into v_new from public.claim_play_payment_jobs('consume',1)
    where order_id='qa_play_1';
  assert v_new is distinct from v_lease,'expired lease was not replaced';
  assert public.finish_play_payment_job('consume','qa_play_1',v_lease,true,null)
    ='lease_lost','stale lease completed job';
  v_state:=public.finish_play_payment_job('consume','qa_play_1',v_new,false,'mock Google 503');
  assert v_state='pending' and (select next_attempt_at>now() and attempts=2
    from public.play_payment_jobs where kind='consume' and order_id='qa_play_1'),
    'failure did not back off';
  update public.play_payment_jobs set next_attempt_at=now(),attempts=11
    where kind='consume' and order_id='qa_play_1';
  select lease_id into v_new from public.claim_play_payment_jobs('consume',1)
    where order_id='qa_play_1';
  assert public.finish_play_payment_job('consume','qa_play_1',v_new,false,'permanent mock')
    ='parked','retry limit did not park';
  assert (select parked_count=1 from public.play_recovery_metrics),
    'parked metric wrong';

  select lease_id into v_new from public.claim_play_payment_jobs('reconcile',1)
    where order_id='qa_play_1';
  assert public.finish_play_payment_job('reconcile','qa_play_1',v_new,true,null)='done',
    'reconcile completion failed';
  perform public.enqueue_play_payment_jobs();
  assert (select status='pending' from public.play_payment_jobs
    where kind='reconcile' and order_id='qa_play_1'),
    'due completed reconciliation did not reopen';
  update public.orders set play_last_checked_at=now() where id='qa_play_1';
  select lease_id into v_new from public.claim_play_payment_jobs('reconcile',1)
    where order_id='qa_play_1';
  assert public.finish_play_payment_job('reconcile','qa_play_1',v_new,true,null)='done',
    'reconcile second completion failed';
  perform public.enqueue_play_payment_jobs();
  assert (select status='done' from public.play_payment_jobs
    where kind='reconcile' and order_id='qa_play_1'),
    'recently checked reconciliation reopened';

  perform public.record_play_void_tokens(array['qa-token-play-000001','qa-token-play-000001']);
  assert (select count(*)=1 from public.play_void_tokens
    where purchase_token='qa-token-play-000001'),'void token was not deduplicated';
  v_cursor:=public.claim_play_recovery_cursor();
  assert v_cursor->>'ok'='true','void cursor claim failed';
  assert public.claim_play_recovery_cursor()->>'code'='busy','cursor double claim';
  assert public.finish_play_recovery_cursor(gen_random_uuid(),true,null,null)='lease_lost',
    'wrong cursor lease advanced';
  assert public.finish_play_recovery_cursor((v_cursor->>'lease_id')::uuid,false,null,'mock 503')
    ='retry','cursor failure did not retry';
  assert (select attempts=1 and next_attempt_at>now() from public.play_recovery_cursor),
    'cursor retry did not back off';
  update public.play_recovery_cursor set next_attempt_at=now();
  v_cursor:=public.claim_play_recovery_cursor();
  assert public.finish_play_recovery_cursor((v_cursor->>'lease_id')::uuid,true,'next-page',null)
    ='done','cursor page completion failed';
  assert (select next_page_token='next-page' and attempts=0
    from public.play_recovery_cursor),'cursor page was not retained';
  v_cursor:=public.claim_play_recovery_cursor();
  assert public.finish_play_recovery_cursor((v_cursor->>'lease_id')::uuid,true,null,null)
    ='done','cursor final page failed';
  assert (select next_page_token is null and end_time_ms>start_time_ms
    from public.play_recovery_cursor),'cursor did not advance';

  insert into public.purchases(id,user_id,order_id,product_id,scope,chapter_id,course_id,
    amount,status)
  values('qa_play_purchase_1','5eed0000-0000-0000-0000-00000000000b','qa_play_1',
    'seed_product','chapter','seed_c','bams',49,'success');
  assert public.reverse_play_payment('qa-token-play-000001')->>'status'='no_referral_credit',
    'mock void reversal failed';
  assert (select status='refunded' from public.orders where id='qa_play_1') and
    (select status='refunded' from public.purchases where id='qa_play_purchase_1'),
    'void reversal did not revoke Play entitlement';
  perform public.reverse_play_payment('qa-token-play-000001');
  assert (select status='refunded' from public.purchases where id='qa_play_purchase_1'),
    'duplicate reversal changed entitlement state';

  assert (select to_jsonb(o)=v_razorpay_before from public.orders o where id='qa_razorpay_1'),
    'Razorpay order changed';
  assert not exists(select 1 from public.payments where order_id='qa_razorpay_1'),
    'Razorpay payment was created';
  raise notice 'PASS Play enqueue, leases, retries, parking, reconciliation, void cursor, entitlement reversal and Razorpay isolation';
end $$;

do $$
declare v_role text; v_proc text;
begin
  foreach v_role in array array['anon','authenticated'] loop
    assert not has_table_privilege(v_role,'public.play_payment_jobs','SELECT,INSERT,UPDATE,DELETE'),
      v_role||' has queue DML';
    assert not has_table_privilege(v_role,'public.play_void_tokens','SELECT,INSERT,UPDATE,DELETE'),
      v_role||' has void token DML';
    assert not has_table_privilege(v_role,'public.play_recovery_cursor','SELECT,INSERT,UPDATE,DELETE'),
      v_role||' has cursor DML';
    assert not has_table_privilege(v_role,'public.play_recovery_metrics','SELECT'),
      v_role||' can read metrics';
    foreach v_proc in array array[
      'public.record_play_void_tokens(text[])',
      'public.enqueue_play_payment_jobs()',
      'public.claim_play_payment_jobs(text,integer)',
      'public.finish_play_payment_job(text,text,uuid,boolean,text)',
      'public.claim_play_recovery_cursor()',
      'public.finish_play_recovery_cursor(uuid,boolean,text,text)'] loop
      assert not has_function_privilege(v_role,v_proc,'EXECUTE'),
        v_role||' can execute '||v_proc;
      assert has_function_privilege('service_role',v_proc,'EXECUTE'),
        'service_role cannot execute '||v_proc;
    end loop;
  end loop;
  raise notice 'PASS Play queue, token, cursor, metrics and RPC privilege checks';
end $$;
rollback;
