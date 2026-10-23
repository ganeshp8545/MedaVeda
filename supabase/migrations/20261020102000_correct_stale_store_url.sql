-- MOB-02: preserve valid/custom URLs, missing rows and the current package.
-- Match the Play host/path and exact id parameter, including reordered params.
begin;
update public.app_config
set value = regexp_replace(value,
  '([?&]id=)com\.(medveda|ayurpulse)\.app(&|$)',
  '\1in.medveda.app\3')
where key = 'store_url'
  and value ~ '^https://play\.google\.com/store/apps/details\?'
  and value ~ '[?&]id=com\.(medveda|ayurpulse)\.app(&|$)';
commit;

-- Rollback: no automatic rollback to a broken package. If needed, restore only
-- the previously reviewed value from a pre-migration snapshot for this key.
