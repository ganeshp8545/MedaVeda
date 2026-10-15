-- Scratch-database UCB invariants. Transaction is rolled back.
\set ON_ERROR_STOP on
\set QUIET on
begin;
create temp table ucb_results(name text, ok boolean);
create function pg_temp.chk(p_name text,p_ok boolean) returns void language sql as $$
  insert into ucb_results values(p_name,coalesce(p_ok,false)) $$;
create function pg_temp.try_play(p_user uuid,p_order text,p_token text) returns boolean language plpgsql as $$
begin
  perform public.settle_play_purchase(p_user,p_order,'ucb_product','notes_49',p_token,now());
  return true;
exception when others then return false;
end $$;
create function pg_temp.try_change_state(p_order text) returns boolean language plpgsql as $$
begin
  update public.orders set tax_administrative_area='DELHI' where id=p_order;
  return true;
exception when others then return false;
end $$;
insert into auth.users(id,email) values
 ('c3000000-0000-0000-0000-000000000001','ucb1@example.com'),
 ('c3000000-0000-0000-0000-000000000002','ucb2@example.com');
update public.profiles set course_id='bams' where id in
 ('c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002');
insert into public.products(id,title,scope,price,chapter_id,active,product_type,course_id)
 values ('ucb_product','UCB notes','chapter',49,'seed_c',true,'notes','bams');
select pg_temp.chk('no unapproved tier cannot create order',
  public.create_play_order('c3000000-0000-0000-0000-000000000001','ucb_product')->>'code'='price_tier_missing');
insert into public.play_price_tiers(price_inr,play_sku,active) values(49,'notes_49',true);
create temp table ucb_orders(id text,kind text);
insert into ucb_orders select public.create_play_order('c3000000-0000-0000-0000-000000000001','ucb_product')->>'order_id','play';
select pg_temp.chk('Play order uses exact tier and full price',
  exists(select 1 from public.orders where id=(select id from ucb_orders where kind='play')
    and provider='play' and play_sku='notes_49' and amount=49 and wallet_amount=0 and referral_discount=0));
select pg_temp.chk('wrong user cannot attach choice token',
  public.attach_ucb_external_token('c3000000-0000-0000-0000-000000000002',
    (select id from ucb_orders where kind='play'),'external_token_12345')->>'ok'='false');
select pg_temp.chk('choice token attaches once',
  public.attach_ucb_external_token('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play'),'external_token_12345')->>'ok'='true');
select pg_temp.chk('different choice token rejected',
  public.attach_ucb_external_token('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play'),'external_token_other')->>'ok'='false');
insert into ucb_orders select public.create_priced_order('c3000000-0000-0000-0000-000000000001','ucb_product',false)->>'order_id','razorpay';
update public.orders set razorpay_order_id='order_ucb_test_1' where id=(select id from ucb_orders where kind='razorpay');
select pg_temp.chk('invalid buyer state rejected',
  public.bind_ucb_razorpay_order('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play'),'order_ucb_test_1','IN-MH')->>'ok'='false');
select public.bind_ucb_razorpay_order('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play'),'order_ucb_test_1','MAHARASHTRA');
select pg_temp.chk('choice token moved to priced Razorpay order',
  (select external_transaction_token is null from public.orders where id=(select id from ucb_orders where kind='play'))
  and (select external_transaction_token='external_token_12345' and tax_region_code='IN'
       and tax_administrative_area='MAHARASHTRA' and tax_pre_amount=amount and tax_amount=0
       from public.orders where id=(select id from ucb_orders where kind='razorpay')));
select public.settle_razorpay_payment('evt_ucb_atomic','order_ucb_test_1','pay_ucb_atomic',4900,now());
select pg_temp.chk('F03 UCB completion time commits with grant',
  exists(select 1 from public.orders where id=(select id from ucb_orders where kind='razorpay')
    and status='paid' and payment_completed_at is not null));
select pg_temp.chk('same choice cannot bind twice',
  public.bind_ucb_razorpay_order('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play'),'order_ucb_test_1','MAHARASHTRA')->>'ok'='false');
select pg_temp.chk('bound buyer state cannot be changed',
  not pg_temp.try_change_state((select id from ucb_orders where kind='razorpay')));

-- A second buyer completes a Play purchase. The Google response verification is
-- outside SQL; only service_role can invoke this atomic settlement RPC.
insert into ucb_orders select public.create_play_order('c3000000-0000-0000-0000-000000000002','ucb_product')->>'order_id','play2';
select public.settle_play_purchase('c3000000-0000-0000-0000-000000000002',
    (select id from ucb_orders where kind='play2'),'ucb_product','notes_49','purchase_token_12345',now());
select pg_temp.chk('Play settlement records one payment and entitlement',
  exists(select 1 from public.payments where purchase_token='purchase_token_12345' and provider='play'
    and razorpay_payment_id is null)
  and exists(select 1 from public.purchases where order_id=(select id from ucb_orders where kind='play2') and status='success'));
select pg_temp.chk('Play settlement replay is idempotent',
  (public.settle_play_purchase('c3000000-0000-0000-0000-000000000002',
    (select id from ucb_orders where kind='play2'),'ucb_product','notes_49','purchase_token_12345',now())->>'already_settled')='true'
  and (select count(*)=1 from public.payments where purchase_token='purchase_token_12345')
  and (select count(*)=1 from public.purchases where order_id=(select id from ucb_orders where kind='play2')));
select pg_temp.chk('wrong user cannot settle existing Play order',
  not pg_temp.try_play('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play2'),'purchase_token_other'));
insert into ucb_orders select public.create_play_order('c3000000-0000-0000-0000-000000000001','ucb_product')->>'order_id','play3';
select pg_temp.chk('purchase token cannot settle another order',
  not pg_temp.try_play('c3000000-0000-0000-0000-000000000001',
    (select id from ucb_orders where kind='play3'),'purchase_token_12345'));
select public.reverse_play_payment('purchase_token_12345');
select pg_temp.chk('Play refund revokes entitlement',
  (select status='refunded' from public.orders where id=(select id from ucb_orders where kind='play2'))
  and (select status='refunded' from public.purchases where order_id=(select id from ucb_orders where kind='play2')));
select public.reverse_play_payment('purchase_token_12345');
select pg_temp.chk('Play refund replay is idempotent',
  (select count(*)=1 from public.purchases where order_id=(select id from ucb_orders where kind='play2')));
select pg_temp.chk('settlement RPC unavailable to clients',
  not has_function_privilege('authenticated','public.settle_play_purchase(uuid,text,text,text,text,timestamptz)','execute')
  and not has_function_privilege('anon','public.settle_play_purchase(uuid,text,text,text,text,timestamptz)','execute')
  and not has_function_privilege('authenticated','public.reverse_play_payment(text)','execute'));
update public.app_config set value='18' where key='gst_rate_percent';
insert into auth.users(id,email) values('c3000000-0000-0000-0000-000000000003','ucb3@example.com');
update public.profiles set course_id='bams' where id='c3000000-0000-0000-0000-000000000003';
insert into ucb_orders select public.create_play_order('c3000000-0000-0000-0000-000000000003','ucb_product')->>'order_id','play4';
select pg_temp.chk('new orders snapshot configured inclusive GST',
  (select gst_rate_percent=18 and tax_pre_amount=41.53 and tax_amount=7.47
     from public.orders where id=(select id from ucb_orders where kind='play4')));
select pg_temp.chk('old order tax snapshot never recomputed',
  (select gst_rate_percent=0 and tax_pre_amount=49 and tax_amount=0
     from public.orders where id=(select id from ucb_orders where kind='razorpay')));
insert into public.ucb_external_refunds(refund_id,order_id,amount_paise,pre_tax_paise,refund_time,is_full)
values ('rfnd_ucb_one',(select id from ucb_orders where kind='razorpay'),100,100,now()-interval '1 minute',false),
       ('rfnd_ucb_two',(select id from ucb_orders where kind='razorpay'),200,200,now(),false);
select pg_temp.chk('later partial refund waits for first report',
  public.claim_ucb_external_refund('rfnd_ucb_two')->>'ok'='false');
select pg_temp.chk('first partial refund is claimed once',
  public.claim_ucb_external_refund('rfnd_ucb_one')->>'ok'='true'
  and public.claim_ucb_external_refund('rfnd_ucb_one')->>'ok'='false');
-- An older webhook may arrive after a later one has already claimed its row.
insert into public.ucb_external_refunds(refund_id,order_id,amount_paise,pre_tax_paise,refund_time,is_full)
values ('rfnd_ucb_older',(select id from ucb_orders where kind='razorpay'),50,50,now()-interval '2 minutes',false);
select pg_temp.chk('out-of-order older refund waits for in-flight report',
  public.claim_ucb_external_refund('rfnd_ucb_older')->>'ok'='false');
update public.ucb_external_refunds set status='reported' where refund_id='rfnd_ucb_one';
select pg_temp.chk('older refund can follow completed in-flight report',
  public.claim_ucb_external_refund('rfnd_ucb_older')->>'ok'='true');
update public.ucb_external_refunds set status='reported' where refund_id='rfnd_ucb_older';
select pg_temp.chk('second partial refund becomes claimable',
  public.claim_ucb_external_refund('rfnd_ucb_two')->>'ok'='true');
select pg_temp.chk('refund claim RPC unavailable to clients',
  not has_function_privilege('authenticated','public.claim_ucb_external_refund(text)','execute')
  and not has_table_privilege('authenticated','public.ucb_external_refunds','INSERT'));
select pg_temp.chk('F07 durable void cursor and backlog metric exist',
  to_regclass('public.play_void_sweep_state') is not null
  and to_regclass('public.play_void_sweep_metrics') is not null);
select pg_temp.chk('F07 void sweep lease excludes a concurrent worker',
  public.claim_play_void_sweep()->>'ok'='true'
  and public.claim_play_void_sweep()->>'code'='busy');
update public.play_void_sweep_state set lease_id=null,lease_until=null where id=true;
select pg_temp.chk('F07 released cursor can be resumed',
  public.claim_play_void_sweep()->>'ok'='true');
\o
select case when ok then 'PASS ' else 'FAIL ' end || name from ucb_results;
select count(*) filter(where not ok) || ' FAIL, ' || count(*) filter(where ok) || ' PASS' from ucb_results;
rollback;
