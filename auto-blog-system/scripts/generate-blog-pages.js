// Generates a real, indexable /blog/{slug}/ page for every post in blog-posts-data.js
// that doesn't already have one, then rebuilds blog/index.html and sitemap.xml to
// include them. Run this after generate-blog.js in the auto-blog workflow so every
// scheduled post gets its own URL automatically — no manual steps required.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const POSTS_DATA_PATH = path.join(ROOT, "blog-posts-data.js");
const BLOG_DIR = path.join(ROOT, "blog");
const BLOG_INDEX_PATH = path.join(BLOG_DIR, "index.html");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const SITE_URL = "https://jackmacdonaldre.com";

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function stripReviewNote(bodyHtml) {
  return String(bodyHtml || "").replace(/<!--\s*REVIEW NOTE:[\s\S]*?-->/g, "").trim();
}

function loadPosts() {
  const fileText = fs.readFileSync(POSTS_DATA_PATH, "utf8");
  const match = fileText.match(/export const POSTS = (\[[\s\S]*\]);?\s*$/);
  if (!match) {
    throw new Error("Could not locate 'export const POSTS = [...]' in blog-posts-data.js");
  }
  // The array mixes JSON.stringify'd objects (quoted keys) with hand-written object
  // literals (unquoted keys). Both are valid JS, so evaluate as JS rather than JSON.
  const posts = new Function(`"use strict"; return (${match[1]});`)();
  if (!Array.isArray(posts)) throw new Error("Parsed POSTS is not an array.");
  return posts;
}

function buildFaqSection(faq) {
  if (!Array.isArray(faq) || faq.length === 0) return "";
  const items = faq
    .map(
      (item) => `<div style="padding: var(--space-6) 0; border-bottom: 1px solid var(--color-divider);">
<h3 style="margin: 0 0 var(--space-2); font-size: 20px;">${escapeHtml(item.q)}</h3>
<p style="margin: 0; line-height: 1.75;">${escapeHtml(item.a)}</p>
</div>`
    )
    .join("\n");
  return `\n<h2 style="margin-top: calc(var(--space-8) * 1.1);">Common Questions</h2>\n${items}\n`;
}

function buildPostHtml(post) {
  const title = escapeHtml(post.title);
  const desc = escapeHtml(post.metaDescription);
  const city = escapeHtml(post.city || "");
  const dateDisplay = formatDate(post.publishedDate);
  const url = `${SITE_URL}/blog/${post.slug}/`;
  const bodyHtml = stripReviewNote(post.bodyHtml);
  const faqSection = buildFaqSection(post.faq);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.publishedDate,
    dateModified: post.publishedDate,
    author: { "@type": "Person", name: "Jack Macdonald", url: `${SITE_URL}/about/` },
    publisher: { "@type": "RealEstateOrganization", name: "Macdonald Group of Compass" },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    about: { "@type": "Place", name: post.city || "Bellevue, WA" },
  });
    const faqJsonLd = Array.isArray(post.faq) && post.faq.length > 0 ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
    }) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Jack Macdonald, Macdonald Group</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Jack Macdonald | Macdonald Group of Compass">
<meta property="og:title" content="${title} | Jack Macdonald, Macdonald Group">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://jackmacdonaldre.com/assets/nbhd-bellevue.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../../_ds/classical-c3b261bd-4ba7-418e-89e4-a4cf1ab64e84/styles.css">
<style>
body { margin: 0; }
.btn { white-space: nowrap; }
a { text-decoration: none; color: var(--color-accent-700); }
a:hover { opacity: 0.7; }
.card { transition: box-shadow 0.3s ease, transform 0.3s ease; }
.card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
</style>
<script type="application/ld+json">
${jsonLd}
</script>
${faqJsonLd ? `<script type="application/ld+json">\n${faqJsonLd}\n</script>` : ""}
</head>
<body>

<div style="background: var(--color-bg); min-height: 100vh; width: 100%;">

<div class="nav" style="padding: var(--space-3) var(--space-6); justify-content: space-between; position: relative;">
<div style="display: flex; align-items: center; gap: 28px;">
<a href="../../about/" style="font-size: 13px; color: var(--color-neutral-700);">About</a>
<a href="../../services/" style="font-size: 13px; color: var(--color-neutral-700);">Services</a>
</div>
<a href="../../" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: var(--space-3);">
<img src="../../assets/MacdonaldGroup_Logo_RGB_MonogramandBrand_Black.png" alt="Macdonald Group | Compass" style="height: 32px; width: auto; display: block;">
</a>
<div style="display: flex; align-items: center; gap: var(--space-5);">
<a href="tel:4259416998" class="btn btn-secondary">(425) 941-6998</a>
</div>
</div>

<article style="max-width: 760px; margin: 0 auto; padding: 140px var(--space-6) var(--space-8);">
<a href="../../blog/" class="btn btn-ghost" style="padding-left: 0; font-size: 13px;">&larr; All Posts</a>
<div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-neutral-600); margin: var(--space-6) 0 var(--space-3);">${dateDisplay}${city ? ` &middot; ${city}` : ""}</div>
<h1 style="margin: 0 0 var(--space-4); font-size: clamp(34px, 4.6vw, 54px); line-height: 1.12;">${title}</h1>
<div style="display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-6); border-bottom: 1px solid var(--color-divider);">
<div style="font-size: 13px; line-height: 1.5;">By <a href="../../about/">Jack Macdonald</a><br><span style="color: var(--color-neutral-600);">Macdonald Group of Compass</span></div>
</div>

<div style="line-height: 1.75; margin-top: var(--space-6);">
${bodyHtml}
</div>
${faqSection}
<div class="card" style="margin-top: calc(var(--space-8) * 1.1); padding: var(--space-6); text-align: center;">
<h2 style="margin: 0 0 var(--space-3); font-size: 26px;">Thinking about a move on the Eastside?</h2>
<p style="max-width: 460px; margin: 0 auto var(--space-6); line-height: 1.65;">Browse current listings across the Eastside, or reach out and we'll talk through your specific situation.</p>
<div style="display: flex; gap: var(--space-3); justify-content: center; flex-wrap: wrap;">
<a href="../../search.html" class="btn btn-primary">Search Homes</a>
<a href="../../contact/" class="btn btn-secondary">Contact Jack</a>
</div>
</div>
</article>

<footer style="background: var(--color-neutral-900); color: var(--color-neutral-300); padding: var(--space-8) var(--space-6) var(--space-6);">
<div style="max-width: 1300px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-6);">
<div>
<img src="../../assets/mg-logo-vert-white.png" alt="Macdonald Group" style="height: 64px; width: auto; display: block; margin-bottom: var(--space-3);">
<div style="font-family: var(--font-heading); color: #fdfdfc; font-size: 19px; margin-bottom: var(--space-2);">JACK MACDONALD</div>
<div style="font-size: 13px; line-height: 1.9;">Macdonald Group of Compass<br>700 110th Ave NE, Ste 270, Bellevue, WA 98004</div>
</div>
<div style="font-size: 13px; line-height: 1.9;">(425) 941-6998<br>License #21022645</div>
<div style="display: flex; gap: var(--space-3); align-items: flex-start; flex-wrap: wrap;">
<a href="https://www.instagram.com/jackmacdonaldre/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Instagram</a>
<a href="https://www.linkedin.com/in/jack-macdonald-992878180/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">LinkedIn</a>
<a href="https://www.compass.com/agents/jack-macdonald/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Compass</a>
<a href="https://www.facebook.com/jack.macdonald.31521301/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Facebook</a>
<a href="../../dmca.html" style="font-size: 12px; color: var(--color-neutral-300);">DMCA Notice</a>
</div>
</div>
<div style="max-width: 1300px; margin: var(--space-6) auto 0; border-top: 1px solid var(--color-neutral-800); padding-top: var(--space-4); font-size: 11px; color: var(--color-neutral-500); line-height: 1.7;">
&copy; 2026 Jack Macdonald &middot; Macdonald Group of Compass. Equal Housing Opportunity.<br>
The listing information on this website is provided through IDX from Northwest MLS and is deemed reliable but not guaranteed. See our <a href="../../dmca.html" style="color: var(--color-neutral-400);">DMCA Notice</a> for copyright infringement claims.
</div>
</footer>
</div>
</body>
</html>
`;
}

function buildBlogIndexHtml(posts) {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.publishedDate) - new Date(a.publishedDate)
  );
  const articles = sorted
    .map((post) => {
      const dateDisplay = formatDate(post.publishedDate);
      const city = escapeHtml(post.city || "");
      return `<article style="padding: calc(var(--space-8) * 0.9) 0; border-bottom: 1px solid var(--color-divider);">
<div style="font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-neutral-600); margin-bottom: var(--space-3);">${dateDisplay}${city ? ` &middot; ${city}` : ""}</div>
<h2 style="margin: 0 0 var(--space-3); font-size: clamp(26px, 3.2vw, 36px);"><a href="../blog/${post.slug}/" style="color: var(--color-text);">${escapeHtml(post.title)}</a></h2>
<p style="max-width: 620px; line-height: 1.65; margin: 0 0 var(--space-4);">${escapeHtml(post.metaDescription)}</p>
<a href="../blog/${post.slug}/" class="btn btn-ghost" style="padding-left: 0;">Read the Guide &rarr;</a>
</article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eastside Real Estate Blog | Neighborhood Guides &amp; Market Updates</title>
<meta name="description" content="Neighborhood guides, market updates, and Eastside real estate insight from Jack Macdonald of Macdonald Group of Compass, serving Bellevue and the Eastside.">
<link rel="canonical" href="https://jackmacdonaldre.com/blog/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Jack Macdonald | Macdonald Group of Compass">
<meta property="og:title" content="Eastside Real Estate Blog | Neighborhood Guides &amp; Market Updates">
<meta property="og:description" content="Neighborhood guides, market updates, and Eastside real estate insight from Jack Macdonald of Macdonald Group of Compass, serving Bellevue and the Eastside.">
<meta property="og:url" content="https://jackmacdonaldre.com/blog/">
<meta property="og:image" content="https://jackmacdonaldre.com/assets/twilight-listing-photo.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../_ds/classical-c3b261bd-4ba7-418e-89e4-a4cf1ab64e84/styles.css">
<style>
body { margin: 0; }
.btn { white-space: nowrap; }
a { text-decoration: none; color: var(--color-accent-700); }
a:hover { opacity: 0.7; }
</style>
</head>
<body>

<div style="background: var(--color-bg); min-height: 100vh; width: 100%;">

<div class="nav" style="padding: var(--space-3) var(--space-6); justify-content: space-between; position: relative;">
<div style="display: flex; align-items: center; gap: 28px;">
<a href="../about/" style="font-size: 13px; color: var(--color-neutral-700);">About</a>
<a href="../services/" style="font-size: 13px; color: var(--color-neutral-700);">Services</a>
</div>
<a href="../" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: var(--space-3);">
<img src="../assets/MacdonaldGroup_Logo_RGB_MonogramandBrand_Black.png" alt="Macdonald Group | Compass" style="height: 32px; width: auto; display: block;">
</a>
<div style="display: flex; align-items: center; gap: var(--space-5);">
<a href="tel:4259416998" class="btn btn-secondary">(425) 941-6998</a>
</div>
</div>

<section style="padding: 140px var(--space-6) var(--space-4); max-width: 900px; margin: 0 auto; text-align: center;">
<h6 style="font-size: 11px;">Latest Updates</h6>
<h1 style="margin-top: var(--space-2); font-size: clamp(40px, 6vw, 68px);">Blog</h1>
<p style="max-width: 540px; margin: var(--space-4) auto 0; line-height: 1.65;">Neighborhood guides, market updates, and local insight for buyers and sellers across Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell.</p>
</section>

<div class="hr" style="max-width: 900px; margin: var(--space-8) auto 0;"></div>

<section style="max-width: 820px; margin: 0 auto; padding: 0 var(--space-6) 120px;">
${articles}
</section>

<footer style="background: var(--color-neutral-900); color: var(--color-neutral-300); padding: var(--space-8) var(--space-6) var(--space-6);">
<div style="max-width: 1300px; margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; gap: var(--space-6);">
<div>
<img src="../assets/mg-logo-vert-white.png" alt="Macdonald Group" style="height: 64px; width: auto; display: block; margin-bottom: var(--space-3);">
<div style="font-family: var(--font-heading); color: #fdfdfc; font-size: 19px; margin-bottom: var(--space-2);">JACK MACDONALD</div>
<div style="font-size: 13px; line-height: 1.9;">Macdonald Group of Compass<br>700 110th Ave NE, Ste 270, Bellevue, WA 98004</div>
</div>
<div style="font-size: 13px; line-height: 1.9;">(425) 941-6998<br>License #21022645</div>
<div style="display: flex; gap: var(--space-3); align-items: flex-start; flex-wrap: wrap;">
<a href="https://www.instagram.com/jackmacdonaldre/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Instagram</a>
<a href="https://www.linkedin.com/in/jack-macdonald-992878180/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">LinkedIn</a>
<a href="https://www.compass.com/agents/jack-macdonald/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Compass</a>
<a href="https://www.facebook.com/jack.macdonald.31521301/" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: var(--color-neutral-300);">Facebook</a>
<a href="../dmca.html" style="font-size: 12px; color: var(--color-neutral-300);">DMCA Notice</a>
</div>
</div>
<div style="max-width: 1300px; margin: var(--space-6) auto 0; border-top: 1px solid var(--color-neutral-800); padding-top: var(--space-4); font-size: 11px; color: var(--color-neutral-500); line-height: 1.7;">
&copy; 2026 Jack Macdonald &middot; Macdonald Group of Compass. Equal Housing Opportunity.<br>
The listing information on this website is provided through IDX from Northwest MLS and is deemed reliable but not guaranteed. See our <a href="../dmca.html" style="color: var(--color-neutral-400);">DMCA Notice</a> for copyright infringement claims.
</div>
</footer>
</div>
</body>
</html>
`;
}

function updateSitemap(posts) {
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.warn("sitemap.xml not found, skipping sitemap update.");
    return;
  }
  let sitemapText = fs.readFileSync(SITEMAP_PATH, "utf8");
  let added = 0;
  for (const post of posts) {
    const loc = `${SITE_URL}/blog/${post.slug}/`;
    if (sitemapText.includes(`<loc>${loc}</loc>`)) continue;
    const entry = `<url>
<loc>${loc}</loc>
<lastmod>${post.publishedDate}</lastmod>
<changefreq>monthly</changefreq>
<priority>0.6</priority>
</url>
`;
    sitemapText = sitemapText.replace("</urlset>", `${entry}</urlset>`);
    added++;
  }
  if (added > 0) {
    fs.writeFileSync(SITEMAP_PATH, sitemapText);
    console.log(`Added ${added} new URL(s) to sitemap.xml.`);
  }
}

function main() {
  const posts = loadPosts();
  let createdCount = 0;

  for (const post of posts) {
    if (!post.slug) continue;
    const postDir = path.join(BLOG_DIR, post.slug);
    const postFile = path.join(postDir, "index.html");
    if (fs.existsSync(postFile)) continue;

    fs.mkdirSync(postDir, { recursive: true });
    fs.writeFileSync(postFile, buildPostHtml(post));
    createdCount++;
    console.log(`Created page: blog/${post.slug}/index.html`);
  }

  if (createdCount > 0) {
    fs.writeFileSync(BLOG_INDEX_PATH, buildBlogIndexHtml(posts));
    console.log("Rebuilt blog/index.html with all posts.");
    updateSitemap(posts);
  } else {
    console.log("No new blog pages needed — everything already has a URL.");
  }
}

main();
