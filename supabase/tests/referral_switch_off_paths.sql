-- Both providers must sell at list price without referral/wallet side effects.
begin;
do $$
declare a uuid:='c9000000-0000-0000-0000-000000000001';
  f uuid:='c9000000-0000-0000-0000-000000000002';
  p uuid:='c9000000-0000-0000-0000-000000000003';
  razor jsonb; play jsonb; oid text; v_job record;
begin
  insert into auth.users(id,email) values
    (a,'switch_a@example.com'),(f,'switch_f@example.com'),(p,'switch_p@example.com');
  update public.profiles set course_id='bams' where id in (a,f,p);
  insert into public.products(id,title,scope,price,chapter_id,active,product_type,course_id)
    values ('switch_note','Switch note','chapter',47,'seed_c',true,'notes','bams');
  loop
    select * into v_job from public.claim_play_price_sync();
    assert found, 'Play tier job missing';
    assert public.finish_play_price_sync(v_job.price_inr,v_job.lease_id,v_job.candidate_sku,'buy'),
      'Play tier did not verify';
    exit when v_job.price_inr=47;
  end loop;
  update public.referral_settings set enabled=true,friend_discount_percent=10,
    referrer_credit_amount=20,wallet_max_percent=50 where id=true;
  insert into public.referrals(referrer_id,referred_id,code_used,status)
    values(a,f,'SWITCH','pending'),(a,p,'SWITCH','pending');
  insert into public.wallet_ledger(user_id,entry_type,status,amount,source)
    values(f,'credit','available',20,'admin_adjustment');
  update public.referral_settings set enabled=false where id=true;
  razor:=public.create_priced_order(f,'switch_note',true);
  assert razor->>'ok'='true' and (razor->>'amount')::numeric=47
    and (razor->>'referral_discount')::numeric=0 and (razor->>'wallet_amount')::numeric=0,
    'Razorpay off pricing or wallet ignored incorrectly';
  oid:=razor->>'order_id';
  assert not exists(select 1 from public.wallet_order_reservations where order_id=oid),
    'Razorpay off created wallet reservation';
  update public.orders set razorpay_order_id='order_switch_off' where id=oid;
  perform public.settle_razorpay_payment('evt_switch_off','order_switch_off','pay_switch_off',4700,now());
  assert exists(select 1 from public.purchases where order_id=oid and status='success'),
    'Razorpay off purchase failed';
  assert not exists(select 1 from public.wallet_ledger where order_id=oid),
    'Razorpay off wrote wallet/referral ledger';
  play:=public.create_play_order(p,'switch_note');
  assert play->>'ok'='true',
    'Play off order failed or not list price';
  oid:=play->>'order_id';
  assert (select amount=47 and wallet_amount=0 and referral_discount=0 from public.orders where id=oid),
    'Play off order has discount or wallet';
  perform public.settle_play_purchase(p,oid,'switch_note',v_job.candidate_sku,'switch_off_play_token_123',now());
  assert exists(select 1 from public.purchases where order_id=oid and status='success'),
    'Play off purchase failed';
  assert not exists(select 1 from public.wallet_ledger where order_id=oid),
    'Play off created referral reward';
  raise notice 'PASS SWITCH OFF Razorpay full price, no wallet reservation/debit or reward';
  raise notice 'PASS SWITCH OFF Play full price, no wallet use or referral reward';
end $$;
rollback;
