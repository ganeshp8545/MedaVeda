import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanSecrets } from './scan-secrets.mjs';
const begin = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
const end = ['-----END ', 'PRIVATE KEY-----'].join('');
assert.equal(scanSecrets(`${begin}|${end}`).length, 0);
assert.equal(scanSecrets(`${begin}\n\u0024{generated}\n${end}`).length, 0);
const key = `${begin}\n${'YWJj'.repeat(32)}\n${end}`;
assert.equal(scanSecrets(key).length, 1);
assert.equal(scanSecrets(JSON.stringify({ private_key: key })).length, 1);
for (const prefix of [['rzp', 'live'], ['sk', 'live']]) {
  assert.equal(scanSecrets(`${prefix.join('_')}_${'x'.repeat(24)}`).length, 1);
}
const jwt = role => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'synthetic'].join('.');
assert.equal(scanSecrets(jwt('service_role')).length, 1);
assert.equal(scanSecrets(jwt('anon')).length, 0);
for (const file of ['supabase/functions/_shared/googlePlay.ts', 'supabase/tests/play_catalog_api_test.ts'])
  assert.equal(scanSecrets(readFileSync(file, 'utf8')).length, 0, file);
console.log('PASS: secret scanner marker, generated fixture, PEM, escaped PEM, live keys, service-role and anon JWT cases');
