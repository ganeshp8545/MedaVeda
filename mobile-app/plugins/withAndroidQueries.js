const { withAndroidManifest } = require("@expo/config-plugins");

// ROOT CAUSE FIX: On Android 11 (API 30) and above, apps must declare in
// AndroidManifest.xml which packages/intents they are allowed to query,
// otherwise Linking.canOpenURL() returns false even for plain https://
// links (YouTube, wa.me/WhatsApp, etc.) and even if the target app is
// installed. This config plugin injects the required <queries> block
// during `expo prebuild` / EAS build, since app.json has no native field
// for raw AndroidManifest <queries> entries.
function addQueriesIntent(manifest, action, scheme, category) {
  if (!manifest.queries) {
    manifest.queries = [{}];
  }
  const queries = manifest.queries[0];
  if (!queries.intent) {
    queries.intent = [];
  }

  const alreadyExists = queries.intent.some(
    (intent) =>
      intent.action?.[0]?.$?.["android:name"] === action &&
      intent.data?.[0]?.$?.["android:scheme"] === scheme
  );
  if (alreadyExists) return;

  const intentEntry = {
    action: [{ $: { "android:name": action } }],
    data: [{ $: { "android:scheme": scheme } }],
  };
  if (category) {
    intentEntry.category = [{ $: { "android:name": category } }];
  }
  queries.intent.push(intentEntry);
}

const withAndroidQueries = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    // Fixes YouTube link ("Could not open the link")
    addQueriesIntent(
      androidManifest,
      "android.intent.action.VIEW",
      "https",
      "android.intent.category.BROWSABLE"
    );
    // Fixes WhatsApp link (https://wa.me/...)
    addQueriesIntent(
      androidManifest,
      "android.intent.action.VIEW",
      "http",
      "android.intent.category.BROWSABLE"
    );
    // Fixes mailto: on ContactScreen for the same underlying reason
    addQueriesIntent(androidManifest, "android.intent.action.SENDTO", "mailto");

    return config;
  });
};

module.exports = withAndroidQueries;