// Wraps app.json and adds two things that need a file only the owner can create. Each turns on
// automatically the moment the file exists; without the file the build is exactly app.json.
//
// 1. Android push (FCM): ./google-services.json, or the EAS file variable GOOGLE_SERVICES_JSON.
//    Firebase Console -> Project settings -> Your apps -> Android `com.ayurpulse.app`.
//    Without it Expo push tokens cannot be issued on Android.
//
// 2. OTA update code signing: ./code-signing/certificate.pem. Once enabled, the installed app
//    only runs an OTA update that is signed with the matching private key, so a compromised
//    Expo account / update channel alone cannot push code to students' phones.
//      npx expo-updates codesigning:generate --key-output-directory code-signing-keys \
//        --certificate-output-directory code-signing --certificate-validity-duration-years 10 \
//        --certificate-common-name "MedVeda"
//      keep code-signing-keys/ OUT of git and out of the repo folder (it is the private key);
//      publish updates with:  eas update --private-key-path <path to private-key.pem>
//    Builds made before the certificate was added do not check signatures, so ship a new
//    store build first; only then does signing protect that build.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const next = { ...config };

  const local = path.join(__dirname, "google-services.json");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? "./google-services.json" : undefined);
  if (googleServicesFile) next.android = { ...next.android, googleServicesFile };

  // Android build hardening. Cleartext (http://) traffic is off for release builds: the app only
  // talks to https endpoints. R8 code shrinking + resource shrinking is OPT-IN (ANDROID_SHRINK=1,
  // used only by the "shrink-test" EAS profile): it cannot be exercised without a device, so it is
  // never on for the production profile until a shrink-test build has been run through
  // login, notes viewing/download, checkout and a push.
  const android = { usesCleartextTraffic: false };
  if (process.env.ANDROID_SHRINK === "1") {
    android.enableMinifyInReleaseBuilds = true;
    android.enableShrinkResourcesInReleaseBuilds = true;
    android.extraProguardRules = [
      "-keep class com.github.barteksc.pdfviewer.** { *; }",   // react-native-pdf
      "-keep class com.shockwave.pdfium.** { *; }",
      "-keep class com.ReactNativeBlobUtil.** { *; }",         // react-native-blob-util
      "-keep class com.RNFetchBlob.** { *; }",
      "-keep class io.sentry.** { *; }",
      "-dontwarn io.sentry.**",
    ].join("\n");
  }
  next.plugins = [...(next.plugins || []), ["expo-build-properties", { android }]];

  const cert = path.join(__dirname, "code-signing", "certificate.pem");
  if (fs.existsSync(cert)) {
    next.updates = {
      ...next.updates,
      codeSigningCertificate: "./code-signing/certificate.pem",
      codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
    };
  }
  return next;
};
