#!/usr/bin/env bash
set -euo pipefail
: "${TEMPLATE_DB:?scratch database required}"
P=(psql -X -q -At -v ON_ERROR_STOP=1 -d "$TEMPLATE_DB")
"${P[@]}" <<'SQL' >/dev/null
insert into auth.users(id,email) values
 ('c5000000-0000-0000-0000-000000000001','play-race-1@example.invalid'),
 ('c5000000-0000-0000-0000-000000000002','play-race-2@example.invalid'),
 ('c5000000-0000-0000-0000-000000000003','razorpay-race@example.invalid');
update public.profiles set course_id='bams' where id::text like 'c5000000-%';
insert into public.play_price_tiers(price_inr,play_sku,active) values(49,'notes_49',true);
create table public.payment_race_orders(kind text,order_id text);
insert into public.payment_race_orders values
 ('play1',public.create_play_order('c5000000-0000-0000-0000-000000000001','seed_product')->>'order_id'),
 ('play2',public.create_play_order('c5000000-0000-0000-0000-000000000002','seed_product')->>'order_id'),
 ('razorpay',public.create_priced_order('c5000000-0000-0000-0000-000000000003','seed_product',false)->>'order_id');
update public.orders set razorpay_order_id='order_payment_race' where id=(select order_id from public.payment_race_orders where kind='razorpay');
SQL
play_settle() {
  local n=$1
  "${P[@]}" -c "select public.settle_play_purchase('c5000000-0000-0000-0000-00000000000$n',(select order_id from public.payment_race_orders where kind='play$n'),'seed_product','notes_49','shared_play_token_race_123',now())" >/tmp/medveda_play_race_$n.out 2>&1
}
play_settle 1 & p1=$!
play_settle 2 & p2=$!
wait "$p1" || true
wait "$p2" || true
play_count=$("${P[@]}" -c "select count(*) from public.payments where purchase_token='shared_play_token_race_123'")
play_grants=$("${P[@]}" -c "select count(*) from public.purchases where order_id in (select order_id from public.payment_race_orders where kind like 'play%') and status='success'")
if [ "$play_count" = 1 ] && [ "$play_grants" = 1 ]; then echo 'PASS F10 parallel Play token settlements grant once';
else echo "FAIL F10 parallel Play token settlements payments=$play_count grants=$play_grants"; exit 1; fi
razor_settle() {
  local route=$1
  "${P[@]}" -c "select public.settle_razorpay_payment('evt_$route','order_payment_race','pay_payment_race_123',4900,now())" >/tmp/medveda_razor_race_$route.out 2>&1
}
razor_settle webhook & p1=$!
razor_settle client & p2=$!
wait "$p1" || true
wait "$p2" || true
razor_count=$("${P[@]}" -c "select count(*) from public.payments where razorpay_payment_id='pay_payment_race_123'")
razor_grants=$("${P[@]}" -c "select count(*) from public.purchases where order_id=(select order_id from public.payment_race_orders where kind='razorpay') and status='success'")
if [ "$razor_count" = 1 ] && [ "$razor_grants" = 1 ]; then echo 'PASS F10 parallel webhook/client Razorpay settlement grants once';
else echo "FAIL F10 parallel Razorpay settlement payments=$razor_count grants=$razor_grants"; exit 1; fi
