-- Existing project xbvenkfmesugrbjuufyw ONLY. No writes; no user rows or secrets.
-- Use psql -X -v ON_ERROR_STOP=1 with a read-only operator connection.
begin transaction read only;
set local statement_timeout = '15s';
select current_database(), version(), pg_size_pretty(pg_database_size(current_database())) as database_size;
select version from supabase_migrations.schema_migrations order by version;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
  and table_name in ('notes','quiz_tests','verified_quiz_attempts','note_upload_requests','note_pdf_validation_jobs')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.proconfig,p.proacl,
  md5(pg_get_functiondef(p.oid)) as definition_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('am_i_admin','submit_quiz_attempt','save_note_with_upload','user_can_access_note','settle_play_purchase');
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
select bucket_id,count(*) as object_count from storage.objects group by bucket_id;
select relname,n_live_tup,n_dead_tup,last_analyze,last_autoanalyze
from pg_stat_user_tables where schemaname='public' order by relname;
select c.relname,l.mode,l.granted from pg_locks l join pg_class c on c.oid=l.relation
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';
select table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('notes','quiz_tests','verified_quiz_attempts','note_upload_requests','note_pdf_validation_jobs')
order by table_name,grantee,privilege_type;
commit;
-- Database size is NOT available disk quota. Capture quota/free space, backups,
-- restore drill, function deployments and cron executions from operator console.
-- After the ledger migration, also run note_upload_reconciliation_readonly.sql.
