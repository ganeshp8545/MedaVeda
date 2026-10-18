const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const db = `ap_cron_${process.pid}`;
const root = path.resolve(__dirname, '../..');
// Use the same PostgreSQL connection as the rest of the SQL suites. A fixed
// test port made this selftest fail against a healthy local cluster.
const env = { ...process.env, PGHOST: process.env.PGHOST || '127.0.0.1',
  PGPORT: process.env.PGPORT || '5432', PGUSER: process.env.PGUSER || 'postgres' };
function sql(database, source) {
  const result = spawnSync('psql', ['-X','-q','-At','-v','ON_ERROR_STOP=1','-d',database,'-c',source], { env, encoding:'utf8' });
  return result;
}
function setup() {
  return spawnSync('psql', ['-X','-q','-v','ON_ERROR_STOP=1','-d',db,'-f',path.join(root,'supabase/ucb_cron_setup.sql')], { env, encoding:'utf8' });
}
function must(result, label) { if (result.status !== 0) throw new Error(`${label}: ${result.stderr}`); }
must(sql('postgres',`create database ${db}`),'create scratch database');
try {
  must(sql(db, `create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
    create schema cron; create table cron.job(jobid bigserial, jobname text, schedule text, active boolean);
    create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint
      language plpgsql as $$ declare v_id bigint; begin
        insert into cron.job(jobname,schedule,active) values(p_name,p_schedule,true) returning jobid into v_id;
        return v_id; end $$;
    create function cron.unschedule(p_jobid bigint) returns boolean language plpgsql as $$ begin
      delete from cron.job where jobid=p_jobid; return true; end $$;
    create schema net; create function net.http_post(text,jsonb,jsonb,jsonb,integer) returns bigint language sql as 'select 1::bigint';`),'create isolated extension stubs');
  const cases = [
    ['missing both',[]],
    ['blank URL', [['ucb_project_url',' '],['ucb_report_cron_secret','x'.repeat(32)]]],
    ['blank secret', [['ucb_project_url','https://example.supabase.co'],['ucb_report_cron_secret',' ']]],
    ['invalid URL', [['ucb_project_url','http://example.supabase.co'],['ucb_report_cron_secret','x'.repeat(32)]]],
    ['short secret', [['ucb_project_url','https://example.supabase.co'],['ucb_report_cron_secret','short']]],
    ['duplicate URL rows', [['ucb_project_url','https://example.supabase.co'],
      ['ucb_project_url','https://other.supabase.co'],['ucb_report_cron_secret','x'.repeat(32)]]],
    ['duplicate secret rows', [['ucb_project_url','https://example.supabase.co'],
      ['ucb_report_cron_secret','x'.repeat(32)],['ucb_report_cron_secret','y'.repeat(32)]]],
  ];
  for (const [name, rows] of cases) {
    let query = 'truncate vault.decrypted_secrets;';
    for (const [key,value] of rows) query += `insert into vault.decrypted_secrets values ('${key}','${value}');`;
    must(sql(db,query),`fixture ${name}`);
    if (setup().status === 0 || sql(db,'select count(*) from cron.job').stdout.trim() !== '0')
      throw new Error(`F08 ${name}: accepted invalid Vault configuration or scheduled a job`);
    console.log(`PASS F08 rejects ${name}`);
  }
  must(sql(db,`truncate vault.decrypted_secrets; insert into vault.decrypted_secrets values ('ucb_project_url','https://example.supabase.co'),('ucb_report_cron_secret','${'x'.repeat(32)}');`),'valid fixture');
  must(setup(),'valid configuration');
  if (sql(db,'select count(*) from cron.job').stdout.trim() !== '6')
    throw new Error('F08 valid Vault configuration did not schedule six jobs');
  console.log('PASS F08 accepts valid configuration');
} finally { sql('postgres',`drop database if exists ${db} with (force)`); }
