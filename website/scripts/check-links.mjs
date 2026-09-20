// Crawls the built HTML in website/ and checks: internal links/assets/anchors resolve (using Vercel cleanUrls
// semantics), tags are balanced, every page has title/description/canonical/h1, images have alt.
// Run: node scripts/check-links.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(root).filter((f) => f.endsWith(".html"));
const VOID = new Set(["meta", "link", "img", "br", "hr", "input", "source", "path", "circle", "rect", "area", "base", "col", "embed", "track", "wbr"]);
let errors = 0;
const err = (f, m) => { errors++; console.error(`✗ ${f}: ${m}`); };

const resolve = (p) => {
  if (p === "/" ) return "index.html";
  const clean = p.replace(/^\//, "");
  for (const c of [clean, clean + ".html"]) if (existsSync(join(root, c)) && !existsSync(join(root, c, "/")) ) return c;
  return existsSync(join(root, clean)) ? clean : null;
};
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const cache = Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), "utf8")]));

for (const f of files) {
  const html = cache[f];
  if (!/<title>[^<]{3,}<\/title>/.test(html)) err(f, "missing title");
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) err(f, "missing meta description");
  if (!/<link rel="canonical"/.test(html)) err(f, "missing canonical");
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  // auth pages hold one h1 per UI state (only one is visible at a time)
  if (/name="robots" content="noindex/.test(html) ? h1s < 1 : h1s !== 1) err(f, `unexpected h1 count (${h1s})`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt=/.test(m[0])) err(f, `img without alt: ${m[0].slice(0, 60)}`);
  if (/\{\{[A-Za-z_:]+\}\}/.test(html.replace(/<mark class="ph">[^<]*<\/mark>/g, ""))) err(f, "unresolved template token");

  // tag balance (ignores script/style bodies, comments)
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/g, "<$1></$1>");
  const stack = [];
  for (const m of stripped.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, close, tag0, self] = m; const tag = tag0.toLowerCase();
    if (VOID.has(tag) || self) continue;
    if (!close) stack.push(tag);
    else { const top = stack.pop(); if (top !== tag) { err(f, `mismatched </${tag}> (open: ${top})`); break; } }
  }
  if (stack.length) err(f, `unclosed tags: ${stack.join(",")}`);

  const ids = idsOf(html);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|ayurpulse:|data:|#$)/.test(u)) continue;
    if (u === "#") continue;
    if (u.startsWith("#")) { if (!ids.has(u.slice(1))) err(f, `missing anchor ${u}`); continue; }
    const [path, hash] = u.split("#");
    const target = resolve(path.split("?")[0]);
    if (!target) { err(f, `broken link ${u}`); continue; }
    if (hash && target.endsWith(".html") && !idsOf(cache[target] ?? readFileSync(join(root, target), "utf8")).has(hash)) err(f, `missing anchor ${u}`);
  }
}
for (const p of ["robots.txt", "sitemap.xml", "site.webmanifest"]) if (!existsSync(join(root, p))) err(p, "missing");
console.log(errors ? `\n${errors} problem(s)` : `OK: ${files.length} pages checked, no problems`);
process.exit(errors ? 1 : 0);
