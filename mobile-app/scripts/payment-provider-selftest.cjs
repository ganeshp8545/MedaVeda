const assert = require("node:assert/strict");
const appConfig = require("../app.config");
const app = require("../app.json").expo;
const eas = require("../eas.json").build;

function configFor(profile, provider) {
  const names = ["EAS_BUILD_PROFILE", "MEDVEDA_PAYMENT_PROVIDER", "MEDVEDA_BUILD_TARGET"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  if (profile) process.env.EAS_BUILD_PROFILE = profile;
  if (provider) process.env.MEDVEDA_PAYMENT_PROVIDER = provider;
  try {
    return appConfig({ config: app });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

assert.equal(app.android.package, "in.medveda.app");
assert.equal(app.ios.bundleIdentifier, "com.medveda.app");
assert.equal(app.scheme, "medveda");
assert.equal(app.slug, "ayurpulse");
assert.equal(configFor("production").extra.medvedaPaymentProvider, "play");
assert.equal(configFor("internal-testing").extra.medvedaPaymentProvider, "play");
assert.equal(configFor("razorpay-distribution", "razorpay").extra.medvedaPaymentProvider, "razorpay");
assert.equal(configFor("production").android.runtimeVersion, `${app.version}-play`);
assert.equal(configFor("internal-testing").android.runtimeVersion, `${app.version}-play`);
assert.equal(configFor("razorpay-distribution", "razorpay").android.runtimeVersion,
  `${app.version}-razorpay`);
assert.equal(configFor(undefined, "razorpay").android.runtimeVersion,
  `${app.version}-razorpay`);
assert.notEqual(configFor(undefined, "razorpay").android.runtimeVersion,
  configFor("production").android.runtimeVersion);
assert.throws(
  () => configFor("production", "razorpay"),
  /Google Play builds must use Google Play Billing/
);
assert.throws(
  () => configFor("preview", "unexpected"),
  /MEDVEDA_PAYMENT_PROVIDER must be play or razorpay/
);
assert.equal(eas.production.env.MEDVEDA_PAYMENT_PROVIDER, "play");
assert.equal(eas["internal-testing"].env.MEDVEDA_PAYMENT_PROVIDER, "play");
assert.equal(eas["razorpay-distribution"].env.MEDVEDA_PAYMENT_PROVIDER, "razorpay");
assert.equal(eas["razorpay-distribution"].environment, "preview");

console.log("Payment provider and package configuration checks passed.");
