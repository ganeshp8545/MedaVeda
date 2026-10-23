const { build } = require('../eas.json');
function checkStagingBuild(env) {
  if (env.EAS_BUILD_PROFILE === 'staging-validation' && env.MEDVEDA_BUILD_TARGET !== 'staging') {
    throw new Error('Staging profile requires MEDVEDA_BUILD_TARGET=staging.');
  }
  // Same-project test builds use the owner's existing backend. Building is
  // not authorization to create records, purchase, or deploy remote changes.
  if (env.MEDVEDA_BUILD_TARGET === 'same-project') {
    if (env.EXPO_PUBLIC_SUPABASE_URL !== build.production.env.EXPO_PUBLIC_SUPABASE_URL ||
        !env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.MEDVEDA_PAYMENT_PROVIDER !== 'play') {
      throw new Error('Same-project testing requires the existing MedVeda URL, publishable key and Play Billing.');
    }
    return;
  }
  if (env.MEDVEDA_BUILD_TARGET !== 'staging') return;
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const production = build.production.env;
  if (url !== 'https://nsmsqsogedzohwboripd.supabase.co' ||
      !key || key === 'REPLACE_WITH_STAGING_PUBLISHABLE_KEY' ||
      key === production.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      !key.startsWith('sb_publishable_') ||
      env.MEDVEDA_PAYMENT_PROVIDER !== 'disabled' ||
      ['GOOGLE_SERVICES_JSON', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
        'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'PLAY_CATALOG_CRON_SECRET',
        'PLAY_PAYMENT_CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY',
        'EXPO_PUBLIC_SENTRY_DSN'].some((name) => !!env[name]) ||
      (env.EAS_BUILD_PROFILE && env.EAS_BUILD_PROFILE !== 'staging-validation')) {
    throw new Error('Staging requires its exact Supabase URL, a distinct publishable key, and disabled payments.');
  }
}
module.exports = { checkStagingBuild };
if (require.main === module) checkStagingBuild(process.env);
