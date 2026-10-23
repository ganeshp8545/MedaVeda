-- Review-only post-migration validation. NOT executed by the offline self-test.
-- Run only in an expressly authorized isolated database after reviewing migrations.
begin read only;
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = 'notes_read_if_purchased') then
    raise exception 'SEC-02: legacy direct student read policy still exists';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage'
      and tablename = 'objects' and policyname = 'notes_service_reads_only'
      and permissive = 'RESTRICTIVE' and cmd = 'SELECT'
      and roles = array['public']::name[]
      and qual like '%bucket_id%<>%notes%am_i_admin%') then
    raise exception 'SEC-02: restrictive notes SELECT guard is missing or unexpected';
  end if;
  if not exists (select 1 from storage.buckets where id = 'notes' and not public) then
    raise exception 'SEC-02: notes bucket must exist and be private';
  end if;
  if public.get_maintenance_mode() is distinct from
      coalesce((select maintenance_mode from public.app_settings where id = 1), false) then
    raise exception 'MOB-01: public flag differs from existing setting';
  end if;
  if not has_function_privilege('anon', 'public.get_maintenance_mode()', 'execute')
      or not has_function_privilege('authenticated', 'public.get_maintenance_mode()', 'execute') then
    raise exception 'MOB-01: required RPC grants missing';
  end if;
  if exists (select 1 from public.app_config where key = 'store_url'
      and value ~ '^https://play\.google\.com/store/apps/details\?'
      and value ~ '[?&]id=com\.(medveda|ayurpulse)\.app(&|$)') then
    raise exception 'MOB-02: stale Play package remains';
  end if;
end $$;
-- Inventory the complete policy composition for review, including ALL policies.
select policyname, permissive, roles, cmd, qual
from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and cmd in ('SELECT', 'ALL') order by policyname;
rollback;
