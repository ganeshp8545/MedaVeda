# Final production readiness report — MedVeda

Date: 2026-09-21 · Branch `production-hardening` · PR https://github.com/medvedaforu-oss/MedaVeda/pull/1 (not merged)
Legend: PASS · FAIL · BLOCKED — OWNER ACTION REQUIRED · NOT TESTED · NOT APPLICABLE. "PASS" is used only where the check was actually executed in this pass.

## Executive Summary
The repository side is finished: every security control from the audit is intact, the password policy, admin MFA (switchable, OFF by default), canonical host,
Sentry privacy and all owner runbooks are committed, all 6 CI jobs (including the database job, its first GitHub run) pass on PR #1, and a production AAB
(versionCode 7) was built from the committed code and statically re-checked. **Production is still NOT READY**: live Razorpay credentials, the Razorpay webhook,
the Supabase Auth password policy, admin MFA enrolment, the migration/function deploys, the website/admin deployments and all real-device testing are owner actions
that cannot be done from the repository.

## Fixed Issues
- Server-side password policy declared (`supabase/config.toml`): min 8 + lower/upper/digit/symbol; client symbol set aligned to Supabase's; self-test in CI. **Declared, not live.**
- Admin MFA: migration `20261001100000` — `am_i_admin()` requires `aal2` when `admin_settings.require_mfa`; ships OFF; safe enable function; push function honours it; admin login has TOTP enrol/challenge; 23 SQL checks.
- Canonical host `www.medveda.in` in canonical/og:url/JSON-LD/sitemap/robots and in the app + edge-function auth redirects.
- Sentry: tracing off, network breadcrumb query strings stripped.
- CI now runs the password self-test. Commits were already on `origin/production-hardening` (the "unpushed" premise was stale); PR opened.

## Remaining Blockers
1. Razorpay live Key ID/Secret invalid; webhook secret not entered in Razorpay; no live ₹1 test.
2. Password policy not applied on Supabase (live is min 6, no complexity).
3. Admin MFA: 0/3 admins enrolled; migration not deployed; switch OFF.
4. Migration `20261001100000` and edge functions `send-push-notification`, `request-password-reset-by-mobile` not deployed.
5. Website headers not live (verified live: no CSP); admin panel not deployed; Supabase Site URL/Redirect URLs not updated.
6. No real-device testing. FCM (`google-services.json`) not configured, so Android push will not work in this build. Sentry DSN not set.

## Security Status
- PASS (executed): `run-all.sh` ALL SUITES PASSED (12 numbered suites + 4 legacy-style suites), webhook harness 17/17, referral-cap race test, secrets scan (local + CI), `deno check` on 9 functions, mobile `tsc`, checkout self-test 9/9, admin `npm audit --omit=dev` 0 vulnerabilities.
- NOT TESTED: `npm audit` for mobile-app (reports vulnerabilities on install; not part of CI, not triaged).
- Admin-panel URL secrecy is not relied on for authorization (RLS / `am_i_admin()` / server checks).

## Supabase Status
- Local == remote migration list before this pass (audit); new migration `20261001100000` is **not applied live** → BLOCKED — OWNER ACTION REQUIRED.
- Live Auth read via `supabase config diff` (read-only): confirmations on, TOTP MFA enabled, SMTP Resend, wildcard redirects incl. `https://medveda.in/**`, Site URL `https://medveda.in`, password min 6.
- Leaked-password protection, CAPTCHA: NOT TESTED (not readable via CLI diff; Pro-plan / dashboard).

## Authentication Status
- Password policy: code PASS; live BLOCKED — OWNER ACTION REQUIRED. Expected accept/reject matrix in `docs/security/PASSWORD_POLICY.md`; the max-32 rule is client-only (Supabase cannot enforce it).
- Redirect constants now www; both hosts remain allowed in Supabase during the transition.
- Login/reset/verification flows end-to-end: NOT TESTED.

## Razorpay Status
- Code review of create-order, verify-payment, webhook, settlement, refund, wallet, referral, access: PASS (evidence table in `RAZORPAY_PRODUCTION_SETUP.md`); env names `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` confirmed.
- Live credentials + webhook + real payment: BLOCKED — OWNER ACTION REQUIRED.

## Referral Status
Referral/limits/anti-farming/refund SQL suites PASS (`phase2_referral_wallet_checks` 123, `referral_limits` 65, `batch3` 30, `batch3b` 31, `referral_off_wallet` 19); concurrency cap PASS. On-device referral flows: NOT TESTED.

## Wallet Status
Ledger, debit/credit idempotency, refund restore once-only, hold/flag paths: PASS in SQL suites. Concurrent requests on real devices/live: NOT TESTED.

## Admin Status
- Panel build PASS; MFA UI implemented, **not exercised against live Auth**: NOT TESTED. Deployment: BLOCKED — OWNER ACTION REQUIRED (`ADMIN_PANEL_DEPLOYMENT.md`). MFA enrolment + switch: BLOCKED — OWNER ACTION REQUIRED (`docs/security/ADMIN_MFA.md`).

## Website Status
- Build + link check PASS; headers in `vercel.json` verified in repo (CSP, HSTS+preload, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP); all external resources on pages are covered by the CSP (static check).
- **Live headers: FAIL/not live** (curl on 2026-09-21: only HSTS without preload, nosniff, X-Frame-Options). Deployment: BLOCKED — OWNER ACTION REQUIRED (`website/DEPLOYMENT_CHECKLIST.md`). No headless browser CSP run was executed in this pass: NOT TESTED.

## Mobile Status
Production AAB built by EAS from commit 1646373 (build `4e2f4d16-f95f-4598-90bf-c725b1488ebc`), **not submitted to Play Store**.
| Check (from the built AAB manifest / bundle) | Result |
|---|---|
| package / versionName / versionCode | `com.medveda.app` / `1.1.0` / `7` (remote counter 6→7) — PASS |
| debuggable | attribute absent → false — PASS |
| allowBackup / usesCleartextTraffic | `false` / `false` — PASS |
| Supabase URL / key | project URL + `sb_publishable_…` only — PASS |
| service-role key / Razorpay secret / `rzp_live_` / `rzp_test_` / `sb_secret_` / JWT-looking anon key | none found — PASS |
| Permissions | INTERNET, POST_NOTIFICATIONS, VIBRATE, ACCESS_NETWORK_STATE, ACCESS_WIFI_STATE, WAKE_LOCK, RECEIVE_BOOT_COMPLETED, DETECT_SCREEN_CAPTURE, USE_BIOMETRIC, USE_FINGERPRINT, c2dm RECEIVE, launcher-badge and install-referrer perms from libraries. No storage/media/overlay/download perms — PASS. USE_BIOMETRIC/USE_FINGERPRINT come from a library and are unused by app code I could find: low, not removed |
| Exported components | `MainActivity` (launcher + `medveda://`), plus two **third-party receivers exported but permission-guarded**: Firebase `FirebaseInstanceIdReceiver` (`c2dm.SEND`) and androidx `ProfileInstallReceiver` (`android.permission.DUMP`). Earlier "only MainActivity" was imprecise — PASS with note |
| Localhost / `http://` strings | `localhost:9999` (supabase-js auth default), `:8969`/`:8081` (RN/dev-server defaults in libraries), `fb.me` (React dev message), w3.org XML namespace; all traced to libraries; every application endpoint is `https` — PASS |
| `SENTRY_AUTH` string | Sentry Android SDK constant name in `classes3.dex`, not a token — PASS |
| Deep links | scheme `medveda` only; no https App Links — PASS |
| FCM / OTA code signing | no `google-services.json`, no signing certificate → push and signed OTA not enabled — BLOCKED — OWNER ACTION REQUIRED |
Mobile test suite: the app has no unit-test runner; executed `tsc --noEmit`, checkout self-test, password self-test, signature self-test. Everything else: NOT TESTED.

## CI/CD Status
PR #1: admin-panel, database, edge-functions, mobile-app, secrets-scan, website, Vercel preview — all PASS (GitHub run 35615558542; database job passed on GitHub for the first time). Merge: not done (needs owner approval). Vercel production deploy: BLOCKED — OWNER ACTION REQUIRED.

## Real Device Testing Status
NOT TESTED — no device connected. `REAL_DEVICE_RELEASE_TEST_CHECKLIST.md` is ready to run.

## Production Deployment Status
Nothing from this pass is live. Not deployed: migration, 2 edge functions, website, admin panel, Auth config, Play Store.

## Manual Owner Actions (in order)
1. `supabase config diff` → `supabase config push` (password policy), enable leaked-password protection if on Pro; update Site URL/Redirect URLs (`SUPABASE_AUTH_PRODUCTION_CHECKLIST.md`).
2. `supabase db push` (MFA migration, flag OFF) + `supabase functions deploy send-push-notification request-password-reset-by-mobile`.
3. Set live Razorpay secrets and webhook (`RAZORPAY_PRODUCTION_SETUP.md`).
4. Merge PR #1; deploy website (verify headers) and admin panel; enrol all 3 admins; `select public.set_admin_mfa_required(true)`.
5. Add `google-services.json` (FCM), `EXPO_PUBLIC_SENTRY_DSN`, optionally OTA signing; rebuild if any of these change.
6. Run `REAL_DEVICE_RELEASE_TEST_CHECKLIST.md` on the AAB/APK incl. the ₹1 live payment; then submit to Play.

## Final Launch Checklist
| Item | Status |
|---|---|
| Local suites / harness / race test | PASS |
| GitHub CI on PR | PASS |
| PR merged | NOT TESTED (not merged) |
| Password policy live | BLOCKED — OWNER ACTION REQUIRED |
| Admin MFA enrolled + enforced | BLOCKED — OWNER ACTION REQUIRED |
| Razorpay live keys + webhook | BLOCKED — OWNER ACTION REQUIRED |
| Live ₹1 payment / webhook / refund test | BLOCKED — OWNER ACTION REQUIRED |
| Website security headers live | BLOCKED — OWNER ACTION REQUIRED |
| Admin panel deployed | BLOCKED — OWNER ACTION REQUIRED |
| Sentry DSN | BLOCKED — OWNER ACTION REQUIRED |
| FCM push | BLOCKED — OWNER ACTION REQUIRED |
| Production AAB static checks | PASS |
| Real-device testing | NOT TESTED |
| Play Store submission | NOT APPLICABLE until the above |

## CODE FIXES COMPLETED
Password policy declaration + client alignment + tests; admin MFA migration, edge-function check, panel UI, tests; www canonical; Sentry hardening; CI update; all owner docs; PR opened; production AAB built and inspected.

## OWNER ACTIONS REQUIRED
See "Manual Owner Actions". Anything needing Razorpay/Supabase dashboard credentials, Vercel, Google/Firebase, Sentry, or a physical device.
