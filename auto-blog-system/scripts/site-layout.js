// Shared page shell for every generated page (blog, filters, area hubs, market
// reports): <head>, nav with the Areas menu, breadcrumbs, footer, JSON-LD helpers.
// All links are root relative ("/blog/") so pages work at any depth.

const { AREAS } = require("./taxonomy");

const SITE_URL = "https://jackmacdonaldre.com";
const CSS = "/_ds/classical-c3b261bd-4ba7-418e-89e4-a4cf1ab64e84/styles.css";
const VALUATION_URL = "/contact/?interest=home-value";
const SEARCH_URL = "/search.html";

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// JSON for <script type="application/ld+json">, safe against "</script>" in text.
function ldJson(obj) {
  return `<script type="application/ld+json">\n${JSON.stringify(obj).replace(/</g, "\\u003c")}\n</script>`;
}

function breadcrumbLd(crumbs) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: SITE_URL + c.path })),
  };
}

function breadcrumbHtml(crumbs) {
  const items = crumbs.map((c, i) =>
    i === crumbs.length - 1
      ? `<li aria-current="page">${escapeHtml(c.name)}</li>`
      : `<li><a href="${c.path}">${escapeHtml(c.name)}</a></li>`
  );
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.join("")}</ol></nav>`;
}

const AGENT = {
  "@type": "RealEstateAgent",
  name: "Jack Macdonald",
  image: `${SITE_URL}/assets/jack-sunset.png`,
  url: `${SITE_URL}/`,
  telephone: "+1-425-941-6998",
  address: { "@type": "PostalAddress", streetAddress: "700 110th Ave NE, Ste 270", addressLocality: "Bellevue", addressRegion: "WA", postalCode: "98004", addressCountry: "US" },
  worksFor: { "@type": "RealEstateOrganization", name: "Macdonald Group of Compass" },
  sameAs: [
    "https://www.instagram.com/jackmacdonaldre/",
    "https://www.linkedin.com/in/jack-macdonald-992878180/",
    "https://www.compass.com/agents/jack-macdonald/",
  ],
};

const STYLE = `
body { margin: 0; }
.btn { white-space: nowrap; }
a { text-decoration: none; color: var(--color-accent-700); }
a:hover { opacity: 0.75; }
.card { transition: box-shadow 0.3s ease, transform 0.3s ease; }
a.card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); opacity: 1; }
.site-nav { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-6); border-bottom: 1px solid var(--color-divider); position: relative; background: var(--color-bg); }
.site-nav .links { display: flex; align-items: center; gap: 24px; font-size: 13px; }
.site-nav .links a, .site-nav summary { color: var(--color-neutral-700); font-size: 13px; cursor: pointer; }
.site-nav .logo img { height: 32px; width: auto; display: block; }
.site-nav details { position: relative; }
.site-nav summary { list-style: none; }
.site-nav summary::-webkit-details-marker { display: none; }
.site-nav summary::after { content: " \\25BE"; font-size: 10px; }
.site-nav .menu { position: absolute; top: 28px; left: 0; z-index: 50; background: var(--color-bg); border: 1px solid var(--color-divider); box-shadow: var(--shadow-md); padding: var(--space-3) 0; min-width: 190px; border-radius: var(--radius-md); }
.site-nav .menu a { display: block; padding: 8px var(--space-4); font-size: 14px; color: var(--color-text); }
.site-nav .menu a:hover { background: var(--color-neutral-100); opacity: 1; }
.crumbs ol { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--color-neutral-600); }
.crumbs li + li::before { content: "\\203A"; margin-right: 6px; color: var(--color-neutral-400); }
.crumbs a { color: var(--color-neutral-700); }
.chip { display: inline-block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 10px; border: 1px solid var(--color-divider); border-radius: 999px; color: var(--color-neutral-700); margin: 0 6px 6px 0; }
.chip.topic { background: var(--color-neutral-100); }
.page { max-width: 1100px; margin: 0 auto; padding: var(--space-8) var(--space-6) 96px; }
.narrow { max-width: 760px; margin: 0 auto; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-6); }
.post-list a.title { color: var(--color-text); }
.kicker { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-neutral-600); }
.cta { margin-top: var(--space-8); padding: var(--space-6); text-align: center; }
.cta .buttons { display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap; }
.report-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.report-table th, .report-table td { padding: 10px 8px; border-bottom: 1px solid var(--color-divider); text-align: right; }
.report-table th:first-child, .report-table td:first-child { text-align: left; }
.report-table th { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-neutral-600); font-weight: normal; }
.table-wrap { overflow-x: auto; }
.show-sm { display: none; }
.site-nav .links a, .site-nav summary { white-space: nowrap; }
.listing-attrib { font-size: 12px; color: var(--color-neutral-600); margin: 0 0 var(--space-3); }
@media (max-width: 720px) {
  .site-nav { padding: var(--space-3) var(--space-4); }
  .site-nav .hide-sm { display: none; }
  .site-nav .show-sm { display: inline; }
  .site-nav .logo img { height: 26px; }
  .site-nav .links { gap: 16px; }
  .page { padding: var(--space-6) var(--space-4) 72px; }
}
`;

function areasMenu() {
  return AREAS.filter((a) => a.hub)
    .map((a) => `<a href="/areas/${a.slug}/">${escapeHtml(a.name)}</a>`)
    .join("") + `<a href="/areas/">All areas</a>`;
}

function header() {
  return `<header class="site-nav">
<div class="links">
<details><summary>Areas</summary><div class="menu">${areasMenu()}</div></details>
<a href="/market-reports/">Market Reports</a>
<a href="/blog/" class="hide-sm">Blog</a>
</div>
<a href="/" class="logo"><img src="/assets/MacdonaldGroup_Logo_RGB_MonogramandBrand_Black.png" alt="Macdonald Group | Compass"></a>
<div class="links">
<a href="/about/" class="hide-sm">About</a>
<a href="tel:4259416998" class="btn btn-secondary"><span class="hide-sm">425.941.6998</span><span class="show-sm">Call</span></a>
</div>
</header>`;
}

function footer() {
  return `<footer style="background: var(--color-neutral-900); color: var(--color-neutral-300); padding: var(--space-8) var(--space-6) var(--space-6);">
<div style="max-width: 1300px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-6);">
<div>
<img src="/assets/mg-logo-vert-white.png" alt="Macdonald Group" style="height: 64px; width: auto; display: block; margin-bottom: var(--space-3);">
<div style="font-family: var(--font-heading); color: #fdfdfc; font-size: 19px; margin-bottom: var(--space-2);">JACK MACDONALD</div>
<div style="font-size: 13px; line-height: 1.9;">Macdonald Group of Compass<br>700 110th Ave NE, Ste 270, Bellevue, WA 98004</div>
</div>
<div style="font-size: 13px; line-height: 1.9;">425.941.6998<br>License #21022645</div>
<div style="display: flex; gap: var(--space-3); align-items: flex-start; flex-wrap: wrap; max-width: 420px;">
<a href="/areas/" style="font-size: 12px; color: var(--color-neutral-300);">Areas</a>
<a href="/market-reports/" style="font-size: 12px; color: var(--color-neutral-300);">Market Reports</a>
<a href="/blog/" style="font-size: 12px; color: var(--color-neutral-300);">Blog</a>
<a href="/contact/" style="font-size: 12px; color: var(--color-neutral-300);">Contact</a>
<a href="https://www.instagram.com/jackmacdonaldre/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Instagram</a>
<a href="https://www.linkedin.com/in/jack-macdonald-992878180/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">LinkedIn</a>
<a href="https://www.compass.com/agents/jack-macdonald/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Compass</a>
<a href="https://www.facebook.com/jack.macdonald.31521301/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Facebook</a>
<a href="/dmca.html" style="font-size: 12px; color: var(--color-neutral-300);">DMCA Notice</a>
</div>
</div>
<div style="max-width: 1300px; margin: var(--space-6) auto 0; border-top: 1px solid var(--color-neutral-800); padding-top: var(--space-4); font-size: 11px; color: var(--color-neutral-500); line-height: 1.7;">
&copy; ${new Date().getFullYear()} Jack Macdonald &middot; Macdonald Group of Compass. Equal Housing Opportunity.<br>
The listing information on this website is provided through IDX from Northwest MLS and is deemed reliable but not guaranteed. See our <a href="/dmca.html" style="color: var(--color-neutral-400);">DMCA Notice</a> for copyright infringement claims.
</div>
</footer>`;
}

// Full HTML document. `ld` is an array of JSON-LD objects.
function page({ title, description, path, ogType = "website", ld = [], body, extraHead = "", image = "/assets/twilight-listing-photo.jpg", markdownAlt }) {
  const url = SITE_URL + path;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
${markdownAlt ? `<link rel="alternate" type="text/markdown" href="${url}index.md">\n` : ""}<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Jack Macdonald | Macdonald Group of Compass">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE_URL}${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="${CSS}">
<style>${STYLE}</style>
${ld.map(ldJson).join("\n")}
${extraHead}
</head>
<body>
<div style="background: var(--color-bg); min-height: 100vh; width: 100%;">
${header()}
${body}
${footer()}
</div>
</body>
</html>
`;
}

module.exports = { SITE_URL, VALUATION_URL, SEARCH_URL, AGENT, escapeHtml, ldJson, breadcrumbLd, breadcrumbHtml, page };
