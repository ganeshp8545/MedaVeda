# Admin panel — Vercel deployment

**Status: not deployed.** Prepared and build-verified only (`npm ci && npm run build` passes).

**The URL is not a security control.** Anyone can find or guess the panel address. Authorization is enforced by Supabase:
every admin table policy and RPC uses `am_i_admin()` (row in `public.admins`, plus AAL2 once admin MFA is switched on —
`docs/security/ADMIN_MFA.md`), and `send-push-notification` re-checks `public.admins` server-side. The panel's own route guard is only UX.
The panel ships `X-Robots-Tag: noindex` and `robots.txt` Disallow, which only keeps it out of search results.

## Settings (already in the repo)
| Setting | Value |
|---|---|
| Root Directory | `admin-panel` |
| Framework preset | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node | 22 |
Environment variables (Production **and** Preview; only public values): `VITE_SUPABASE_URL=https://xbvenkfmesugrbjuufyw.supabase.co`,
`VITE_SUPABASE_ANON_KEY=<publishable/anon key>`. Never the service-role key.

`admin-panel/vercel.json` provides: SPA rewrite (`/(.*)` → `/index.html`, so refresh/deep links such as `/orders` work), CSP
(`script-src 'self'`, `connect-src` limited to the Supabase project, `frame-ancestors 'none'`), HSTS, nosniff, `X-Frame-Options: DENY`,
no-referrer, Permissions-Policy, noindex, immutable caching for `/assets`, no-store for `index.html`. If the Supabase project URL ever changes, update `connect-src`.

## Steps
1. Vercel → Add New Project → import the repo → set Root Directory `admin-panel`; confirm the table above; add the two env vars.
2. Deploy from the merged `main` (or a preview of the PR).
3. Supabase → Authentication → URL Configuration: no change needed for the panel (it uses password + TOTP, no redirect flows). Do **not** add wildcard Vercel preview URLs.
4. Verify headers: `curl -sI https://<panel-domain>/ | grep -i "content-security\|strict-transport\|x-frame\|x-robots"`.
5. Verify deep link: open `https://<panel-domain>/orders` signed out → redirected to `/login`; refresh on `/login` works (no 404).
6. Sign in with an admin: first sign-in shows the MFA enrolment screen (see `docs/security/ADMIN_MFA.md`). A normal student account must get "This account doesn't have admin access."
7. Check the browser console for CSP violations on Dashboard, Orders, Notifications (send a test notification), Notes (PDF open).
8. Only then follow the MFA sequence and switch `require_mfa` on.
