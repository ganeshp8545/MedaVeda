// Tiny static generator: _src/pages/*.html (body fragments) + shared layout -> plain HTML in website/.
// Run: node scripts/build.mjs   (output is committed plain HTML; there is no runtime dependency)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAQ } from "../_src/faq.mjs";
import { ICONS } from "../_src/icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.medveda.in";
const YEAR = new Date().getFullYear();
const PLAY = "https://play.google.com/store/apps/details?id=com.ayurpulse.app";
const EMAIL = "medvedaforu@gmail.com";
const WHATSAPP = "https://wa.me/917620616068";

// Single place for owner-supplied business details. Pages use {{KEY}} tokens; the build fails on unknown tokens.
const EFFECTIVE_DATE = "20 September 2026"; // change on launch day, then re-run the build
const V = {
  EFFECTIVE_DATE,
  COMPANY_LEGAL_NAME: "MedVeda",
  BUSINESS_ADDRESS: "Dhule, Maharashtra, India",
  SUPPORT_PHONE: "+91 76206 16068 (also WhatsApp)",
  SUPPORT_HOURS: "Monday to Saturday, 10:00 AM \u2013 6:00 PM IST (excluding public holidays)",
  GRIEVANCE_OFFICER_NAME: "Ashwini",
  GRIEVANCE_OFFICER_EMAIL: EMAIL,
  GRIEVANCE_ACK_TIME: "within 48 hours",
  GRIEVANCE_RESOLUTION_TIME: "within 15 working days (and in any case within one month)",
  JURISDICTION_CITY: "Dhule, Maharashtra",
  DATA_RETENTION_PERIOD: "Account data is kept while the account is active. After account deletion, personal data is erased within 30 days, except records we must keep by law (payment, invoice and tax records, kept for up to 8 years under Indian tax and accounting laws).",
  ANALYTICS_RETENTION_PERIOD: "up to 12 months, after which it is deleted or kept only in anonymised, aggregated form",
  RIGHTS_RESPONSE_TIME: "within 30 days",
  TEAM_INTRO: "MedVeda is built by a small team from Maharashtra that understands the needs of AYUSH students \u2013 organised notes, clear video lectures and regular practice tests, arranged by course and year.",
  IOS_STATUS: "MedVeda is currently available on Android. An iOS version is not available yet.",
  PRICING_AND_TAX_NOTE: "All prices are shown in Indian Rupees (INR) and are inclusive of applicable taxes, if any.",
  TAX_NOTE: "Any applicable taxes are included in the displayed price.",
  ACCESS_PERIOD: "Purchased content has no fixed expiry. Access continues for as long as your account is active and the content is offered on the platform, subject to these Terms.",
  AFFILIATION_STATEMENT: "MedVeda is an independent educational platform. It is not affiliated with, endorsed by, or connected to the Ministry of AYUSH, NCISM, NCH, any university, college or government body.",
  DIGITAL_PURCHASES_REFUNDABLE: "Because content is digital and unlocked instantly, purchases are generally non-refundable once the content has been unlocked, except in the cases listed below.",
  REFUND_WINDOW: "Refund requests for the cases below must be raised within 7 days of the payment.",
  REFUND_CONDITIONS: "(a) payment deducted but content not unlocked within 24 hours; (b) duplicate or multiple payments for the same purchase; (c) technical fault on our side that prevents access and that we cannot fix within 7 days.",
  CANCELLATION_RULES: "You can cancel before completing payment. After a successful payment the purchase cannot be cancelled, except as covered in the refund cases above.",
  FAILED_PAYMENT_REVERSAL_DAYS: "5\u20137 working days (as per your bank / RBI timelines)",
  DUPLICATE_PAYMENT_RULES: "Any duplicate amount is refunded in full to the original payment method.",
  REFUND_TIMELINE: "Approved refunds are credited to the original payment method within 5\u20137 working days.",
  REFUND_RESPONSE_TIME: "within 48 hours",
  DELIVERY_WAIT_TIME: "Access is usually instant. If it doesn't appear within 30 minutes, restart the app; if it still doesn't appear within 24 hours, contact support with your payment ID.",
  DELETION_TIMELINE: "within 30 days of the request",
  DELETION_RETENTION_CONFIRM: "Payment, order and invoice records are retained for up to 8 years as required by Indian tax and accounting laws. Backups are overwritten within 90 days. Everything else linked to your account is deleted.",
};
V.GRIEVANCE_BLOCK = `<p>Name: ${V.GRIEVANCE_OFFICER_NAME}<br>Email: <a href="mailto:${V.GRIEVANCE_OFFICER_EMAIL}">${V.GRIEVANCE_OFFICER_EMAIL}</a><br>Phone: ${V.SUPPORT_PHONE}<br>Address: ${V.BUSINESS_ADDRESS}<br>Support hours: ${V.SUPPORT_HOURS}</p><p class="meta">We acknowledge complaints ${V.GRIEVANCE_ACK_TIME} and resolve them ${V.GRIEVANCE_RESOLUTION_TIME}, as required by the Information Technology Act, 2000 and rules, the Consumer Protection (E-Commerce) Rules, 2020 and the Digital Personal Data Protection Act, 2023.</p>`;

const SB_VERSION = "2.110.3";
const SB_SRI = "sha384-sihuiVHG7vyEIuePVbLI4QpHu1dbhCZe4Zqp0FuqnFeEnyIhF3koyXoBZyfbFsYs";

const NAV = [
  ["/", "Home"], ["/features", "Features"], ["/courses", "Courses"], ["/how-it-works", "How it works"],
  ["/faq", "FAQ"], ["/about", "About"], ["/contact", "Contact"],
];
const FOOT = {
  Product: [["/", "Home"], ["/features", "Features"], ["/courses", "Courses"], ["/how-it-works", "How it works"], ["/download", "Download app"]],
  Company: [["/about", "About us"], ["/contact", "Contact"]],
  Legal: [["/privacy-policy", "Privacy Policy"], ["/terms", "Terms & Conditions"], ["/disclaimer", "Disclaimer"], ["/refund-policy", "Refund & Cancellation"], ["/shipping-policy", "Shipping & Delivery"]],
  Support: [["/faq", "FAQ"], ["/delete-account", "Delete account & data"], [`mailto:${EMAIL}`, EMAIL], [WHATSAPP, "WhatsApp"]],
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] ?? ICONS.book}</svg>`;

const playBadge = (cls = "") => `<a class="play-badge ${cls}" href="${PLAY}" rel="noopener" target="_blank"><svg width="26" height="28" viewBox="0 0 26 28" aria-hidden="true"><path d="M2 1.2 15 14 2 26.8c-.6-.3-1-1-1-1.8V3c0-.8.4-1.500 1-1.800z" fill="#4c9a6b"/><path d="M15 14 19.500 9.500 4.200.6C3.500.2 2.700.2 2 1.200z" fill="#3e8e7e"/><path d="M15 14 2 26.800c.7 1 1.500 1 2.200.6l15.300-8.900z" fill="#e2703d"/><path d="m19.500 18.500 4.700-2.700c1.100-.6 1.100-2 0-2.600L19.500 9.500 15 14z" fill="#c99a3e"/></svg><span><small>Get it on</small><strong>Google Play</strong></span></a>`;

function faqHtml(items) {
  return items.map((q) => `<details><summary>${q.q}</summary><div class="ans">${q.a}</div></details>`).join("\n");
}
function faqGrouped() {
  const groups = [...new Set(FAQ.map((q) => q.group))];
  return groups.map((g) => `<h2 class="faq-group" id="${g.toLowerCase().replace(/\W+/g, "-")}">${g}</h2>\n${faqHtml(FAQ.filter((q) => q.group === g))}`).join("\n");
}
const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const faqJsonLd = () => ({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: FAQ.map((q) => ({ "@type": "Question", name: strip(q.q), acceptedAnswer: { "@type": "Answer", text: strip(q.a) } })),
});

function header(path) {
  const links = NAV.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="wrap header-in">
<a class="brand" href="/" aria-label="MedVeda home"><img src="/assets/img/logo-64.png" width="40" height="40" alt="">MedVeda</a>
<button class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="site-nav"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
<nav class="nav" id="site-nav" aria-label="Main">${links}<a class="btn accent" href="/download">Download app</a></nav>
</div></header>`;
}
function footer() {
  const cols = Object.entries(FOOT).map(([h, ls]) => `<div><h2>${h}</h2><ul>${ls.map(([u, t]) => `<li><a href="${u}"${u.startsWith("http") ? ' rel="noopener" target="_blank"' : ""}>${t}</a></li>`).join("")}</ul></div>`).join("");
  return `<footer class="site-footer"><div class="wrap"><div class="foot-grid">
<div class="foot-brand"><a class="brand" href="/"><img src="/assets/img/logo-64.png" width="40" height="40" alt="" loading="lazy">MedVeda</a>
<p>Notes, video lectures and MCQ tests for AYUSH degree students, in one app.</p>${playBadge()}<p style="margin-top:14px"><a href="mailto:${EMAIL}">${EMAIL}</a></p></div>
${cols}</div>
<div class="foot-bottom"><span>© ${YEAR} ${V.COMPANY_LEGAL_NAME}. All rights reserved.</span><span>MedVeda is an educational app, not medical advice. <a href="/disclaimer">Read the disclaimer</a>.</span></div></div></footer>`;
}

function head(m) {
  const url = SITE + (m.path === "/" ? "/" : m.path);
  const title = m.path === "/" ? m.title : `${m.title} | MedVeda`;
  const robots = m.noindex ? '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">' : '<meta name="robots" content="index, follow">';
  const ld = (m.jsonld ?? []).map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(m.description)}">
${robots}
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#8c3a22">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MedVeda">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/img/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${SITE}/assets/img/og-image.png">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/css/site.css">
${ld}
</head>`;
}

function render(m, body) {
  const tail = [];
  if (m.supabase) {
    tail.push(`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SB_VERSION}/dist/umd/supabase.js" integrity="${SB_SRI}" crossorigin="anonymous"></script>`);
    tail.push('<script src="/assets/js/config.js"></script>', '<script src="/assets/js/auth-common.js"></script>');
  }
  for (const s of m.scripts ?? []) tail.push(`<script src="${s}"></script>`);
  let html = `${head(m)}
<body>
${header(m.path)}
<main id="main">
${body}
</main>
${footer()}
<script src="/assets/js/site.js"></script>
${tail.join("\n")}
</body>
</html>
`;
  html = html
    .replace(/\{\{icon:([a-z-]+)\}\}/g, (_, n) => icon(n))
    .replace(/\{\{PLAY_BADGE\}\}/g, playBadge())
    .replace(/\{\{FAQ_ALL\}\}/g, faqGrouped())
    .replace(/\{\{FAQ_PREVIEW\}\}/g, faqHtml(FAQ.filter((q) => q.home)))
    .replace(/\{\{YEAR\}\}/g, String(YEAR))
    .replace(/\{\{PLAY_URL\}\}/g, PLAY)
    .replace(/\{\{SUPPORT_EMAIL\}\}/g, EMAIL)
    .replace(/\{\{WHATSAPP_URL\}\}/g, WHATSAPP)
    .replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => { if (!(k in V)) throw new Error(`Unknown placeholder ${m}`); return V[k]; });
  return html;
}

const pages = [];
for (const f of readdirSync(join(root, "_src/pages")).filter((x) => x.endsWith(".html"))) {
  const src = readFileSync(join(root, "_src/pages", f), "utf8");
  const mm = src.match(/^<!--META\s*([\s\S]*?)-->\s*/);
  if (!mm) throw new Error(`${f}: missing <!--META {...}--> header`);
  const m = JSON.parse(mm[1]);
  m.file = f.replace(/\.html$/, "");
  const body = src.slice(mm[0].length);
  if (m.file === "index") {
    m.jsonld = [
      { "@context": "https://schema.org", "@type": "Organization", name: "MedVeda", url: SITE + "/", logo: SITE + "/assets/img/logo-512.png", email: EMAIL },
      { "@context": "https://schema.org", "@type": "MobileApplication", name: "MedVeda", operatingSystem: "ANDROID", applicationCategory: "EducationalApplication", url: SITE + "/", downloadUrl: PLAY, image: SITE + "/assets/img/logo-512.png", description: m.description },
    ];
  }
  if (m.file === "faq") m.jsonld = [faqJsonLd()];
  writeFileSync(join(root, m.file + ".html"), render(m, body));
  pages.push(m);
}

const urls = pages.filter((p) => !p.noindex && p.file !== "404");
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((p) => `  <url><loc>${SITE}${p.path === "/" ? "/" : p.path}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
console.log(`built ${pages.length} pages, ${urls.length} in sitemap`);
