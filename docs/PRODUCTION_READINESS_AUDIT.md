# MedVeda production readiness audit

Checked locally on 2026-10-13. This is a repository and configuration audit; deployed Supabase secrets, EAS environment values, Razorpay dashboard mode, and Play Console state require owner verification. No build, deploy, submit, or production command was run. Secret values are intentionally omitted.

## Credential and bundle findings

| Finding | Evidence | Resolution / release action |
| --- | --- | --- |
| No service-account JSON, private-key PEM, or Supabase service-role JWT was found in tracked files or the 78-commit Git history scan. | `git rev-list --all`; content scan of each revision; `mobile-app/.gitignore:16-20`; root `.gitignore:45-51` | Keep the Google Play service-account JSON out of Git and supply it only to the server secret and local EAS submit process. Recheck before publishing. |
| An ignored local admin env file contains a service-role JWT. It is not tracked and must never enter the mobile build. | `admin-panel/.env.local:2`; `admin-panel/.gitignore:26`; `git ls-files admin-panel/.env.local` returned nothing. | Keep it local and rotate it if it has ever been copied or disclosed elsewhere. The audit did not print its value. |
| A prior incident is documented: a real Razorpay **test** key pair was committed in an earlier delivery. This repository's current Git history does not contain the reported `supabase/functions/.env` file; the notice itself contains a redacted key ID. | `supabase/SECURITY_NOTICE.md:3-8,37-48`; `git log --all -- supabase/functions/.env` returned nothing. | Treat the old test pair as compromised and rotate it in Razorpay. Confirm production Supabase uses the live pair; any externally published earlier repository or archive still needs review. |
| Current `rzp_live_` and `rzp_test_` strings in tracked docs, examples, and a checkout self-test are placeholders, not usable credentials. | `RAZORPAY_PRODUCTION_SETUP.md:11`; `docs/SETUP_GUIDE.md:323,333`; `mobile-app/scripts/checkout-html-selftest.mjs:3`. | Leave only placeholders in examples. Verify deployed secret mode in the owner's dashboard before release. |
| The mobile bundle reads only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and optional public Sentry DSN; the Razorpay **key ID** is supplied at checkout by the server because the Razorpay client requires it. No Razorpay key secret, Google service account, or service-role key is referenced by mobile source. | `mobile-app/src/config/supabase.ts:18-29`; `mobile-app/src/services/paymentService.ts:7-18`; `mobile-app/src/screens/payment/PaymentCheckoutScreen.tsx:393-401`; `mobile-app/eas.json:13-15,47-49`; `supabase/functions/_shared/supabaseAdmin.ts:9`. | Keep private credentials server-side. Before each release, inspect EAS environment variables for unintended `EXPO_PUBLIC_*` secrets. |
| Ignore rules cover `.env`, `.env.*` (except examples), Android Firebase JSON, Google Play service-account JSON, generic service-account JSON names, PEM and key files, and common signing-key extensions. | `.gitignore:5-8,45-51`; `mobile-app/.gitignore:15-20,28-37`. | Keep key files at ignored paths. Check `git status --short` before any commit. |

## Razorpay test-mode entry points

| Entry point | Evidence | Fix / verification |
| --- | --- | --- |
| EAS build profiles | `mobile-app/eas.json:6-76` contains only public Supabase variables and screenshot flag; no Razorpay mode or key is embedded. | Inspect remotely configured EAS environment values for every production build; keep test credentials out of `EXPO_PUBLIC_*`. |
| App config and mobile checkout | `mobile-app/app.config.js:23-57` has no Razorpay setting. The checkout receives `keyId` and `isLiveMode` from `create-order`; it displays a TEST MODE banner when the server reports test mode (`PaymentCheckoutScreen.tsx:403-413`). | Verify a licensed tester's installed Play build reaches the live Razorpay mode when appropriate. The banner is an indicator, not a release gate by itself. |
| Supabase function secrets | `supabase/functions/_shared/razorpay.ts:10-55` obtains keys from runtime env and rejects a `rzp_test_` key unless `ALLOW_TEST_MODE=true`. A stale production `ALLOW_TEST_MODE=true` combined with a test key would permit test orders. | Owner: inspect production secret **names and mode** without pasting values; ensure `RAZORPAY_KEY_ID` is live and `ALLOW_TEST_MODE` is unset. Confirm distinct live webhook secret. |
| Local function env template | `supabase/functions/.env.example:1-17` previously provided a test key placeholder and `ALLOW_TEST_MODE=true`. | Fixed locally: credential and mode values are empty so copying the template cannot silently opt into test mode. |
| Server response to mobile | `supabase/functions/create-order/index.ts:110,146-147` calls the shared key guard and returns the public key ID and server-derived mode. | Run post-deploy smoke and a live-mode checkout check on the installed build. Never expose the key secret in this response. |

## EAS and Android build readiness

- `mobile-app/app.json:20`: Android package is `com.medveda.app`. The same package is enforced server-side by `supabase/functions/_shared/googlePlay.ts:30-31`.
- `mobile-app/app.json:26-28`: requested Android permissions are `INTERNET` and `POST_NOTIFICATIONS`; blocked permission list is at `:31-37`. The final merged manifest still requires inspection on the built AAB because dependencies can add permissions.
- `mobile-app/app.json:48`: `expo-iap` config plugin is present; `mobile-app/package.json` includes `expo-iap`. Play Billing requires a native build; Expo Go is not required. Existing Expo Go guards in notification code support local development only.
- `mobile-app/eas.json:3-4,42-56`: version source is remote; production and the new `internal-testing` profile build AABs with `autoIncrement: true`. Owner should inspect the EAS remote Android version code and ensure it exceeds the latest Play artifact before building. The `preview` profile remains an APK for direct device checks.
- `mobile-app/eas.json:70-76`: `submit.internal-testing` targets Play's internal track using the ignored local service-account JSON path. This file is owner-provided and cannot be validated locally.
- `npx expo config --type public --json` **passed** locally. It resolved package `com.medveda.app`, app version `1.2.0`, `expo-iap`, `expo-build-properties`, and only `eas` in `extra`; no credential was present in public `extra`.
- `npx expo-doctor` **could not run** because `expo-doctor` is not installed locally and npm registry DNS returned `EAI_AGAIN`. Run it on an internet-connected machine before building. This is a release gate, not a passing check.

Owner build/submit commands, from `mobile-app/` after the release gates pass:

```bash
npx expo-doctor
npx expo config --type public
npx eas-cli build:version:get --platform android --profile internal-testing
npx eas-cli build --platform android --profile internal-testing
npx eas-cli submit --platform android --profile internal-testing --latest
```

Verify the resulting AAB's package, version code, Play Billing integration, and merged permissions in Play Console or with Android bundle tooling before promoting it. The exact Play Console labels remain **VERIFY**.
