# mobile-app error report

Scope: `mobile-app/` (nested git repo, branch `release/multi-course`). Nothing was run against production Supabase.
Expected and deliberately left alone: PGRST200 `profiles` -> `courses` (multi-course migrations not applied live yet).

## Results

| Check | Before | After |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors |
| `npx expo-doctor` | 5 of 21 failed | 20 of 21 pass; only the `splash` schema error remains (awaiting decision) |
| `npx expo install --check` | 14 packages behind | up to date |
| Hermes V1 memory regression | present (expo 57.0.7 / RN 0.86.0) | gone (RN 0.86.3, expo 57.0.24) |
| Lint | not configured | not configured |
| Circular deps (madge) | 2 | 1, type-only, erased at build (madge does not skip type imports) |
| Web bundle (`expo export -p web`) | failed (wasm unresolved) | succeeds |
| `expo start --web`, headless Chromium | bundle failed | loads to Login; no red errors, no pageerrors |

## Fixed (mobile-app commits)

| Group | Commit | Files | What |
|---|---|---|---|
| Web | 9ae0f44 | `metro.config.js` (new), `src/hooks/usePreventScreenshot.ts` | `.wasm` treated as an asset so the web bundle builds; screen-capture skipped on web |
| Cycle | 6ee4b6f | `src/utils/notificationPreferences.ts` | `import type` for `NotificationType` |
| Cycle + push | d399ef8 | `pushNotifications.ts`, `authState.ts`, `App.tsx` | `registerForPushNotifications(user)` takes the user, so `pushNotifications` no longer imports `authState`. Push is disabled on web. Push token and upsert debug logging removed, duplicate `throw` removed, unregister catch tidied. `getSession()` now has a `.catch`, and `enforceNotBlocked` rejections are caught |
| Web SQLite | 29a1d4b | `config/database.ts`, `syncEngine.ts`, `quizAttempts.ts`, `downloadManager.ts`, `DownloadsScreen.tsx` | New `OFFLINE_DB_SUPPORTED` flag (false on web). DB init, downloads, sync queue and quiz-attempt storage are no-ops on web. Downloads shows "Offline downloads are available in the mobile app." |
| Deps | c979b2d | `package.json`, lockfile | `eas-cli` removed (use `npx eas-cli`) |
| Deps | 7298f17 | `package.json`, lockfile, `app.json` | Added `expo-font`, `react-native-worklets`, plus the `expo-font` config plugin. `expo install --fix`: patch/minor only, no majors |
| Warnings | 32cdc78 | `PaymentCheckoutScreen`, `GradientBackground`, `SuccessBurst`, `StudentProfileCard` | `pointerEvents` prop moved into `style` |

## Left / open

| # | Item | Why not fixed | Risk |
|---|---|---|---|
| L1 | **`app.json` top-level `splash` (only remaining expo-doctor failure)** | Its image `./assets/splash-icon.png` no longer exists (deleted in commit e45ab9f; only `assets/splash.png`, 941x1672 portrait, remains). Also, in SDK 57 the top-level key is ignored, so the plugin's defaults apply today. A straight move would reference a missing file. Needs your decision, see below | med |
| L2 | `shadow*` deprecation (web warning: `"shadow*" style props are deprecated`) | Sites: `src/theme/shadows.ts`, `QuizScreen.tsx:355`, `SearchBar.tsx:92`. `boxShadow` blur is not numerically identical to `shadowRadius`, so it needs a visual check on a device | low/med |
| L3 | expo-notifications web warning "Listening to push token changes..." | Emitted by the library itself on web; harmless | none |
| L4 | Sync SQLite calls (`getAllSync`/`runSync`/`execSync`, ~25 in downloadManager/syncEngine/quizAttempts) | Async migration is a refactor, not mechanical | med |
| L5 | `babel.config.js` still lists `react-native-reanimated/plugin`; with reanimated 4 the plugin lives in `react-native-worklets` and `babel-preset-expo` already adds it | Verify on a device build before removing | low |
| L6 | Screens firing `loadX()` from effects without unmount guards | RN 0.86 no longer warns; not a crash. Home/Onboarding show their own error state for PGRST200 (verify on device) | low |
| L7 | 24 npm audit findings | Out of scope | n/a |

Nothing needs a native rebuild to be verified on web, but **the dependency bumps (RN 0.86.3, reanimated, worklets, expo-* patches) need a fresh Android dev build** before release.

## Manual Android test steps

Prereq: Android dev build (`npx expo run:android` or an EAS development build). **Razorpay checkout needs a development build; it does not work in Expo Go.** Push notifications also do not work in Expo Go. Point the build at a non-production Supabase project, or expect the PGRST200 error until migrations are applied.

1. **Login:** launch, splash shows, Login screen appears. Wrong password shows an error. Correct credentials go to Home (or onboarding). Kill and reopen: session persists. Forgot password sends a reset email. A blocked account (`profiles.blocked`) is signed out.
2. **Onboarding course/year:** a new profile with no course lands on the picker. Pick a course and year, then continue; you cannot skip it. Kill and reopen: it does not reappear. With PGRST200 you should see an error and retry state, not a crash.
3. **Home:** loads years, latest, recent activity and the notification badge. Pull to refresh. Switching course changes the content list.
4. **Notes PDF:** open a free note and a purchased note; the PDF renders and scrolls. An unpurchased paid note is gated. A screenshot on Android comes out black (FLAG_SECURE), and the recents thumbnail is black.
5. **Videos:** open a video; it plays, and fullscreen and back work.
6. **Quiz:** start a test, answer, submit, and check the score. Airplane mode: the attempt is stored locally. Go back online: it syncs (row in `quiz_scores`).
7. **Store:** products load, and the purchased state is correct. Checkout opens Razorpay (dev build). Test-mode payment succeeds and shows the Success screen, the item is unlocked, and cancelling or failing shows the Failed screen.
8. **Downloads:** download a note and a quiz. Progress shows, and pause, resume and retry work. Kill the app mid-download: the item comes back as paused. Airplane mode: downloaded items still open. Delete one and clear all. Items from another course are hidden.
9. **Profile:** edit name and phone, change password, and log out. The `push_tokens` row is removed on logout.
10. **Referral:** the Refer and Earn screen shows your code and the copy and share buttons work. Applying a valid code succeeds. An invalid or own code shows an error.
11. **Update gate:** in `app_config`, set the minimum version above the installed version. On launch, and on resume from background, the blocking "Update required" screen appears with a working store link. Restore the value and confirm the app opens normally. Any failure fetching the config must fail open.
12. **Push:** grant the notification permission, confirm a `push_tokens` row is created, send a test push, and tap it to deep-link.
