# MedVeda pre-release cleanup report

## Scope and safety record

This review was limited to `mobile-app/`. No branch, commit, dependency
change, protected configuration, payment/order/checkout/referral/wallet code,
or user-owned modification was changed.

The working tree was already dirty before this work. The mobile-app changes
recorded at the start were `.gitignore`, `PLAY_STORE_SUBMISSION.md`,
`app.config.js`, `app.json`, `eas.json`, `SideDrawer.tsx`, auth service,
screenshot hook, navigator, splash/profile/referral/settings/videos screens,
and app-config service; `DATA_SAFETY_AUDIT.md` was untracked. Changes outside
`mobile-app/` were also present and were not touched.

## Baseline and final verification

| Measure | Baseline | Final |
| --- | ---: | ---: |
| `src/` files | 201 | 201 |
| Direct dependencies + devDependencies | 48 | 48 |
| `assets/` size | 4,929,912 bytes | 4,929,912 bytes |
| Android export | passed | passed |
| Android export size | unavailable | 12,968,643 bytes |

`npx tsc --noEmit` passed before edits and after the hygiene changes.
`npx expo export --platform android --output-dir <temporary directory>` passed
at baseline and again after the accessibility changes. The final temporary
output measured 12,968,643 bytes across 38 files and was removed. The baseline command did not
emit a measurable output-directory size, so no baseline-size comparison is
guessed.

An earlier environment recorded `expo-doctor` as 19 of 21 checks passing, with
a React Native Directory metadata-server response failure, and recorded seven
SDK patch mismatches. That command output did not preserve expected versions.
The current-tree re-audit below supersedes the package conclusion: all seven
named packages match the installed SDK 57 compatibility map. No dependency or
lockfile was changed.

## Changes applied

- `App.tsx`: replaced direct initialization-error console output with the
  existing PII-aware `logError` helper.
- `src/components/ErrorBoundary.tsx`: routed development component-stack output
  through existing `logDebug`; production error capture remains unchanged.
- `src/screens/home/HomeScreen.tsx`: removed a user-visible obsolete
  Firebase/Firestore instruction; the existing failure and retry flow is
  unchanged.
- `src/components/HomeHeader.tsx`: labelled the icon-only menu, search, and
  settings buttons for screen readers.
- `src/components/SearchBar.tsx`: labelled the icon-only clear button.
- `src/components/FilterChip.tsx`: exposed the button role and selected state.
- `src/components/search/RecentSearchesRow.tsx`: labelled clear-history and
  remove-history icon actions.

No files or dependencies were removed. There are no commits by this cleanup.

## A. Safe to delete

None proven. Static basename searching was insufficient evidence for deletion:
React Navigation routes, platform resolver files, feature flags, and dynamic
native/config references can be missed. The available `npx knip`/`depcheck`
attempts yielded no diagnostics in this environment, so their results were not
used as deletion evidence.

## B. Needs confirmation (kept untouched)

- `src/features/auth/ResetPasswordScreen.tsx` (143 lines) and
  `src/screens/auth/ResetPasswordScreen.tsx` (241 lines): only the latter is
  registered by `AppNavigator.tsx:172`; the feature implementation could still
  be retained intentionally. Confirm ownership before deleting either.
- `src/screens/pdf/PdfViewerScreen.web.tsx`, `react-native-web`, `react-dom`,
  and `@expo/metro-runtime`: `package.json` includes a web script and the PDF
  screen has a web platform implementation. Web-build support must be confirmed
  before removal.
- `OFFLINE_MODE_SETUP.md` and `scripts/*-selftest`: documentation and checkout/
  password/signature self-tests. They were not treated as generated files.
- Assets: `splash.png` 1,678,819 bytes, `adaptive-icon.png` 1,459,751 bytes,
  `icon.png` 978,337 bytes, `favicon.png` 813,005 bytes. These are protected
  release assets and remain untouched.
- `StudyReminderScreen.tsx:60-61,136-138`: user-visible Expo Go/development
  build wording is a real platform limitation, but is release-unpolished when
  that detection is wrong. It is notification code, which this cleanup was
  explicitly instructed not to modify; confirm desired release copy before a
  separate notification-scoped change.
- `SideDrawer.tsx` and related current dirty files: preserve as user work.

## C. Keep

- Payment, order, Razorpay, purchase, referral, wallet, and purchase feature
  flag code: protected by request.
- Authentication, reset/deep-link handling, Supabase configuration, secure
  storage, offline/download/sync, notifications, Sentry, and logger code:
  protected/active.
- Platform-specific PDF files and all Expo configuration/assets: active or
  protected.
- `.expo` logs are ignored (`.gitignore:7`) and were not added or removed.

## Google Play review

- Permissions are limited to `INTERNET` and `POST_NOTIFICATIONS`; storage,
  media, overlay, and download-notification permissions are explicitly blocked
  in `app.json:19-30`. No camera, microphone, location, or contacts permission
  was found.
- The only `http://` executable check is the permitted checkout scheme check at
  `src/screens/payment/PaymentCheckoutScreen.tsx:334`.
- No `rzp_test_` key or private key was found. The checked-in
  `sb_publishable_...` Supabase key is an approved publishable key. Do not
  treat ignored `.expo` development logs as a release artifact.
- Non-legal external social links appear in `SideDrawer.tsx:47-51` and
  `ContactScreen.tsx:37-40` (Instagram, YouTube, Telegram); WhatsApp uses the
  legal constant only on Contact. These should be approved/centralized before
  release, but `SideDrawer.tsx` is user-modified and was not changed.
- Privacy, Terms, Contact, and About routes are registered at
  `AppNavigator.tsx:167-170`; Contact is reachable in the drawer at
  `SideDrawer.tsx:211`, and About/Contact are reachable from Profile. Verify
  Privacy, Terms, and Delete Account reachability manually; Delete Account is
  linked from Contact via `WEB.deleteAccount`.
- No evidence was found of downloading/executing native code or hidden APKs.
  `expo-updates` is present and should receive normal release configuration QA.
- Re-checking URLs found approved MedVeda, Play Store, WhatsApp, and Razorpay
  endpoints plus the already-listed social URLs. No `rzp_test_` or private key
  was found; the only client-side Supabase key is the approved
  `sb_publishable_...` key in protected EAS configuration.
- Review remaining placeholder/demo copy: the Facebook social button is
  intentionally "Coming Soon" (`SideDrawer.tsx:42-45` and
  `ContactScreen.tsx:34-35`). No automatic removal was made.

## Release blockers / decisions

- Rerun `npx expo install --check` and `npx expo-doctor` on a connected
  machine, preserving their full output, before release. The current local SDK
  map is aligned, but remote validation is unavailable in this environment.
- Treat any React Native Directory response failure as a service/metadata
  diagnostic until a package-specific warning or runtime defect is reproduced.
- Approve any wording change to the protected reminder/notification flow and
  approve/centralize the non-legal social URLs before release.

## Loading/empty/error-state follow-up

Several main data screens already include loading and error handling; a full
real-device pass is still required to validate empty/error states for the
Home sub-sections, Store, Notes, Videos, Subjects, Chapters, Search,
Notifications, Downloads, and purchase history. No UI flow was redesigned.

## Manual real-device QA

- Login, registration, forgot-password link and reset deep link.
- Browse course years, subjects, chapters; open a note PDF.
- Download content, open it offline, and recover an interrupted download.
- Quiz attempt, search, notification permission/reminder, referral, settings,
  account deletion, and logout.
- Privacy, Terms, Contact, About, external links, update gate, and Android
  release notification behavior.

## SDK 57 and release-readiness audit addendum (current working tree)

### Correction to the earlier seven-package assertion

The earlier text described seven SDK package patch mismatches but did not
record the command output or expected versions. On the current local tree,
that assertion cannot be reproduced. The `package.json` declarations, lockfile
resolutions, `npm ls --depth=0`, and the compatibility map shipped with the
installed `expo@57.0.24` agree exactly:

| Package | Declared / installed / lockfile | SDK 57 compatibility map | Finding |
| --- | --- | --- | --- |
| `expo` | `~57.0.24` / `57.0.24` | `57.0.24` (the installed SDK package) | aligned |
| `expo-build-properties` | `~57.0.21` / `57.0.21` | `~57.0.21` | aligned |
| `expo-constants` | `~57.0.19` / `57.0.19` | `~57.0.19` | aligned |
| `expo-notifications` | `~57.0.20` / `57.0.20` | `~57.0.20` | aligned |
| `expo-screen-capture` | `~57.0.3` / `57.0.3` | `~57.0.3` | aligned |
| `expo-sqlite` | `~57.0.3` / `57.0.3` | `~57.0.3` | aligned |
| `expo-updates` | `~57.0.23` / `57.0.23` | `~57.0.23` | aligned |

Evidence: `package.json:20-35`, `package-lock.json:3837-4190`, and
`node_modules/expo/bundledNativeModules.json` (the SDK 57 map used by the
locally installed Expo CLI). The seven named packages are therefore not
outdated relative to the installed SDK's own map. No dependency or lockfile
change is recommended from this evidence.

Exact Expo guidance is to use `npx expo install --check` to validate versions;
if and only if it reports invalid packages using current version metadata, use
`npx expo install --fix` to install Expo's compatible versions. Expo documents
that `--check` reports incorrect installed versions and `--fix` changes them:
<https://docs.expo.dev/more/expo-cli/#version-validation>. Expo also warns that
React Native packages are not generally backward compatible, which is why
manual `npm update`, package exclusions, and piecemeal upgrades are not a
minimum-risk release remedy.

The current `npx expo install --check` did print `Dependencies are up to date`,
but it also printed `Networking has been disabled`, fell back to
`expo/bundledNativeModules.json`, and explicitly said dependency validation is
unreliable in offline mode. It is useful corroboration of the local-map result,
not remote validation. Before release, rerun the same command on a connected
CI runner or developer machine and retain its full output. If it then reports
the seven packages, the minimum safe fix is one reviewed, lockfile-inclusive
`npx expo install --fix` change followed by a clean native build and the QA
listed below; do not individually bump packages.

### React Native Directory response failure — separate environmental finding

The prior Expo Doctor report's React Native Directory failure is metadata
service/network related, not application-runtime evidence. It checks library
metadata rather than exercising MedVeda. In this audit environment, network
access is disabled and `npx expo-doctor` did not reach a completed diagnostic
within the bounded command window; the process also emitted a sandboxed
user-bus warning. Neither result identifies an app defect. Re-run Doctor with
working outbound network, capture the HTTP/diagnostic text, and only act on a
package-specific compatibility warning. Do not remove or replace a dependency
solely to silence that metadata check.

### Release blockers and risks found from source/configuration review

- **Release identity migration is high-risk and needs Play/EAS confirmation.**
  Current dirty files changed the URL scheme, Android package, iOS bundle ID,
  and Play URLs from `ayurpulse` to `medveda` (`app.json:9,14,64`,
  `AppNavigator.tsx:90`, `authService.ts:24`, and share/rate links in
  `SideDrawer.tsx`, `ProfileScreen.tsx`, `SettingsScreen.tsx`,
  `ReferralScreen.tsx`, and `appConfigService.ts`). Android package IDs cannot
  be changed for an existing Play listing. Confirm that `com.medveda.app` is
  the intended *new* listing/package and that the EAS project, Supabase
  redirect allow-list, Firebase Android app / `google-services.json`, OAuth
  providers, and payment return URLs are all registered for `medveda://`.
  Otherwise this blocks release: reset/password and payment deep links can
  fail, and an update cannot be uploaded to the former package listing.
- **Push is configuration-gated.** `expo-notifications` is configured and
  `POST_NOTIFICATIONS` is declared (`app.json:19-40`), but production push
  requires a `google-services.json` for `com.medveda.app` or the production
  `GOOGLE_SERVICES_JSON` EAS file secret (`app.config.js:3-5`,
  `PLAY_STORE_SUBMISSION.md:25-40`). Verify it in an installed production AAB;
  never add that file to git.
- **Permissions are deliberately narrow but must be verified in the built
  manifest.** The explicit list is `INTERNET` and `POST_NOTIFICATIONS`;
  storage/media/overlay/download-without-notification are blocked
  (`app.json:19-30`). Native libraries may add normal permissions; inspect the
  final AAB in Play App Bundle Explorer and align Data safety declarations with
  the actual result.
- **Legal, privacy, and account deletion have source evidence, not live URL
  proof.** Legal URLs are centralized at `src/constants/legal.ts:16-24`.
  Privacy and Terms are registered screens (`AppNavigator.tsx:167-170`), the
  Settings screen performs confirmed in-app deletion through the
  `delete-account` Edge Function (`SettingsScreen.tsx:90-107,176-207`;
  `usersService.ts:86-119`), and web deletion help is reachable from Privacy,
  Contact, and About. Manually open each production `https://www.medveda.in`
  URL and complete a test deletion with a disposable account; the local review
  cannot verify deployment, function secrets, retention behavior, or email
  identity checks.
- **External URLs require owner approval and live checking.** Non-legal social
  endpoints are hardcoded in `SideDrawer.tsx:47-51` and
  `ContactScreen.tsx:37-40`; they are duplicated rather than centralized. The
  Razorpay script and browser checkout are HTTPS; `PaymentCheckoutScreen.tsx`
  only permits `http://`, `https://`, and `about:` navigation by design. Do
  not change checkout validation without payment-flow testing. Confirm that
  every social, Play, legal, WhatsApp, video, payment, and referral terms URL
  is production-owned and opens correctly.
- **OTA/update security needs release validation.** EAS Updates is configured
  with an app-version runtime policy (`app.json:54-61`). Optional OTA signing
  activates only if a local certificate exists (`app.config.js:46-55`), so its
  current activation cannot be established from tracked files. Confirm the
  production channel, update compatibility, and signing certificate/key
  custody before publishing an update. Do not change the update setup in this
  audit.
- **Manual QA remains a release gate.** At minimum: production login and
  password reset deep link; real Razorpay purchase/verify/unlock and failure;
  referral gate/terms; download/open offline/resume; notifications permission,
  token, foreground/background/open action and reminder; screenshot blocking
  in production (and only screenshot profile disabling it); account deletion;
  legal screens/web URLs; OTA/update gate; cold-start deep links; and a
  shrink-test APK through PDF, blob download, Sentry, auth, checkout, and
  push flows. These are intentionally not automated here because they require
  deployed services, native credentials, and real devices.

### Checks performed in this addendum

- `npm ls` confirmed the seven installed versions above.
- `npx expo config --type public --json` succeeded and resolved the current
  Android permissions, identifiers, update URL, runtime version, and dynamic
  build-properties plugin without a configuration-schema failure.
- `npx tsc --noEmit` passed.
- `npx expo install --check` completed but was an offline, explicitly
  unreliable version validation as noted above.
- Expo Doctor / React Native Directory was **not** judged an app failure: its
  bounded run was prevented from completing by this environment's disabled
  networking/sandbox warning. This is an environmental failure, not a passed
  check and not a MedVeda defect.

No dependencies, lockfile entries, app code, credentials, payment/auth/deep
link/referral/offline/notification/security behavior, or protected
configuration were changed by this addendum.
