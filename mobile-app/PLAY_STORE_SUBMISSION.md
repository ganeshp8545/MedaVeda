# MedVeda — Play Store Submission Guide

This guide covers the remaining build and Google Play Console steps for the
MedVeda release. Google Play currently reports that the app is not eligible
for alternative billing. Therefore Play-distributed builds use Google Play
Billing only; Razorpay checkout is disabled in those builds. Do not enroll or
enable alternative billing unless eligibility and program requirements are
confirmed.

**Production release gate:** remove the ₹1 test tier and re-price all products before production.

## 1. Google Play Developer Account

- $25 one-time fee; sign up at https://play.google.com/console.
- Complete mandatory identity verification before the build is ready.

## 2. Assets you need to create

| Asset | Size | Used for |
|---|---|---|
| App icon | 512×512 px, PNG | Play Store listing |
| Adaptive icon foreground | 1024×1024 px, PNG, transparent background | Android home screen |
| Feature graphic | 1024×500 px | Top of the Play Store listing |
| Phone screenshots | min 2, max 8 (16:9 or 9:16) | Store listing |
| Splash screen image | any, referenced in `app.json` | App launch |

Put app assets in `mobile-app/assets/`. Upload the feature graphic and
screenshots directly in Play Console.

## 3. Finalize configuration

- `mobile-app/app.json` uses Android package `in.medveda.app`. Confirm that
  this matches the intended Play Console app before building or uploading;
  an existing Play listing's package cannot be changed.
- Keep the linked EAS project ID, owner, and slug unchanged.
- VERIFY MANUALLY: confirm the final package in Play Console before uploading
  the first AAB.

## 4. Push notifications: Firebase configuration

Download `google-services.json` from Firebase Console for Android package
`in.medveda.app`. Then either put it in the `mobile-app` project root locally,
or create the EAS file secret:

```bash
eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility secret --environment production
```

Rebuild after adding it. The file must not be committed. The app config reads
either `./google-services.json` or the `GOOGLE_SERVICES_JSON` environment
variable.

## 5. Build with EAS

`expo-iap` adds native Android code. Rebuild after installing/changing it;
Expo Go cannot test billing. Install the Play test-track build for final
billing tests. The development APK helps with native integration but does not
replace a Play-installed licensed-tester run.

```bash
cd mobile-app
npm install -g eas-cli
eas login
eas build:configure

# Test APK:
eas build --platform android --profile preview

# Native development APK:
eas build --platform android --profile development

# APK that permits store screenshots:
eas build --platform android --profile screenshots

# Play Store AAB:
eas build --platform android --profile production
```

EAS manages the Android signing keystore by default. The `screenshots` profile
only disables screenshot blocking; do not use it for production.

## 6. Store listing text

**Short description** (73 characters):

> Free videos and MCQ quizzes, plus Notes for AYUSH exam preparation

**Full description**:

> MedVeda is an exam-preparation app for BAMS, BHMS, BUMS, BSMS and BNYS
> students. Explore course, year and subject-wise learning content to support
> your study routine.
>
> Video lectures and MCQ quizzes are free for every student. PDF Notes are
> paid content and may be purchased as individual chapter, subject, year or
> bundle packs where available. Use the app to review study material, practise
> with quizzes and track your quiz scores.
>
> MedVeda provides educational content for exam preparation only. It does not
> provide medical advice, diagnosis or treatment.

## 7. Play Console — App content

**Privacy Policy URL**: `https://www.medveda.in/privacy-policy`

**Terms of Service URL**: `https://www.medveda.in/terms`

**Delete-account URL**: `https://www.medveda.in/delete-account`

**App access**: The app requires login. In Play Console → App content → App
access, provide test credentials for a verified student account with a paid
Note already unlocked and clear steps to reach a still-locked Note's checkout.
Explain that paid digital Notes use Google Play Billing in the Play build.
A reviewer can inspect an already-unlocked Note without paying. Put
credentials in the Console only, never in this repository.

**Ads**: No ads.

**Content rating**: Complete this as an educational exam-preparation app.

**Target audience**: VERIFY MANUALLY.

**Data safety**: VERIFY MANUALLY against the release build, the privacy policy,
and every enabled third-party service. The billing flow handles purchase history and Play purchase/obfuscated account
identifiers. Review the data types collected by the actual release build and
any enabled third-party service. Use
[`DATA_SAFETY_AUDIT.md`](DATA_SAFETY_AUDIT.md) for the evidence inventory;
declare only data actually collected or shared by the release.

**Alternative billing**: Not enabled. Do not display Razorpay or a user-choice
alternative billing flow in a Google Play build while the app is ineligible.
The separate `razorpay-distribution` EAS profile is a staging-only internal
APK, not a Play submission; it requires isolated preview Supabase settings.

## 8. Submit

```bash
eas submit --platform android --profile production
```

Or upload the AAB manually in Play Console → Production → Create release.

## Final pre-submission checklist

- [ ] Supabase Edge Functions `create-order`, `verify-payment`, and
      `delete-account` are deployed.
- [ ] Required Supabase Edge Function secrets are set.
- [ ] RLS is enabled on all Supabase tables.
- [ ] The resolved `production` and `internal-testing` app configs select
      Google Play Billing and do not register a user-choice billing program.
- [ ] Razorpay checkout is unavailable from every Play-distributed build.
- [ ] Every live active paid price has an exact active Play one-time SKU at the
      matching INR price. Record the inventory in `docs/UCB_SETUP.md`.
- [ ] Google Play Developer API service account permissions and Supabase
      secrets are configured server-side; no service-account key is shipped.
- [ ] Play grants are verified server-side before access is granted; test
      success, pending, cancel/failure, restore, and duplicate-purchase paths.
- [ ] A Play-installed, licensed Indian tester completes Play success,
      same-tier repeat purchase, cancel/failure, and recovery.
- [ ] VERIFY MANUALLY: full purchase flow is tested end-to-end with the
      production configuration.
- [ ] In-app Delete Account is tested.
- [ ] `google-services.json` is for `in.medveda.app` and is available locally
      or as the production `GOOGLE_SERVICES_JSON` EAS file secret.
- [ ] `eas build --platform android --profile production` succeeds.
- [ ] Play Console App access includes the verified test student credentials
      with an unlocked Note and checkout navigation steps.
- [ ] The live website Terms, Privacy and Refund pages accurately describe
      the payment provider available in this Play build.
- [ ] Play Console Data safety, content rating, store listing, screenshots,
      feature graphic, and the URLs above are complete.
- [ ] Developer-account identity verification is complete.
