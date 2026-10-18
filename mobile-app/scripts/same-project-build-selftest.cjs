const assert = require('node:assert/strict');
const { checkStagingBuild } = require('./check-staging-build.cjs');
const { build } = require('../eas.json');
const env = build['internal-testing'].env;
assert.equal(env.MEDVEDA_BUILD_TARGET, 'same-project');
assert.doesNotThrow(() => checkStagingBuild(env));
for (const change of [
  { EXPO_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' },
  { EXPO_PUBLIC_SUPABASE_ANON_KEY: '' },
  { MEDVEDA_PAYMENT_PROVIDER: 'razorpay' },
]) assert.throws(() => checkStagingBuild({ ...env, ...change }));
console.log('PASS same-project build and wrong-project/missing-key/wrong-provider rejection');
