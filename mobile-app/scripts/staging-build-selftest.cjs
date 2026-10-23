const assert = require('assert');
const config = require('../eas.json');
const internal = config.build['internal-testing'];
const production = config.build.production;
const staging = config.build['staging-validation'];
function check(label, condition) { console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); if (!condition) process.exitCode = 1; }
check('internal profile does not inherit production', internal.extends !== 'production');
check('internal profile uses preview EAS environment', internal.environment === 'preview');
check('internal profile identifies same-project target', internal.env?.MEDVEDA_BUILD_TARGET === 'same-project');
check('internal profile pins existing project',
  internal.env?.EXPO_PUBLIC_SUPABASE_URL === production.env.EXPO_PUBLIC_SUPABASE_URL &&
  internal.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY === production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const guard = require('./check-staging-build.cjs');
check('staging profile is a separate internal APK and channel',
  staging.extends === undefined && staging.distribution === 'internal' &&
  staging.android.buildType === 'apk' && staging.channel === 'staging-validation');
check('staging profile uses exact staging URL and disables payments',
  staging.env.MEDVEDA_BUILD_TARGET === 'staging' &&
  staging.env.MEDVEDA_PAYMENT_PROVIDER === 'disabled' &&
  staging.env.EXPO_PUBLIC_SUPABASE_URL === 'https://nsmsqsogedzohwboripd.supabase.co');
check('staging profile remains blocked until its key is provided',
  staging.env.EXPO_PUBLIC_SUPABASE_ANON_KEY === 'REPLACE_WITH_STAGING_PUBLISHABLE_KEY');
const safe = {
  EAS_BUILD_PROFILE: 'staging-validation',
  MEDVEDA_BUILD_TARGET: 'staging',
  MEDVEDA_PAYMENT_PROVIDER: 'disabled',
  EXPO_PUBLIC_SUPABASE_URL: 'https://nsmsqsogedzohwboripd.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_staging_test_fixture',
};
for (const [name, values, shouldPass] of [
  ['exact staging URL with distinct fixture key', safe, true],
  ['placeholder key', { ...safe, EXPO_PUBLIC_SUPABASE_ANON_KEY: staging.env.EXPO_PUBLIC_SUPABASE_ANON_KEY }, false],
  ['production URL', { ...safe, EXPO_PUBLIC_SUPABASE_URL: production.env.EXPO_PUBLIC_SUPABASE_URL }, false],
  ['production key', { ...safe, EXPO_PUBLIC_SUPABASE_ANON_KEY: production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY }, false],
  ['unexpected project', { ...safe, EXPO_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }, false],
  ['Play provider', { ...safe, MEDVEDA_PAYMENT_PROVIDER: 'play' }, false],
  ['Razorpay provider', { ...safe, MEDVEDA_PAYMENT_PROVIDER: 'razorpay' }, false],
  ['production Google services file variable', { ...safe, GOOGLE_SERVICES_JSON: '/fixture/google-services.json' }, false],
  ['production payment worker secret', { ...safe, PLAY_PAYMENT_CRON_SECRET: 'fixture' }, false],
  ['missing target', { ...safe, MEDVEDA_BUILD_TARGET: undefined }, false],
  ['wrong profile', { ...safe, EAS_BUILD_PROFILE: 'production' }, false],
]) {
  let passed = true;
  try { guard.checkStagingBuild(values); }
  catch { passed = false; }
  check(name, passed === shouldPass);
}

const saved = new Map(Object.keys(safe).map(name => [name, process.env[name]]));
Object.assign(process.env, safe);
try {
  const app = require('../app.config.js')({ config: require('../app.json').expo });
  check('staging APK has distinct app identity and disabled runtime',
    app.name === 'MedVeda Staging' && app.scheme === 'medveda-staging' &&
    app.android.package === 'in.medveda.staging' &&
    app.android.runtimeVersion.endsWith('-disabled') &&
    app.extra.medvedaPaymentProvider === 'disabled');
} finally {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
