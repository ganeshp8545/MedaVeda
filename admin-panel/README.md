# MedVeda admin panel

React + TypeScript + Vite + Tailwind. Signs in with Supabase Auth; only accounts listed in `public.admins`
get past `ProtectedRoute` (checked with the `am_i_admin()` RPC, and again by row-level security on every table).

```bash
cp .env.example .env.local     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key only)
npm install
npm run dev                    # http://localhost:5173
npm run build                  # type-check + production bundle in dist/
```

## Deploying (Vercel)
Framework Vite, build `npm run build`, output `dist`. `vercel.json` provides the SPA rewrite, the security
headers (CSP limited to this project's Supabase URL, HSTS, frame-ancestors none) and `noindex`. If the Supabase
project URL changes, update `connect-src` in `vercel.json`.

## Adding an admin
There is deliberately no UI. Create the user in Supabase Auth (email confirmed), then in the SQL editor:
`insert into public.admins (id, email) select id, email from auth.users where email = 'person@example.com';`
Enable MFA for admin accounts in the Supabase dashboard.
