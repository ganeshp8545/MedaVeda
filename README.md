# MedVeda

Study app for the five AYUSH degrees: a React Native mobile app, an admin panel, a marketing website and a Supabase backend (Postgres, RLS, Edge Functions) with Razorpay payments.

## Structure

| Folder | What it is | Stack |
|---|---|---|
| [mobile-app/](mobile-app) | Student app (Android/iOS) | Expo, React Native, TypeScript |
| [admin-panel/](admin-panel) | Admin dashboard | React, Vite, TypeScript, Tailwind |
| [website/](website) | Public site and legal pages (medveda.in) | Static HTML/CSS/JS |
| [supabase/](supabase) | Migrations, Edge Functions, SQL tests, `config.toml` | Postgres, Deno |
| [docs/](docs) | Analysis notes and the long [setup guide](docs/SETUP_GUIDE.md) | Markdown |

## Run locally

Requires Node 20+, the Supabase CLI and (for the app) Expo tooling. Copy each `.env.example` to the real file named below and fill in your own values. Never commit real `.env` files.

**mobile-app**
```bash
cd mobile-app && cp .env.example .env
npm install
npx expo start        # or: npm run android / npm run ios / npm run web
```

**admin-panel**
```bash
cd admin-panel && cp .env.example .env.local
npm install
npm run dev
```

**website**
```bash
cd website
node scripts/build.mjs        # regenerates the .html pages and sitemap.xml
node scripts/check-links.mjs  # links, anchors and SEO checks
npx serve .                   # any static server works
```

**supabase**
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push                                    # apply supabase/migrations
cp supabase/functions/.env.example supabase/functions/.env
supabase functions serve --env-file supabase/functions/.env
```
SQL checks live in `supabase/tests/`.

## Environment variables (names only)

| Part | Variables | Template |
|---|---|---|
| mobile-app | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN` | [mobile-app/.env.example](mobile-app/.env.example) |
| admin-panel | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | [admin-panel/.env.example](admin-panel/.env.example) |
| Edge Functions | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ALLOW_TEST_MODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | [supabase/functions/.env.example](supabase/functions/.env.example) |

Only public/publishable Supabase keys go in the app and admin panel. The service-role key and Razorpay secrets exist only as Supabase function secrets (`supabase secrets set ...`).

## Deploy

- **Edge Functions and DB:** `supabase db push`, then `supabase functions deploy <name>`. Set secrets with `supabase secrets set`. Use live Razorpay keys in production and leave `ALLOW_TEST_MODE` unset.
- **Admin panel:** `npm run build`, deploy `dist/` (Vercel; needs SPA rewrites to `index.html`).
- **Website:** deployed on Vercel from `website/` (`vercel.json`); the built `.html` files are committed.
- **Mobile app:** EAS Build (`eas build --platform android --profile production`); see `mobile-app/eas.json`.

Full step-by-step instructions: [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md).
