// Offline migration contracts only. No DB connection or SQL execution.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = name => fs.readFileSync(`${__dirname}/../migrations/${name}`, 'utf8');
const notes = read('20261020100000_notes_service_reads.sql');
assert.match(notes, /drop policy if exists notes_read_if_purchased on storage.objects/);
assert.match(notes, /drop policy if exists notes_service_reads_only on storage.objects;\s*create policy notes_service_reads_only/);
assert.match(notes, /as restrictive\s+for select to public\s+using \(bucket_id <> 'notes' or public.am_i_admin\(\)\)/);
assert.match(notes, /Rollback:/);
const maintenance = read('20261020101000_maintenance_mode_read.sql');
assert.match(maintenance, /security definer\s+set search_path = ''/);
assert.match(maintenance, /select maintenance_mode from public.app_settings where id = 1/);
assert.match(maintenance, /revoke all.*from public/);
assert.match(maintenance, /grant execute.*to anon, authenticated/);
const url = read('20261020102000_correct_stale_store_url.sql');
assert.match(url, /where key = 'store_url'/);
// Run the actual SQL WHERE regexes and replacement against offline fixtures.
const patterns = [...url.matchAll(/and value ~ '([^']+)'/g)].map(m => new RegExp(m[1]));
const [, from, to] = url.match(/regexp_replace\(value,\s*'([^']+)',\s*'([^']+)'\)/);
const correct = (key, value) => key === 'store_url' && patterns.every(p => p.test(value))
  ? value.replace(new RegExp(from), to.replace(/\\(\d)/g, '$$$1')) : value;
for (const id of ['com.medveda.app', 'com.ayurpulse.app', 'in.medveda.app', 'custom.app', 'com.medveda.app.extra']) {
  for (const params of [`id=${id}`, `hl=en&id=${id}&ref=app`]) {
    const value = `https://play.google.com/store/apps/details?${params}`;
    const expected = /^com\.(medveda|ayurpulse)\.app$/.test(id) ? value.replace(id, 'in.medveda.app') : value;
    assert.equal(correct('store_url', value), expected);
    assert.equal(correct('other', value), value);
    assert.equal(correct('store_url', expected), expected); // idempotent
  }
}
for (const value of ['https://custom.invalid/?id=com.medveda.app', 'https://play.google.com.evil/store/apps/details?id=com.medveda.app'])
  assert.equal(correct('store_url', value), value);
console.log('PASS SEC-02/MOB-01 migration contracts and MOB-02 conditional SQL regex fixtures (offline; SQL not executed)');
