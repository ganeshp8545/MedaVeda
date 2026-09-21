# Sentry setup (mobile app)

**Status: code ready, not configured** — no DSN is set in EAS, so Sentry is currently disabled in builds (`enabled: !__DEV__ && Boolean(dsn)`).

## Already in the code (`mobile-app/src/config/sentry.ts`)
- DSN comes only from `EXPO_PUBLIC_SENTRY_DSN` (a public value); nothing hardcoded. No auth token exists anywhere in the app.
- `sendDefaultPii: false`, no user object, request/headers/cookies/extra removed, screenshots and view hierarchy off, console + navigation breadcrumbs dropped,
  network breadcrumbs stripped of query strings, tracing off (`tracesSampleRate: 0`, span names are URLs), messages scrubbed of emails, phone numbers, JWTs and Razorpay ids.
- `release` = `<applicationId>@<versionName>+<versionCode>` (e.g. `com.ayurpulse.app@1.1.0+42`), `environment` = `production`.

## Owner steps
1. sentry.io → create a React Native project → copy the **DSN** (public).
2. `eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --environment production --visibility plaintext` (or add it to the production profile's `env` in `eas.json`; a DSN is not a secret).
3. Rebuild the app (env vars are baked in at build time).
4. Verify: install the release build, trigger a handled test error (temporary code, or a debug build with `enabled` overridden), confirm the event appears with release `com.ayurpulse.app@<version>+<code>`, and **contains no email, phone, user object, or request body**.

## Source maps (optional, recommended; not enabled)
Readable stack traces need source maps uploaded at build time. That needs a Sentry **auth token**, which must live only in the EAS build environment
as a *secret* (`eas env:create --name SENTRY_AUTH_TOKEN --visibility secret`) and never in the app, `eas.json` or git. Add the `@sentry/react-native/expo`
config plugin with `organization`/`project` in `app.json` only when the token is set, otherwise the build fails at the upload step. Without it Sentry
still reports crashes, with minified frames.
