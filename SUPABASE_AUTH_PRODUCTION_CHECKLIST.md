# Supabase Auth — production checklist (owner)

Live values below were **read with `supabase config diff` on 2026-09-21** (read-only). Items marked ☐ still need the owner; nothing was changed by Claude.

| # | Setting (Dashboard → Authentication) | Live now | Target | State |
|---|---|---|---|---|
| 1 | URL Configuration → **Site URL** | `https://medveda.in` (redirects to www) | `https://www.medveda.in` | ☐ change |
| 2 | **Redirect URLs** | `https://medveda.in/`, `/**`, `/reset-password`, `/auth/callback`, `https://www.medveda.in/**` | exactly: `https://www.medveda.in/reset-password`, `https://www.medveda.in/account-verified`, `ayurpulse://reset-password`. Keep the apex entries only until old app builds (which send the apex URLs) are gone; then delete them and the `/**` wildcards | ☐ tighten |
| 3 | Email → **Confirm email** | on | on | ✔ confirmed |
| 4 | **SMTP** | custom, `smtp.resend.com:465`, sender `noreply@medveda.in`, 30 emails/h | keep; verify SPF/DKIM/DMARC for medveda.in in Resend; send a real signup + reset mail to Gmail and check it is not spam | ☐ verify |
| 5 | **Password policy** | min 6, no complexity | min 8 + lower/upper/digit/symbol (`supabase config push`, see `docs/security/PASSWORD_POLICY.md`) | ☐ apply |
| 6 | **Leaked-password protection** | not confirmed | on (Pro plan only) | ☐ enable / confirm plan |
| 7 | **CAPTCHA** (Attack Protection) | not confirmed | enable Cloudflare Turnstile/hCaptcha **only together with an app release that sends the captcha token**; enabling it alone breaks signup/login in the current app | ☐ decide |
| 8 | **MFA** | TOTP enroll + verify enabled; 0 admins enrolled | enrol admins, then `set_admin_mfa_required(true)` (`docs/security/ADMIN_MFA.md`) | ☐ |
| 9 | Password-changed notification email | on | on | ✔ |
| 10 | Email OTP length / expiry | 8 digits | ok (email OTP login is used by the app) | ✔ |
| 11 | Phone provider (Twilio shown enabled) | Twilio provider shown enabled, unused (no phone-verification flow; `referral_settings.require_verified_phone` is off) | keep phone signup **disabled** unless a flow is built | ☐ confirm |
| 12 | Rate limits | email 30/h | acceptable; review after launch | ✔ |

Verification after each change: sign up a throwaway account (weak password must fail with 422), confirm the verification mail opens `https://www.medveda.in/account-verified`,
run forgot-password and confirm the link opens `https://www.medveda.in/reset-password` then the app.
