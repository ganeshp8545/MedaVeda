const { build } = require('../eas.json');
function checkStagingBuild(env) {
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
