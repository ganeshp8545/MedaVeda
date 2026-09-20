# MedVeda website (medveda.in)

Static HTML/CSS/JS, deployed on Vercel (`vercel.json`, `cleanUrls`). No framework.

- Edit page bodies in `_src/pages/*.html`, shared header/footer in `scripts/build.mjs`, FAQ in `_src/faq.mjs`.
- `node scripts/build.mjs` regenerates the plain `.html` files and `sitemap.xml` (output is committed).
- `node scripts/check-links.mjs` checks links, anchors, tag balance and per-page SEO tags.
- Business details (address, phone, hours, grievance officer, policy timings) and the policy effective date live in the `V` table / `EFFECTIVE_DATE` constant at the top of `scripts/build.mjs`; pages reference them as `{{KEY}}` and the build fails on unknown keys.
- Only the public Supabase URL + anon key are used (`assets/js/config.js`).
