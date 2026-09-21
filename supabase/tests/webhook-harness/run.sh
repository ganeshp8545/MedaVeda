#!/usr/bin/env bash
# usage: supabase/tests/webhook-harness/run.sh   (needs the scratch Postgres on :54329 with all migrations applied to a DB named by TEMPLATE_DB)
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
P="psql -h 127.0.0.1 -p 54329 -U postgres -w -At"
TEMPLATE_DB=${TEMPLATE_DB:-ap_b1}; export WH_DB=ap_wh
$P -d postgres -c "drop database if exists $WH_DB" -c "create database $WH_DB template $TEMPLATE_DB" >/dev/null
$P -d $WH_DB -q <<'SQL' >/dev/null
insert into auth.users(id,email) values ('b4000000-0000-0000-0000-000000000001','wh@example.com');
insert into public.years(id,title,course_id) values ('wh_y','y','bams');
insert into public.subjects(id,title,year_id) values ('wh_s','s','wh_y');
insert into public.chapters(id,title,subject_id) values ('wh_c','c','wh_s');
insert into public.notes(id,title,pdf_url,chapter_id) values ('wh_note','n','https://x/wh.pdf','wh_c');
insert into public.products(id,title,scope,price,chapter_id,active,product_type) values ('wh_p','p','chapter',500,'wh_c',true,'notes');
do $$ declare r jsonb; o public.orders%rowtype; begin
  r := public.create_priced_order('b4000000-0000-0000-0000-000000000001','wh_p',false);
  update public.orders set razorpay_order_id='order_whtest' where id=r->>'order_id';
  select * into o from public.orders where id=r->>'order_id';
  perform public.grant_razorpay_payment('evt_seed','order_whtest','pay_WhTest0001',round(o.amount*100)::bigint);
end $$;
SQL
S=$(mktemp -d); mkdir -p "$S/_shared" "$S/razorpay-webhook"
cp "$root/supabase/functions/_shared/settle.ts" "$S/_shared/"
cp "$root/supabase/tests/webhook-harness/supabaseAdmin.mock.ts" "$S/_shared/supabaseAdmin.ts"
cp "$root/supabase/tests/webhook-harness/razorpay.mock.ts" "$S/_shared/razorpay.ts"
cp "$root/supabase/functions/razorpay-webhook/index.ts" "$S/razorpay-webhook/"
cp "$root/supabase/tests/webhook-harness/run.mjs" "$S/"
cd "$S" && node --experimental-strip-types --no-warnings run.mjs
