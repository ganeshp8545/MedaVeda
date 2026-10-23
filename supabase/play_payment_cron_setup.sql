-- REVIEW ONLY: do not execute until the Play migration, function, secrets,
-- monitoring and release gates have been verified. This file enables cron if run.
-- Target project: xbvenkfmesugrbjuufyw. Vault: PLAY_PAYMENT_CRON_SECRET.
-- Edge: PLAY_PAYMENT_CRON_SECRET must match the Vault secret.
do $setup$
declare v_secret text; v_count integer;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
    or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
    or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'pg_cron, pg_net and Vault are required';
  end if;
  select count(*),max(decrypted_secret) into v_count,v_secret
    from vault.decrypted_secrets where name='PLAY_PAYMENT_CRON_SECRET';
  if v_count<>1 or length(v_secret)<32 then
    raise exception 'PLAY_PAYMENT_CRON_SECRET missing or invalid';
  end if;
  perform cron.schedule('play-consume','* * * * *', $job$
    select net.http_post(
      url:='https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/play-payment-worker',
      body:=jsonb_build_object('phase','consume'),
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-play-payment-cron-secret',(select decrypted_secret from vault.decrypted_secrets
          where name='PLAY_PAYMENT_CRON_SECRET')),
      timeout_milliseconds:=90000);
  $job$);
  perform cron.schedule('play-reconcile','* * * * *', $job$
    select net.http_post(
      url:='https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/play-payment-worker',
      body:=jsonb_build_object('phase','reconcile'),
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-play-payment-cron-secret',(select decrypted_secret from vault.decrypted_secrets
          where name='PLAY_PAYMENT_CRON_SECRET')),
      timeout_milliseconds:=90000);
  $job$);
  perform cron.schedule('play-voids','* * * * *', $job$
    select net.http_post(
      url:='https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/play-payment-worker',
      body:=jsonb_build_object('phase','voids'),
      headers:=jsonb_build_object('Content-Type','application/json',
        'x-play-payment-cron-secret',(select decrypted_secret from vault.decrypted_secrets
          where name='PLAY_PAYMENT_CRON_SECRET')),
      timeout_milliseconds:=90000);
  $job$);
end $setup$;
