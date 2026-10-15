-- Lease, retry, priority and parking checks on the local scratch database.
begin;
do $$
declare v_target text; v_lease uuid; v_attempt integer; v_state text; i integer;
begin
  insert into public.payment_jobs(kind,target_id,deadline_at,next_attempt_at)
  select 'reconcile','f04_fail_'||n,now()-interval '10 hours',now()+interval '1 hour'
  from generate_series(1,10) n;
  insert into public.payment_jobs(kind,target_id,deadline_at,next_attempt_at)
  values('reconcile','f04_refunded_11',now()-interval '1 hour',now());
  select target_id,lease_id,attempts into v_target,v_lease,v_attempt
    from public.claim_payment_jobs('reconcile',1);
  assert v_target='f04_refunded_11' and v_attempt=1, 'F04 later refunded token not claimed fairly';
  assert (select count(*) from public.claim_payment_jobs('reconcile',1))=0,
    'F04 unexpired lease or failing future tokens selected';
  update public.payment_jobs set lease_until=now()-interval '1 second'
    where kind='reconcile' and target_id='f04_refunded_11';
  select target_id,lease_id into v_target,v_lease from public.claim_payment_jobs('reconcile',1);
  assert v_target='f04_refunded_11', 'F04 expired lease not recovered';
  v_state:=public.finish_payment_job('reconcile',v_target,v_lease,false,'mock Google failure');
  assert v_state='pending' and (select next_attempt_at>now() from public.payment_jobs
    where kind='reconcile' and target_id=v_target), 'F04 failure not backed off';
  update public.payment_jobs set attempts=11,next_attempt_at=now(),status='pending'
    where kind='reconcile' and target_id=v_target;
  select lease_id into v_lease from public.claim_payment_jobs('reconcile',1);
  v_state:=public.finish_payment_job('reconcile',v_target,v_lease,false,'permanent mock failure');
  assert v_state='parked', 'F06 permanent failure not parked';
  assert (select parked_count>=1 from public.payment_queue_metrics where kind='reconcile'),
    'F06 parked backlog metric absent';
  insert into public.payment_jobs(kind,target_id,deadline_at)
    values('reports','f06_later',now()+interval '20 hours'),
          ('reports','f06_urgent',now()+interval '1 hour');
  select target_id,lease_id into v_target,v_lease from public.claim_payment_jobs('reports',1);
  assert v_target='f06_urgent','F06 deadline priority lost';
  perform public.finish_payment_job('reports',v_target,v_lease,true,null);
  insert into public.orders(id,product_id,amount,status,razorpay_order_id,
    external_transaction_token,external_transaction_id,external_report_status,payment_completed_at)
    values('f05_deadline_order','seed_product',49,'paid','order_f05_deadline',
      'f05_deadline_token','medveda_f05_deadline','pending',now());
  perform public.enqueue_payment_jobs();
  update public.orders set payment_provider_time=now()-interval '25 hours'
    where id='f05_deadline_order';
  perform public.enqueue_payment_jobs();
  assert (select deadline_at<now() from public.payment_jobs
    where kind='reports' and target_id='f05_deadline_order'),
    'F05 provider time did not advance the overdue alert clock';
  raise notice 'PASS F04 fair claim, failed-token backoff, lease expiry recovery';
  raise notice 'PASS F06 deadline priority, permanent parking and backlog metric';
  raise notice 'PASS F05 provider-time correction advances queued report deadline';
end $$;
rollback;
