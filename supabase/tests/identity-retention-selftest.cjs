// Source/model checks only. Does not connect to or write any database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sql = read('supabase/migrations/20261020103000_first_purchase_identity_retention.sql');
const executable = sql.replace(/--[^\n]*/g, '');
assert.match(executable, /delete from public\.first_purchase_identities\s+where first_purchase_at < now\(\) - interval '180 days'/i);
assert.match(executable, /security definer\s+set search_path = public/i);
assert.match(executable, /revoke all on function public\.purge_expired_first_purchase_identities\(\) from public, anon, authenticated/i);
assert.match(executable, /grant execute on function public\.purge_expired_first_purchase_identities\(\) to service_role/i);
assert.doesNotMatch(executable, /cron\.|create extension|update public\.|alter table|create_priced_order|quote_my_order|record_purchase_identity|has_prior_purchase_identity/i);
assert.equal((executable.match(/delete from/gi) || []).length, 1);
assert.doesNotMatch(executable, /select public\.purge_expired_first_purchase_identities\(/i);
const cutoff = Date.UTC(2026, 9, 20) - 180 * 86400000;
const rows = [
  { identity_hash: 'expired', account_id: 'deleted-account', first_purchase_at: cutoff - 1 },
  { identity_hash: 'boundary', account_id: 'old-account', first_purchase_at: cutoff },
  { identity_hash: 'recent', account_id: 'old-account', first_purchase_at: cutoff + 1 },
];
// Mirror the existing <> account guard and fixed cutoff; no payment RPC is replaced.
const prior = (records, hash, uid) => records.some(row => row.identity_hash === hash && row.account_id !== uid);
assert.equal(prior(rows, 'recent', 'new-account'), true);
assert.equal(prior(rows, 'recent', 'old-account'), false);
const retained = rows.filter(row => !(row.first_purchase_at < cutoff));
assert.equal(retained.length, 2);
assert.equal(prior(retained, 'expired', 'new-account'), false);
assert.equal(prior(retained, 'boundary', 'new-account'), true);
assert.equal(prior(retained, 'recent', 'new-account'), true);
assert.equal(retained.some(row => row.account_id === 'deleted-account'), false);
const historical = read('supabase/migrations/20260927130000_batch3b_antifarming.sql');
assert.match(historical, /on conflict \(identity_hash\) do nothing/i);
assert.match(historical, /i\.account_id <> p_uid/i);
for (const file of ['website/delete-account.html', 'website/privacy-policy.html',
  'website/_src/pages/delete-account.html', 'website/_src/pages/privacy-policy.html',
  'mobile-app/src/screens/privacy/PrivacyScreen.tsx']) {
  const text = read(file);
  assert.match(text, /up to 180 days after account deletion, then deleted/);
  assert.match(text, /owner\/legal review/);
  assert.doesNotMatch(text, /Everything else linked to your account is deleted/);
}
console.log('PASS retention SQL cutoff/privileges/no scheduling/no invocation; boundary and anti-abuse model; account ID removal; disclosure consistency');
console.log('LIMIT: PostgreSQL execution and live retention operation are not verified (no database writes).');
