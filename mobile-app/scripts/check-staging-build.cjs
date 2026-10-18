const { build } = require('../eas.json');
function checkStagingBuild(env) {
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
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) ||
      !key || url === production.EXPO_PUBLIC_SUPABASE_URL ||
      key === production.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Internal testing requires isolated preview Supabase URL and publishable key.');
  }
}
module.exports = { checkStagingBuild };
if (require.main === module) checkStagingBuild(process.env);
