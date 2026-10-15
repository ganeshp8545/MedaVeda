#!/usr/bin/env bash
set -euo pipefail
: "${TEMPLATE_DB:?scratch database required}"
P=(psql -X -q -At -v ON_ERROR_STOP=1 -d "$TEMPLATE_DB")
buyer='c8000000-0000-0000-0000-000000000002'
referrer='c8000000-0000-0000-0000-000000000001'
"${P[@]}" <<SQL >/dev/null
insert into auth.users(id,email) values ('$referrer','discount-referrer@example.invalid'),('$buyer','discount-buyer@example.invalid');
update public.profiles set course_id='bams' where id in ('$referrer','$buyer');
update public.referral_settings set enabled=true,friend_discount_percent=10,friend_discount_max=100,require_verified_phone=false where id=true;
insert into public.referrals(referrer_id,referred_id,code_used,status) values ('$referrer','$buyer','RACE','pending');
insert into public.products(id,title,scope,price,chapter_id,active,product_type,course_id)
values ('discount_race_1','Race 1','chapter',500,'seed_c',true,'notes','bams'),
       ('discount_race_2','Race 2','chapter',500,'seed_c',true,'notes','bams');
create table public.discount_race_orders(n integer primary key,id text);
SQL
create_one() {
  local n=$1
  "${P[@]}" -c "with r as (select public.create_priced_order('$buyer','discount_race_$n',false) as j)
    insert into public.discount_race_orders(n,id) select $n,j->>'order_id' from r" >/tmp/medveda_discount_race_$n.out 2>&1
}
create_one 1 & p1=$!
create_one 2 & p2=$!
wait "$p1"; wait "$p2"
"${P[@]}" -c "update public.orders o set razorpay_order_id='order_discount_race_'||r.n
  from public.discount_race_orders r where o.id=r.id" >/dev/null
priced=$("${P[@]}" -c "select string_agg(o.referral_discount::text,',' order by o.referral_discount)
  from public.discount_race_orders r join public.orders o on o.id=r.id")
if [ "$priced" != '0.00,50.00' ]; then echo "FAIL F02 concurrent orders priced $priced"; exit 1; fi
"${P[@]}" -c "select public.settle_razorpay_payment('evt_discount_live',razorpay_order_id,
  'pay_discount_live',round(amount*100)::bigint,now()) from public.orders
  where id=(select o.id from public.orders o join public.discount_race_orders r on r.id=o.id where o.status='created')" >/dev/null
"${P[@]}" -c "select public.settle_razorpay_payment('evt_discount_stale',razorpay_order_id,
  'pay_discount_stale',round(amount*100)::bigint,now()) from public.orders
  where id=(select o.id from public.orders o join public.discount_race_orders r on r.id=o.id where o.referral_discount>0)" >/dev/null
read -r grants discounted compensations <<< "$("${P[@]}" -F ' ' -c "select
  (select count(*) from public.purchases p join public.orders o on o.id=p.order_id where o.user_id='$buyer' and p.status='success'),
  (select count(*) from public.purchases p join public.orders o on o.id=p.order_id where o.user_id='$buyer' and p.status='success' and o.referral_discount>0),
  (select count(*) from public.payment_compensations c join public.orders o on o.id=c.order_id where o.user_id='$buyer' and c.reason='stale_discount')")"
if [ "$grants" = 1 ] && [ "$discounted" = 0 ] && [ "$compensations" = 1 ]; then
  echo 'PASS F02 concurrent orders reserve one discount; stale discounted capture is compensated without access'
else
  echo "FAIL F02 grants=$grants discounted=$discounted compensations=$compensations"; exit 1
fi
