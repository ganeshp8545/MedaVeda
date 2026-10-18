const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const db = `ap_play_cron_${process.pid}`;
const env = { ...process.env, PGHOST: process.env.PGHOST || '127.0.0.1',
  PGPORT: process.env.PGPORT || '5432', PGUSER: process.env.PGUSER || 'postgres' };
const files = ['play_catalog_cron_setup.sql', 'play_payment_cron_setup.sql'];
function psql(database, args, input) {
  return spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args],
    { env, input, encoding: 'utf8' });
}
function must(result, label) {
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr}`);
  return result.stdout.trim();
}
function query(sql) { return must(psql(db, ['-c', sql]), 'SQL query'); }
function install() {
  for (const file of files) must(psql(db, ['-f', path.join(root, 'supabase', file)]), file);
}

must(psql('postgres', ['-c', `create database ${db}`]), 'create scratch database');
try {
  query(`create schema vault;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create schema cron;
    create table cron.job (jobid bigserial primary key, jobname text unique,
      schedule text, command text, active boolean default true);
    create function cron.schedule(p_name text, p_schedule text, p_command text)
      returns bigint language plpgsql as $$ declare v_id bigint; begin
        insert into cron.job(jobname,schedule,command) values(p_name,p_schedule,p_command)
          on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
          returning jobid into v_id;
        return v_id;
      end $$;
    create schema net;
    create table net.requests (url text, body jsonb, headers jsonb, timeout_ms integer);
    create function net.http_post(url text, body jsonb default '{}'::jsonb,
      params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
      timeout_milliseconds integer default 5000)
      returns bigint language plpgsql as $$ begin
        insert into net.requests values(url,body,headers,timeout_milliseconds);
        return 1;
      end $$;`);
  // Never print the fixture value; test that the stored job commands contain
  // Vault lookups rather than resolved authentication headers.
  const catalogFixture = 'catalog_fixture_' + 'x'.repeat(40);
  const paymentFixture = 'payment_fixture_' + 'y'.repeat(40);
  query(`insert into vault.decrypted_secrets values
    ('PLAY_CATALOG_CRON_SECRET','${catalogFixture}'),
    ('PLAY_PAYMENT_CRON_SECRET','${paymentFixture}');`);
  install();
  const initial = query(`select string_agg(jobname || ':' || jobid, ',' order by jobname)
    from cron.job`);
  install();
  const repeated = query(`select string_agg(jobname || ':' || jobid, ',' order by jobname)
    from cron.job`);
  if (initial !== repeated || initial.split(',').length !== 4)
    throw new Error('Expected four stable named jobs after repeat installation');
  const contracts = [
    ['play-catalog-sync', 'sync-play-catalog', 'PLAY_CATALOG_CRON_SECRET',
      'x-play-catalog-cron-secret', null],
    ['play-consume', 'play-payment-worker', 'PLAY_PAYMENT_CRON_SECRET',
      'x-play-payment-cron-secret', 'consume'],
    ['play-reconcile', 'play-payment-worker', 'PLAY_PAYMENT_CRON_SECRET',
      'x-play-payment-cron-secret', 'reconcile'],
    ['play-voids', 'play-payment-worker', 'PLAY_PAYMENT_CRON_SECRET',
      'x-play-payment-cron-secret', 'voids'],
  ];
  for (const [name, endpoint, secretName, header, phase] of contracts) {
    const command = query(`select command from cron.job where jobname='${name}'`);
    if (!command.includes(`https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/${endpoint}`) ||
        !command.includes(`where name='${secretName}'`) || !command.includes(`'${header}'`) ||
        !command.includes('net.http_post') || !command.includes('90000') ||
        (phase && !command.includes(`'phase','${phase}'`)) ||
        command.includes(catalogFixture) || command.includes(paymentFixture))
      throw new Error(`Invalid or unsafe job ${name}`);
    const schedule = query(`select schedule from cron.job where jobname='${name}'`);
    if (schedule !== '* * * * *') throw new Error(`Unexpected interval for ${name}`);
    must(psql(db, ['-c', command]), `execute ${name} locally`);
  }
  if (query(`select count(*) from net.requests where
    url like 'https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/%'
    and headers->>'Content-Type'='application/json'
    and coalesce(headers->>'x-play-catalog-cron-secret',
                 headers->>'x-play-payment-cron-secret')=(
      select decrypted_secret from vault.decrypted_secrets
      where name=case when url like '%/sync-play-catalog'
        then 'PLAY_CATALOG_CRON_SECRET' else 'PLAY_PAYMENT_CRON_SECRET' end)
    and timeout_ms=90000
    and (url like '%/sync-play-catalog' and body='{}'::jsonb
      or url like '%/play-payment-worker' and body->>'phase' in
        ('consume','reconcile','voids'))`) !== '4')
    throw new Error('Local requests did not match the Vault-backed POST contract');
  query(`insert into vault.decrypted_secrets values
    ('PLAY_CATALOG_CRON_SECRET','${catalogFixture}')`);
  if (psql(db, ['-f', path.join(root, 'supabase', files[0])]).status === 0 ||
      query('select count(*) from cron.job') !== '4')
    throw new Error('Duplicate catalog secret was accepted');
  query(`delete from vault.decrypted_secrets where ctid in
    (select ctid from vault.decrypted_secrets where name='PLAY_CATALOG_CRON_SECRET'
      limit 1)`);
  query(`update vault.decrypted_secrets set decrypted_secret='short'
    where name='PLAY_CATALOG_CRON_SECRET'`);
  if (psql(db, ['-f', path.join(root, 'supabase', files[0])]).status === 0 ||
      query('select count(*) from cron.job') !== '4')
    throw new Error('Invalid catalog secret was accepted');
  query(`update vault.decrypted_secrets set decrypted_secret='short'
    where name='PLAY_PAYMENT_CRON_SECRET'`);
  if (psql(db, ['-f', path.join(root, 'supabase', files[1])]).status === 0 ||
      query('select count(*) from cron.job') !== '4')
    throw new Error('Invalid payment secret was accepted');
  console.log('PASS Play Cron configuration, idempotency, authentication, and secret safety');
} finally {
  psql('postgres', ['-c', `drop database if exists ${db} with (force)`]);
}
