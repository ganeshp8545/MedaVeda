#!/usr/bin/env bash
# Disposable PostgreSQL migration test. Uses PGHOST/PGPORT/PGUSER/PGPASSWORD.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
db="ap_play_legacy_$$"
export PGHOST=${PGHOST:-127.0.0.1} PGPORT=${PGPORT:-5432} PGUSER=${PGUSER:-postgres}
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db"
trap 'psql -X -q -d postgres -c "drop database if exists \"$db\" with (force)" >/dev/null 2>&1' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/support/supabase_stub.sql" >/dev/null
for migration in "$root"/supabase/migrations/*.sql; do
  name=$(basename "$migration")
  [[ "$name" =~ ^[0-9]{8,14}_ ]] || continue
  # These unrelated, not-yet-approved payment migrations are excluded from
  # this curated Play migration test, as in the prior catalog SQL QA.
  [[ "$name" == 20261014100000_* || "$name" == 20261014110000_* ]] && continue
  if [[ "$name" == 20261016100000_* ]]; then
    psql -X -q -v ON_ERROR_STOP=1 -d "$db" <<'SQL' >/dev/null
insert into public.years(id,title,course_id) values ('qa_old_y','Old year','bams');
insert into public.subjects(id,title,year_id) values ('qa_old_s','Old subject','qa_old_y');
insert into public.chapters(id,title,subject_id) values ('qa_old_c','Old chapter','qa_old_s');
insert into public.chapters(id,title,subject_id) values ('qa_old_empty_c','Testing chapter','qa_old_s');
insert into public.notes(id,title,pdf_url,chapter_id,is_free_preview)
  values ('qa_old_n','Paid PDF','qa-old.pdf','qa_old_c',false);
insert into public.products(id,title,scope,price,active,chapter_id,course_id,product_type)
  values ('qa_old_other','Unclassified legacy','chapter',201.25,true,'qa_old_c','bams','other'),
         ('qa_old_testing','Testing legacy','chapter',202.50,true,'qa_old_empty_c','bams','other');
SQL
  fi
  psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$migration" >/dev/null
done
psql -X -q -v ON_ERROR_STOP=1 -d "$db" <<'SQL' >/dev/null
do $$ begin
  assert (select count(*)=2 from public.products where id in ('qa_old_other','qa_old_testing')
    and active and product_type='other' and price in (201.25,202.50)),
    'legacy products changed during migration';
  assert not exists(select 1 from public.play_price_sync where price_inr in (201.25,202.50)),
    'legacy products were queued for Play';
  assert (select count(*)=0 from public.play_price_tiers where price_inr in (201.25,202.50)),
    'legacy Play tiers were created';
  assert to_regclass('public.play_payment_jobs_order_id_idx') is not null,
    'order_id-only payment job index missing';
end $$;
SQL
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/support/seed.sql" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/play_catalog_sync_checks.sql" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/play_payment_pg_checks.sql" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/play_entitlement_snapshot_checks.sql" >/dev/null
echo 'PASS preexisting legacy migration, catalog, payment, and entitlement SQL checks'
