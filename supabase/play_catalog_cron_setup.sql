-- REVIEW ONLY. Execute only after the owner approves the reviewed migration,
-- Google permissions, Edge Function deployment, and secret provisioning.
-- Target project: xbvenkfmesugrbjuufyw. Vault secret: PLAY_CATALOG_CRON_SECRET.
-- Edge secret PLAY_CATALOG_CRON_SECRET must match the Vault value.
do $setup$
declare v_secret text; v_count integer;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'pg_cron, pg_net and Vault are required';
  end if;
  select count(*),max(decrypted_secret) into v_count,v_secret
    from vault.decrypted_secrets where name='PLAY_CATALOG_CRON_SECRET';
  if v_count<>1 or length(v_secret)<32 then
    raise exception 'PLAY_CATALOG_CRON_SECRET missing or invalid';
  end if;
  perform cron.schedule('play-catalog-sync','* * * * *', $job$
    select net.http_post(
      url:='https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/sync-play-catalog',
      body:='{}'::jsonb,
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-play-catalog-cron-secret',(select decrypted_secret from vault.decrypted_secrets
          where name='PLAY_CATALOG_CRON_SECRET')),
      timeout_milliseconds:=90000);
  $job$);
end $setup$;
