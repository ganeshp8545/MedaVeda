const assert = require('assert');
const config = require('../eas.json');
const internal = config.build['internal-testing'];
const production = config.build.production;
function check(label, condition) { console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) process.exitCode = 1; }
check('internal profile does not inherit production', internal.extends !== 'production');
check('internal profile uses preview EAS environment', internal.environment === 'preview');
check('internal profile identifies staging target', internal.env?.MEDVEDA_BUILD_TARGET === 'staging');
check('internal profile has no production URL or key',
  internal.env?.EXPO_PUBLIC_SUPABASE_URL !== production.env.EXPO_PUBLIC_SUPABASE_URL &&
  internal.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY !== production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const guard = require('./check-staging-build.cjs');
for (const [name, values, shouldPass] of [
  ['missing staging URL', {}, false],
  ['production URL', { EXPO_PUBLIC_SUPABASE_URL: production.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'staging-public-key' }, false],
  ['isolated staging URL', { EXPO_PUBLIC_SUPABASE_URL: 'https://staging-example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'staging-public-key' }, true],
]) {
  let passed = true;
  try { guard.checkStagingBuild({ MEDVEDA_BUILD_TARGET: 'staging', ...values }); }
  catch { passed = false; }
  check(name, passed === shouldPass);
}
