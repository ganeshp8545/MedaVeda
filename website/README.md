# MedVeda website (medveda.in)

Static HTML/CSS/JS, deployed on Vercel (`vercel.json`, `cleanUrls`). No framework.

- Edit page bodies in `_src/pages/*.html`, shared header/footer in `scripts/build.mjs`, FAQ in `_src/faq.mjs`.
- `node scripts/build.mjs` regenerates the plain `.html` files and `sitemap.xml` (output is committed).
- `node scripts/check-links.mjs` checks links, anchors, tag balance and per-page SEO tags.
- Highlighted `{{PLACEHOLDERS}}` on the pages must be filled in before launch (`grep -o "{{[A-Z_]*}}" *.html | sort -u`).
- Only the public Supabase URL + anon key are used (`assets/js/config.js`).
