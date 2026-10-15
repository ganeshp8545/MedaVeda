-- Run in the hosted Supabase SQL Editor AFTER enabling pg_cron, pg_net and Vault,
-- deploying report-external-transaction, and creating two Vault secrets:
--   ucb_project_url         https://<project-ref>.supabase.co
--   ucb_report_cron_secret  same random 32+ character value as the Edge secret
--                          UCB_REPORT_CRON_SECRET
-- No secret value is stored in this job command; Vault resolves it at runtime.
-- Re-run after changing the URL or secret. Check cron.job and cron.job_run_details.
-- Independent minute jobs keep a slow provider call from starving another queue.
do $setup$
declare v_url text; v_secret text; v_phase text; v_url_count integer; v_secret_count integer;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable pg_cron, pg_net and Vault before scheduling UCB retries';
  end if;
  select count(*), max(decrypted_secret) into v_url_count, v_url
    from vault.decrypted_secrets where name='ucb_project_url';
  select count(*), max(decrypted_secret) into v_secret_count, v_secret
    from vault.decrypted_secrets where name='ucb_report_cron_secret';
  if v_url_count <> 1 or v_secret_count <> 1
     or v_url is null or btrim(v_url) = ''
     or v_secret is null or btrim(v_secret) = ''
     or v_url !~ '^https://[a-z0-9-]+\.supabase\.co/?$'
     or length(v_secret) < 32 then
    raise exception 'Vault ucb_project_url or ucb_report_cron_secret is missing/invalid';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname='ucb-report-sweep';
  foreach v_phase in array array['reports','refunds','consume','reconcile','compensate','events'] loop
    perform cron.schedule('ucb-' || v_phase, '* * * * *', format($job$
      select net.http_post(
        url := rtrim((select decrypted_secret from vault.decrypted_secrets where name='ucb_project_url'),'/')
               || '/functions/v1/report-external-transaction',
        body := jsonb_build_object('phase',%L),
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-ucb-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='ucb_report_cron_secret')),
        timeout_milliseconds := 90000);
    $job$,v_phase));
  end loop;
end;
$setup$;

select jobid,jobname,schedule,active from cron.job where jobname like 'ucb-%';
