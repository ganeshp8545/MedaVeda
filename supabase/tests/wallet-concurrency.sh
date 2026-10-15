#!/usr/bin/env bash
set -euo pipefail
: "${TEMPLATE_DB:?scratch database required}"
P=(psql -X -q -At -v ON_ERROR_STOP=1 -d "$TEMPLATE_DB")
uid='c4000000-0000-0000-0000-000000000001'
"${P[@]}" <<SQL >/dev/null
insert into auth.users(id,email) values ('$uid','wallet-race@example.invalid');
update public.referral_settings set enabled=true,wallet_max_percent=50 where id=true;
update public.profiles set course_id='bams' where id='$uid';
insert into public.products(id,title,scope,price,chapter_id,active,product_type,course_id)
select 'wallet_race_'||n,'Wallet race '||n,'chapter',500,'seed_c',true,'notes','bams' from generate_series(1,3) n;
insert into public.wallet_ledger(user_id,entry_type,status,amount,source,note)
values ('$uid','credit','available',500,'admin_adjustment','local concurrency fixture');
create table public.wallet_race_orders(n integer primary key,id text,razorpay_id text);
insert into public.wallet_race_orders(n,id,razorpay_id)
select n, public.create_priced_order('$uid','wallet_race_'||n,true)->>'order_id', 'order_wallet_race_'||n
from generate_series(1,3) n;
update public.orders o set razorpay_order_id=r.razorpay_id from public.wallet_race_orders r where o.id=r.id;
SQL
priced=$("${P[@]}" -c "select string_agg(o.wallet_amount::text,',' order by r.n) from public.wallet_race_orders r join public.orders o on o.id=r.id")
if [ "$priced" != '250.00,250.00,250.00' ]; then echo "FAIL F01 fixture priced $priced instead of three 250 wallet discounts"; exit 1; fi
# Two independent PostgreSQL connections enter settlement in parallel.
settle_one() {
  local n=$1
  "${P[@]}" -c "select public.settle_razorpay_payment('evt_wallet_race_$n','order_wallet_race_$n','pay_wallet_race_$n',(select round(amount*100)::bigint from public.orders where razorpay_order_id='order_wallet_race_$n'),now())" >/tmp/medveda_wallet_race_$n.out 2>&1
}
settle_one 1 & p1=$!
settle_one 2 & p2=$!
wait "$p1" || true
wait "$p2" || true
settle_one 3 || true
read -r granted debited shortfall <<< "$("${P[@]}" -F ' ' -c "select count(*) filter(where p.status='success'), coalesce((select sum(amount) from public.wallet_ledger where user_id='$uid' and entry_type='debit'),0), count(*) filter(where f.reason='wallet_shortfall') from public.wallet_race_orders r left join public.purchases p on p.order_id=r.id left join public.order_review_flags f on f.order_id=r.id")"
if [ "$granted" = 3 ] && [ "$debited" = 500.00 ] && [ "$shortfall" = 1 ]; then
  echo 'FAIL F01 three orders granted with 500 wallet debit and 250 shortfall (two independent settlement sessions)'
  exit 1
fi
if [ "$granted" = 2 ] && [ "$debited" = 500.00 ] && [ "$shortfall" = 0 ]; then
  echo 'PASS F01 no underfunded grant across independent settlement sessions'
else
  echo "FAIL F01 unexpected wallet outcome grants=$granted debits=$debited shortfalls=$shortfall"
  exit 1
fi
"${P[@]}" <<'SQL' >/dev/null
insert into auth.users(id,email) values ('c4000000-0000-0000-0000-000000000002','wallet-release@example.invalid');
update public.profiles set course_id='bams' where id='c4000000-0000-0000-0000-000000000002';
insert into public.wallet_ledger(user_id,entry_type,status,amount,source,note)
values ('c4000000-0000-0000-0000-000000000002','credit','available',500,'admin_adjustment','local release fixture');
create table public.wallet_release_orders(kind text,id text);
insert into public.wallet_release_orders values ('failed',
  public.create_priced_order('c4000000-0000-0000-0000-000000000002','wallet_race_1',true)->>'order_id');
update public.orders set status='failed' where id=(select id from public.wallet_release_orders where kind='failed');
insert into public.wallet_release_orders values ('expired',
  public.create_priced_order('c4000000-0000-0000-0000-000000000002','wallet_race_2',true)->>'order_id');
update public.wallet_order_reservations set expires_at=now()-interval '1 second'
where order_id=(select id from public.wallet_release_orders where kind='expired');
SQL
released=$("${P[@]}" -c "select count(*) from public.wallet_order_reservations r join public.wallet_release_orders x on x.id=r.order_id join public.orders o on o.id=r.order_id where o.status='created' and r.expires_at>now()")
if [ "$released" = 0 ]; then echo 'PASS F01 failure and expiry release wallet reservations';
else echo "FAIL F01 wallet reservations retained after failure or expiry: $released"; exit 1; fi
