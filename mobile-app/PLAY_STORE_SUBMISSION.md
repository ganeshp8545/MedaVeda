# AyurPulse — Play Store Submission Guide

Everything below assumes the `backend/` payment/auth/deletion work from
earlier is already deployed and working. This covers the remaining
build + Play Console steps.

## 1. Google Play Developer Account

- $25 one-time fee, sign up at https://play.google.com/console
- **Identity verification is mandatory** (government ID) and takes
  24-48 hours — do this FIRST, before your build is ready, so it's not
  the thing blocking your launch day.

## 2. Assets you need to create

| Asset | Size | Used for |
|---|---|---|
| App icon | 512×512 px, PNG | Play Store listing |
| Adaptive icon foreground | 1024×1024 px, PNG, transparent bg | Android home screen |
| Feature graphic | 1024×500 px | Top of your Play Store listing |
| Phone screenshots | min 2, max 8 (16:9 or 9:16) | Store listing |
| Splash screen image | any, referenced in `app.json` | App launch |

Put them at `mobile-app/assets/icon.png`, `adaptive-icon.png`,
`splash.png` (paths already wired up in `app.json`). The feature graphic
and screenshots are uploaded directly in Play Console, not bundled in
the app.

## 3. Fill in the placeholders

- `mobile-app/app.json` → `android.package` — pick your real package
  name now (e.g. `com.ayurpulse.app`); **this cannot be changed after
  your first release**, choose carefully
- `mobile-app/app.json` → `extra.eas.projectId` — get this by running
  `eas init` (see below)
- `admin-panel/src/config/functionsBase.ts` and the `WEB_CHECKOUT_BASE_URL`
  function param — should already be filled in from the earlier steps

## 4. Build with EAS

```bash
cd mobile-app
npm install -g eas-cli
eas login
eas init                    # links this project, fills in projectId
eas build:configure         # confirms eas.json (already included)

# Test build first (installable APK, not for Play Store):
eas build --platform android --profile preview

# Real submission build (AAB, what Play Store actually wants):
eas build --platform android --profile production
```

EAS **generates and manages your signing keystore automatically** — you
don't need to create or store one yourself unless you want to (Play App
Signing is the modern recommended approach anyway, and is the default).

Target API level: EAS automatically targets whatever API level the
Expo SDK version you're on requires, which Expo keeps current with
Play Store's requirement. As of now (mid-2026) Play Store requires API
35+ for new submissions, rising to API 36 on **Aug 31, 2026** — as long
as you're on a reasonably current Expo SDK version when you build, this
is handled for you; just don't build with a very old/pinned Expo SDK.

## 5. Play Console — App Content section

Answer these once, they're mostly permanent:

**Privacy Policy URL**: `https://your-admin-domain.com/privacy`
(the page from the earlier delivery)

**App access**: "All functionality is available without special access"
— unless you want to provide Google a test login, which is a good idea
for review: create a test student account and mention its email/password
in the review notes.

**Ads**: No ads.

**Content rating questionnaire**: Answer as an **educational
reference/study app**. No violence, no user-generated content shown
publicly, no gambling. This should land you an "Everyone" rating.

**Target audience**: 18+ recommended (it's a professional/higher-education
exam prep app, not aimed at children) — this also simplifies the Data
Safety and Families Policy requirements, since you avoid the stricter
child-directed rules entirely.

**Data Safety form** - declare what the release build actually collects (kept in step with
the website privacy policy, `website/_src/pages/privacy-policy.html`, and with
`app.json` -> `android.blockedPermissions`):

| Data type (Play category) | Collected? | Shared? | Purpose |
|---|---|---|---|
| Name | Yes | No | Account management |
| Email address | Yes | No | Account management, authentication, account emails |
| Phone number | Yes (optional) | No | Account management, sign-in and password reset by number |
| User IDs (account id, referral code) | Yes | No | Account management, referral programme, fraud prevention |
| Purchase history | Yes | Yes - Razorpay (payment processor) | App functionality (payments) |
| Payment info (card / UPI / bank) | **No** - entered on Razorpay's checkout, never seen or stored by MedVeda | - | - |
| App interactions (quiz scores, screens, study events) | Yes | No | Analytics, app functionality |
| Crash logs and diagnostics | Yes, only if a Sentry DSN is set in the build | Yes - Sentry (service provider) | Fix bugs; personal data is scrubbed before sending |
| Device or other IDs (Expo push token, platform) | Yes, if notifications are allowed | Yes - Expo push service (service provider) | Deliver push notifications |
| Photos, files, contacts, location, microphone, camera | **No** | - | - |

Declare: data **encrypted in transit** (HTTPS everywhere), a way to **request deletion**
(in-app Profile -> Delete Account, and the `/delete-account` page - enter that URL in Play
Console), and that data is **not sold**. Downloaded notes are stored in app-private storage,
excluded from Android backups (`allowBackup: false`) and deleted when the student signs out.

Permissions the release manifest requests: `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`,
plus the library-provided `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `WAKE_LOCK`,
`RECEIVE_BOOT_COMPLETED` (study reminders) and `DETECT_SCREEN_CAPTURE`. Storage, media,
overlay (`SYSTEM_ALERT_WINDOW`) and `DOWNLOAD_WITHOUT_NOTIFICATION` are blocked. After each
build, check the "Permissions" list in Play Console -> App bundle explorer matches this.

**Financial features declaration**: Since real payments happen (even via
browser checkout), declare "Digital purchases through a payment
processor (Razorpay)."

## 6. Store listing text (draft — edit freely)

**Short description** (80 chars):
> Ayurveda exam prep — Notes, Video Lectures & MCQ Quiz for BAMS students

**Full description** (draft, expand as you like):
> AyurPulse helps BAMS students prepare with Year-wise and Subject-wise
> study material — free Video Lectures for every subject, plus PDF Notes
> and MCQ Quiz you can unlock individually per subject. Track your quiz
> scores and progress as you study.

## 7. Submit

```bash
eas submit --platform android --profile production
```
Or upload the `.aab` manually in Play Console → Production → Create
release. First submission goes through Google's review (can take a few
days to a couple weeks for a new developer account/app).

## Final pre-submission checklist (pulling together everything from this whole project)

- [ ] `backend/` functions deployed, secrets set, `functionsBase.ts` +
      `WEB_CHECKOUT_BASE_URL` filled in with real deployed URLs
- [ ] Firestore rules merged and deployed (`firestore/firestore.rules.snippet`)
- [ ] Admin Panel deployed, `/login` works, you've granted yourself the
      `admin` claim (`backend/scripts/setAdminClaim.js`)
- [ ] `/privacy`, `/terms`, `/delete-account` all load correctly on the
      deployed Admin Panel domain
- [ ] At least one Product created per Subject, with Notes/Videos/Quiz
      attached, so the app isn't empty on first review
- [ ] Tested the full purchase flow end-to-end with Razorpay **test**
      keys (browser checkout → verify → unlock)
- [ ] Switched to Razorpay **live** keys before the build you actually
      submit
- [ ] In-app "Delete Account" tested (Profile → Delete Account)
- [ ] `app.json` package name finalized, icons/splash in place
- [ ] `eas build --platform android --profile production` succeeds
- [ ] Play Console: Data Safety form, content rating, store listing,
      screenshots, feature graphic all filled in
- [ ] Identity verification on your Developer account completed
