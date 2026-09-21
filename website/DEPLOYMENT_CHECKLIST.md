# Website deployment checklist (owner)

**Canonical host: `https://www.medveda.in`** (production config, 2026-09-21: the apex `medveda.in` answers `308 → https://www.medveda.in/`, and www serves the site).
Canonical URLs, `og:url`, JSON-LD, `sitemap.xml`, `robots.txt`, the password-reset and email-verification redirects (mobile app + `request-password-reset-by-mobile`)
and the app's legal links now all use www. Old app builds still send the apex URLs; those keep working through the 308 (URL fragment preserved) as long as the apex
stays in Supabase's Redirect URLs.

**Security headers are in `website/vercel.json` but are NOT live.** On 2026-09-21 `curl -I https://www.medveda.in` returned only `strict-transport-security: max-age=63072000`,
`x-content-type-options`, `x-frame-options` — no CSP, no Referrer-Policy/Permissions-Policy/preload HSTS. Nothing may be called live until the steps below are done.

☐ 1. Merge the PR and let Vercel deploy production (project root `website`, no build command needed — pages are pre-built; `node scripts/build.mjs` regenerates them).
☐ 2. `curl -sI https://www.medveda.in/ | grep -iE "content-security|strict-transport|x-content|x-frame|referrer|permissions|cross-origin"` — all six headers present; HSTS contains `preload`.
☐ 3. `curl -sI https://www.medveda.in/reset-password` shows `cache-control: no-store` and `referrer-policy: no-referrer`.
☐ 4. Browser DevTools console on `/`, `/download`, `/faq`: **no CSP violations** (fonts from Google Fonts and jsdelivr are allowed; nothing else external loads).
☐ 5. **Reset-password**: request a reset from the app → link opens `/reset-password` → set a policy-compliant password → success; weak password rejected. Check the console (supabase-js loads from cdn.jsdelivr.net; connect to `xbvenkfmesugrbjuufyw.supabase.co` must not be blocked).
☐ 6. **Account-verified**: new signup → mail link → `/account-verified` shows success.
☐ 7. **Supabase**: both flows above talk to Supabase from the browser (that is the connect-src allow-list).
☐ 8. `curl -s https://www.medveda.in/sitemap.xml | head` and `robots.txt` show www URLs; `curl -sI https://medveda.in` still 308s to www.
☐ 9. Supabase Site URL / Redirect URLs updated per `SUPABASE_AUTH_PRODUCTION_CHECKLIST.md`.
☐ 10. Search Console: add the www property, submit the sitemap.
