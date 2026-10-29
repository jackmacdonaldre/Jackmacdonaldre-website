// Builds every generated page from the data files. Safe to run any time; every
// page is rebuilt on every run so template improvements reach older posts too.
//
//   blog-posts-data.js                         -> /blog/{slug}/ (+ index.md), /blog/,
//                                                 /blog/topic/{topic}/, /blog/area/{area}/
//   content/market-data.json + state.json      -> /market-reports/, /market-reports/{area}/
//   taxonomy.js + idx-integration/data/*.json  -> /areas/, /areas/{area}/ (with live listings)
//   everything                                 -> sitemap.xml, llms.txt, llms-full.txt
//
// Everything is plain server rendered HTML (no client rendering needed to see
// content). Charts are inline SVG, never images under /uploads/.

const fs = require("fs");
const path = require("path");
const { cleanPost } = require("./no-dashes");
const { loadPosts } = require("./posts-data");
const { TOPICS, AREAS, AREA_INTROS, topicBySlug, areaBySlug, classifyPost } = require("./taxonomy");
const L = require("./site-layout");
const M = require("./market-reports");
const { attributionText } = require("../../idx-integration/scripts/attribution");

const { SITE_URL, VALUATION_URL, SEARCH_URL, escapeHtml, breadcrumbLd, breadcrumbHtml } = L;
const ROOT = path.join(__dirname, "..", "..");
const BLOG_DIR = path.join(ROOT, "blog");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const MARKET_DATA_PATH = path.join(__dirname, "..", "content", "market-data.json");
const REPORT_STATE_PATH = path.join(__dirname, "..", "content", "market-reports-state.json");
const LISTINGS_PATH = path.join(ROOT, "idx-integration", "data", "active-listings.json");
const HUB_AREAS = AREAS.filter((a) => a.hub);
const REPORT_AREAS = AREAS.filter((a) => a.report);
const listNames = (areas) => { const n = areas.map((a) => a.name); return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : n.join(""); };

// ---------- helpers ----------

function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function stripReviewNote(bodyHtml) {
  return String(bodyHtml || "").replace(/<!--\s*REVIEW NOTE:[\s\S]*?-->/g, "").trim();
}
function writeFile(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const byDateDesc = (a, b) => new Date(b.publishedDate) - new Date(a.publishedDate) || String(b.id).localeCompare(String(a.id));
const lastmodOf = (p) => p.updatedDate || p.publishedDate;
const maxDate = (dates) => dates.filter(Boolean).sort().pop();
const postUrl = (p) => `/blog/${p.slug}/`;
const primaryArea = (p) => areaBySlug(p.areas[0]);
const hubFor = (p) => p.areas.map(areaBySlug).find((a) => a && a.hub) || null;

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}

function tagChips(p) {
  const t = topicBySlug(p.topic);
  return `<div style="margin-bottom: var(--space-3);"><a class="chip topic" href="/blog/topic/${t.slug}/">${escapeHtml(t.name)}</a>${p.areas
    .map((a) => `<a class="chip" href="/blog/area/${a}/">${escapeHtml(areaBySlug(a).name)}</a>`)
    .join("")}</div>`;
}

function postCard(p) {
  const t = topicBySlug(p.topic);
  const areaNames = p.areas.map((a) => areaBySlug(a).name).join(", ");
  const text = `${p.title} ${p.metaDescription} ${areaNames} ${t.name}`.toLowerCase();
  return `<article class="post-item" data-topic="${t.slug}" data-areas="${p.areas.join(" ")}" data-text="${escapeHtml(text)}" style="padding: var(--space-6) 0; border-bottom: 1px solid var(--color-divider);">
<div class="kicker" style="margin-bottom: var(--space-2);">${formatDate(p.publishedDate)} &middot; ${escapeHtml(t.name)} &middot; ${escapeHtml(areaNames)}</div>
<h2 style="margin: 0 0 var(--space-2); font-size: clamp(22px, 2.6vw, 30px);"><a class="title" href="${postUrl(p)}" style="color: var(--color-text);">${escapeHtml(p.title)}</a></h2>
<p style="max-width: 640px; line-height: 1.65; margin: 0;">${escapeHtml(p.metaDescription)}</p>
</article>`;
}

function smallPostList(posts, emptyText) {
  if (!posts.length) return emptyText ? `<p style="color: var(--color-neutral-600);">${emptyText}</p>` : "";
  return `<ul style="list-style: none; padding: 0; margin: 0;">${posts
    .map((p) => `<li style="padding: var(--space-3) 0; border-bottom: 1px solid var(--color-divider);"><a href="${postUrl(p)}" style="font-size: 17px;">${escapeHtml(p.title)}</a><div style="font-size: 12px; color: var(--color-neutral-600); margin-top: 4px;">${formatDate(p.publishedDate)}</div></li>`)
    .join("")}</ul>`;
}

function valuationCta(heading = "Curious what your home would sell for right now?") {
  return `<div class="card cta">
<h2 style="margin: 0 0 var(--space-3); font-size: 26px;">${escapeHtml(heading)}</h2>
<p style="max-width: 480px; margin: 0 auto var(--space-6); line-height: 1.65;">I'll put together a real number based on the homes that just sold near you, not an online estimate. No obligation.</p>
<div class="buttons"><a href="${VALUATION_URL}" class="btn btn-primary">Get my home value</a><a href="tel:4259416998" class="btn btn-secondary">Call 425.941.6998</a></div>
</div>`;
}

// ---------- market report data ----------

const marketData = loadJson(MARKET_DATA_PATH, null);
const reportState = loadJson(REPORT_STATE_PATH, { areas: {} });
function reportFor(areaSlug) {
  if (!marketData || !marketData.areas[areaSlug] || !reportState.areas[areaSlug]) return null;
  const stats = M.computeStats(areaSlug, marketData.areas[areaSlug]);
  if (!stats) return null;
  return { stats, info: reportState.areas[areaSlug], area: areaBySlug(areaSlug), path: `/market-reports/${areaSlug}/` };
}

// ---------- posts ----------

function pickRelated(post, all, n = 3) {
  const others = all.filter((p) => p.slug !== post.slug && p.slug !== "welcome-to-the-blog" && (post.topic === "market-reports" || p.topic !== "market-reports"));
  const score = (p) => {
    const sharesArea = p.areas.some((a) => post.areas.includes(a) && a !== "eastside") ? 2 : p.areas.some((a) => post.areas.includes(a)) ? 1 : 0;
    const sameTopic = p.topic === post.topic ? 1 : 0;
    return sharesArea * 10 + sameTopic;
  };
  return [...others].sort((a, b) => score(b) - score(a) || byDateDesc(a, b)).slice(0, n);
}

function estateNextStep(post) {
  return `<section id="talk" style="margin-top: calc(var(--space-8) * 1.1); border: 1px solid var(--color-divider); background: #fff;">
<div style="display: grid; grid-template-columns: minmax(0, 120px) minmax(0, 1fr); gap: var(--space-5); padding: var(--space-6); align-items: start;" class="estate-talk">
<img src="/assets/estate/jack-headshot-720.jpg" alt="Jack Macdonald, Compass real estate broker" loading="lazy" style="width: 100%; height: auto; display: block;">
<div>
<div class="kicker" style="margin-bottom: var(--space-2);">Talk it through with me</div>
<h2 style="margin: 0 0 var(--space-3); font-size: 26px;">Handling an inherited home or a parent's house?</h2>
<p style="margin: 0 0 var(--space-3); line-height: 1.7;">I'm Jack Macdonald, a broker with the Macdonald Group of Compass. In 2026 I sold eight homes for one family's estate, from Everett down to Federal Way, and each one needed its own plan: inspections before listing, repairs, curb appeal, staging and photography, and keeping the executor and family updated the whole way.</p>
<p style="margin: 0 0 var(--space-4); line-height: 1.7;">If it would help to talk through your situation, send me a note or call or text <a href="tel:4259416998">425.941.6998</a>. There's no obligation, and I'm not an attorney, so I'll work alongside yours. <a href="/inherited-homes/#results">See the estate homes I've sold</a>.</p>
</div>
</div>
<form name="contact" method="POST" data-netlify="true" action="/thanks/" style="display: grid; gap: var(--space-3); padding: 0 var(--space-6) var(--space-6);">
<input type="hidden" name="form-name" value="contact">
<input type="hidden" name="source" value="Estate article: ${escapeHtml(post.slug)}">
<div style="display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));">
<div class="field"><label for="ea-name">Name</label><input class="input" id="ea-name" name="name" autocomplete="name" required></div>
<div class="field"><label for="ea-email">Email</label><input class="input" id="ea-email" name="email" type="email" autocomplete="email"></div>
<div class="field"><label for="ea-phone">Phone</label><input class="input" id="ea-phone" name="phone" type="tel" autocomplete="tel"></div>
</div>
<div class="field"><label for="ea-msg">Where is the home, and what's going on?</label><textarea class="input" id="ea-msg" name="message" rows="3" placeholder="For example: my dad's house in Renton, I'm the executor, I live out of state"></textarea></div>
<div><button type="submit" class="btn btn-primary">Send to Jack</button></div>
</form>
</section>
<style>@media (max-width: 600px) { .estate-talk { grid-template-columns: minmax(0, 1fr) !important; } .estate-talk img { max-width: 110px; } }</style>`;
}

function nextStep(post) {
  if (post.track === "estate") return estateNextStep(post);
  const hub = hubFor(post);
  if (post.topic === "selling" || post.topic === "market-reports") {
    return `<div class="card cta">
<div class="kicker" style="margin-bottom: var(--space-2);">Your next step</div>
<h2 style="margin: 0 0 var(--space-3); font-size: 26px;">What's your home worth right now?</h2>
<p style="max-width: 480px; margin: 0 auto var(--space-6); line-height: 1.65;">Get a price based on what just sold near you, with a straight answer on what to fix and what to leave alone.</p>
<div class="buttons"><a href="${VALUATION_URL}" class="btn btn-primary">Get my home value</a></div>
</div>`;
  }
  const listingsHref = hub ? `/areas/${hub.slug}/#listings` : SEARCH_URL;
  return `<div class="card cta">
<div class="kicker" style="margin-bottom: var(--space-2);">Your next step</div>
<h2 style="margin: 0 0 var(--space-3); font-size: 26px;">${hub ? `See what's for sale in ${escapeHtml(hub.name)}` : "See what's for sale on the Eastside"}</h2>
<p style="max-width: 480px; margin: 0 auto var(--space-6); line-height: 1.65;">Browse current listings, or talk it through with me before you start touring.</p>
<div class="buttons"><a href="${listingsHref}" class="btn btn-primary">See listings</a><a href="/contact/" class="btn btn-secondary">Talk to Jack</a></div>
</div>`;
}

function moreAboutBox(post, all) {
  const hub = hubFor(post);
  if (!hub) {
    return `<aside class="card" style="padding: var(--space-6); margin-top: var(--space-8);">
<h2 style="margin: 0 0 var(--space-3); font-size: 22px;">Explore Eastside areas</h2>
<p style="margin: 0; line-height: 1.9;">${HUB_AREAS.map((a) => `<a href="/areas/${a.slug}/">${escapeHtml(a.name)}</a>`).join(" &middot; ")}</p>
</aside>`;
  }
  const report = reportFor(hub.slug);
  const guides = all.filter((p) => p.slug !== post.slug && p.topic === "neighborhood-guides" && p.areas.includes(hub.slug)).sort(byDateDesc).slice(0, 4);
  return `<aside class="card" style="padding: var(--space-6); margin-top: var(--space-8);">
<h2 style="margin: 0 0 var(--space-3); font-size: 22px;">More about ${escapeHtml(hub.name)}</h2>
<p style="margin: 0 0 var(--space-3); line-height: 1.65;"><a href="/areas/${hub.slug}/"><strong>${escapeHtml(hub.name)} area guide</strong></a>: neighborhoods, schools, current listings and market numbers in one place.</p>
${["bellevue", "kirkland", "redmond", "issaquah", "sammamish"].includes(hub.slug) ? `<p style="margin: 0 0 var(--space-3); line-height: 1.65;"><a href="/areas/${hub.slug}/#recent-sales"><strong>Selling in ${escapeHtml(hub.name)}?</strong></a> See my recent ${escapeHtml(hub.name)} sales and how I handled each one, or <a href="/areas/${hub.slug}/#home-value">get a price range from me</a>.</p>` : ""}
${report ? `<p style="margin: 0 0 var(--space-3); line-height: 1.65;"><a href="${report.path}"><strong>${escapeHtml(hub.name)} market report</strong></a>, updated ${escapeHtml(report.info.updatedMonth)}.</p>` : ""}
${guides.length ? `<p style="margin: 0; line-height: 1.8; font-size: 15px;">${guides.map((g) => `<a href="${postUrl(g)}">${escapeHtml(g.title)}</a>`).join("<br>")}</p>` : ""}
</aside>`;
}

function postCrumbs(post) {
  const hub = hubFor(post);
  return hub
    ? [{ name: "Home", path: "/" }, { name: hub.name, path: `/areas/${hub.slug}/` }, { name: post.title, path: postUrl(post) }]
    : [{ name: "Home", path: "/" }, { name: "Blog", path: "/blog/" }, { name: post.title, path: postUrl(post) }];
}

function buildFaqSection(faq) {
  if (!Array.isArray(faq) || !faq.length) return "";
  return `\n<h2 style="margin-top: calc(var(--space-8) * 1.1);">Common Questions</h2>\n${faq
    .map((i) => `<div style="padding: var(--space-6) 0; border-bottom: 1px solid var(--color-divider);">
<h3 style="margin: 0 0 var(--space-2); font-size: 20px;">${escapeHtml(i.q)}</h3>
<p style="margin: 0; line-height: 1.75;">${escapeHtml(i.a)}</p>
</div>`)
    .join("\n")}\n`;
}

// Local partner line, ONLY on Inherited & Estate Homes articles (post.track === "estate"),
// never on regular local SEO articles (Jack, 2026-10-20).
function partnerBox(post) {
  if (post.track !== "estate") return "";
  return `<div style="margin-top: var(--space-8); padding: var(--space-6); border: 1px solid var(--color-divider); font-size: 15px; line-height: 1.65;">
<div class="kicker" style="margin-bottom: var(--space-4);">Trusted local partner</div>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4);">
<a href="https://www.geverswealth.com/" target="_blank" rel="noopener" style="display: inline-block; line-height: 0;"><img src="https://static.fmgsuite.com/media/EmailDesignLogo/variantSize/872ad0a1-b36b-4196-8a54-c759d7002ce2.jpg" alt="Gevers Wealth Management logo" style="display: block; max-height: 64px; max-width: 260px; width: auto; height: auto;" onerror="this.parentNode.style.display='none'"></a>
<div>
<div style="font-size: 20px; letter-spacing: 0.02em; color: inherit;">Gevers Wealth Management</div>
<div style="font-size: 13px; color: var(--color-neutral-600);">Wealth management and financial planning in Issaquah</div>
</div>
</div>
<p style="margin: 0 0 var(--space-4);">An inherited home or a home sale is also a money decision. Families I work with often need help with what comes next: the tax side of a sale, what to do with the proceeds, and how it all fits a retirement or estate plan. For that, I refer clients to the team at Gevers Wealth Management, an SEC registered investment advisory firm that has served Eastside families since 2005.</p>
<div style="display: flex; flex-wrap: wrap; gap: var(--space-4); margin: 0 0 var(--space-5);">
<div style="flex: 1 1 220px; padding: var(--space-4); border: 1px solid var(--color-divider);"><a href="https://www.geverswealth.com/" target="_blank" rel="noopener" style="display: block; font-size: 17px; color: inherit; text-decoration: underline; text-underline-offset: 3px;">Trey Gevers, CFP&reg;</a><span style="display: block; font-size: 13px; color: var(--color-neutral-600); margin-top: 2px;">Financial Advisor and Partner</span></div>
<div style="flex: 1 1 220px; padding: var(--space-4); border: 1px solid var(--color-divider);"><a href="https://www.geverswealth.com/" target="_blank" rel="noopener" style="display: block; font-size: 17px; color: inherit; text-decoration: underline; text-underline-offset: 3px;">Garrett Grigas, CFA, CFP&reg;</a><span style="display: block; font-size: 13px; color: var(--color-neutral-600); margin-top: 2px;">Financial Advisor and Partner</span></div>
</div>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4);">
<a href="https://www.geverswealth.com/" target="_blank" rel="noopener" class="btn btn-secondary" style="max-width: 100%; white-space: normal; text-align: center;">Visit geverswealth.com</a>
<span style="font-size: 14px; color: var(--color-neutral-600);"><a href="tel:4259024840" style="color: inherit;">(425) 902 4840</a> &middot; 5825 221st Pl SE, Suite 102, Issaquah</span>
</div>
<p style="margin: var(--space-5) 0 0; font-size: 12px; line-height: 1.6; color: var(--color-neutral-600);">Investment advisory services are offered through Gevers Wealth Management, LLC, an SEC registered investment adviser. Gevers Wealth Management is independent and not affiliated with Compass or the Macdonald Group. This is a personal referral, not financial, tax or legal advice.</p>
</div>
`;
}

function buildPostHtml(post, all) {
  const url = postUrl(post);
  const crumbs = postCrumbs(post);
  const related = pickRelated(post, all);
  const area = primaryArea(post);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.metaDescription,
      datePublished: post.publishedDate,
      dateModified: lastmodOf(post),
      author: { "@type": "Person", name: "Jack Macdonald", jobTitle: "REALTOR", url: `${SITE_URL}/about/`, image: `${SITE_URL}/assets/jack-sunset.jpg`, worksFor: { "@type": "RealEstateOrganization", name: "Macdonald Group of Compass" }, sameAs: L.AGENT.sameAs },
      publisher: { "@type": "RealEstateOrganization", name: "Macdonald Group of Compass", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/assets/MacdonaldGroup_Logo_RGB_MonogramandBrand_Black.png` }, address: L.AGENT.address, telephone: L.AGENT.telephone },
      image: `${SITE_URL}${post.image || "/assets/nbhd-bellevue.jpg"}`,
      mainEntityOfPage: { "@type": "WebPage", "@id": SITE_URL + url },
      articleSection: topicBySlug(post.topic).name,
      keywords: post.areas.map((a) => areaBySlug(a).name).join(", "),
      about: { "@type": "Place", name: area.slug === "eastside" ? "Eastside, King County, WA" : `${area.name}, WA` },
    },
  ];
  if (Array.isArray(post.faq) && post.faq.length) {
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: post.faq.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) });
  }
  ld.push(breadcrumbLd(crumbs));
  const body = `<article class="narrow" style="padding: var(--space-6) var(--space-6) var(--space-8);">
${breadcrumbHtml(crumbs)}
<div style="margin-top: var(--space-6);">${tagChips(post)}</div>
<div class="kicker" style="margin: var(--space-2) 0 var(--space-3);">${formatDate(post.publishedDate)}${post.updatedDate && post.updatedDate !== post.publishedDate ? ` &middot; Updated ${formatDate(post.updatedDate)}` : ""}</div>
<h1 style="margin: 0 0 var(--space-4); font-size: clamp(34px, 4.6vw, 54px); line-height: 1.12;">${escapeHtml(post.title)}</h1>
<div style="padding-bottom: var(--space-6); border-bottom: 1px solid var(--color-divider); font-size: 13px; line-height: 1.5;">By <a href="/about/">Jack Macdonald</a><br><span style="color: var(--color-neutral-600);">Macdonald Group of Compass</span></div>
<div style="line-height: 1.75; margin-top: var(--space-6);">
${stripReviewNote(post.bodyHtml)}
</div>
${buildFaqSection(post.faq)}
${moreAboutBox(post, all)}
${related.length ? `<h2 style="margin-top: calc(var(--space-8) * 1.1);">Related posts</h2>${smallPostList(related)}` : ""}
${nextStep(post)}
${partnerBox(post)}</article>`;
  return L.page({ title: `${post.title} | Jack Macdonald, Macdonald Group`, description: post.metaDescription, path: url, ogType: "article", ld, body, image: post.image || "/assets/nbhd-bellevue.jpg", markdownAlt: true });
}

// ---------- blog home + filter pages ----------

const FILTER_SCRIPT = `<script>
(function () {
  var list = document.getElementById('post-list'); if (!list) return;
  var items = [].slice.call(list.querySelectorAll('.post-item'));
  var fixed = list.getAttribute('data-fixed') || '';
  var state = { area: list.getAttribute('data-area') || '', topic: list.getAttribute('data-topic') || '', q: '' };
  var params = new URLSearchParams(location.search);
  if (!fixed || fixed === 'topic') state.area = params.get('area') || state.area;
  if (!fixed || fixed === 'area') state.topic = params.get('topic') || state.topic;
  state.q = params.get('q') || '';
  var search = document.getElementById('post-search'); if (search) search.value = state.q;
  var count = document.getElementById('post-count');
  function apply() {
    var q = state.q.trim().toLowerCase(), shown = 0;
    items.forEach(function (el) {
      var ok = (!state.area || (' ' + el.getAttribute('data-areas') + ' ').indexOf(' ' + state.area + ' ') !== -1) &&
               (!state.topic || el.getAttribute('data-topic') === state.topic) &&
               (!q || el.getAttribute('data-text').indexOf(q) !== -1);
      el.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    if (count) count.textContent = shown + (shown === 1 ? ' post' : ' posts');
    [].forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
      var on = state[b.getAttribute('data-filter')] === b.getAttribute('data-value');
      b.className = 'btn ' + (on ? 'btn-primary' : 'btn-secondary');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var p = new URLSearchParams();
    if (state.area && fixed !== 'area') p.set('area', state.area);
    if (state.topic && fixed !== 'topic') p.set('topic', state.topic);
    if (state.q) p.set('q', state.q);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''));
  }
  [].forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
    var key = b.getAttribute('data-filter');
    if (key === fixed) return; // the page's own dimension links to its own URL
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var v = b.getAttribute('data-value');
      state[key] = state[key] === v ? '' : v;
      apply();
    });
  });
  if (search) search.addEventListener('input', function () { state.q = search.value; apply(); });
  apply();
})();
</script>`;

function filterBar(posts, { fixed, area, topic }) {
  const areaCounts = AREAS.filter((a) => posts.some((p) => p.areas.includes(a.slug)));
  const topicCounts = TOPICS.filter((t) => posts.some((p) => p.topic === t.slug));
  const btn = (kind, slug, name, active) =>
    `<a href="/blog/${kind}/${slug}/" data-filter="${kind}" data-value="${slug}" class="btn ${active ? "btn-primary" : "btn-secondary"}" style="padding: 6px 12px; font-size: 12px;" aria-pressed="${active}">${escapeHtml(name)}</a>`;
  const allBtn = (kind, active) => `<a href="/blog/" class="btn ${active ? "btn-primary" : "btn-ghost"}" style="padding: 6px 12px; font-size: 12px;">All</a>`;
  return `<div class="card" style="padding: var(--space-6); margin-bottom: var(--space-6);">
<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: var(--space-3);"><span class="kicker" style="width: 64px;">Area</span>${fixed === "area" ? allBtn("area", false) : ""}${areaCounts.map((a) => btn("area", a.slug, a.name, a.slug === area)).join("")}</div>
<div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: var(--space-4);"><span class="kicker" style="width: 64px;">Topic</span>${fixed === "topic" ? allBtn("topic", false) : ""}${topicCounts.map((t) => btn("topic", t.slug, t.name, t.slug === topic)).join("")}</div>
<label for="post-search" class="kicker" style="display: block; margin-bottom: 6px;">Search</label>
<input id="post-search" class="input" type="search" placeholder="Search posts, for example Finn Hill or schools" style="width: 100%; box-sizing: border-box;">
<div id="post-count" class="kicker" style="margin-top: var(--space-3);">${posts.length} posts</div>
</div>`;
}

function buildListingPage({ posts, allPosts, fixed, area, topic, title, h1, intro, pathName, crumbs }) {
  const sorted = [...posts].sort(byDateDesc);
  const body = `<main class="page">
<div class="narrow">
${breadcrumbHtml(crumbs)}
<h1 style="margin: var(--space-6) 0 var(--space-3); font-size: clamp(36px, 5vw, 56px);">${escapeHtml(h1)}</h1>
<p style="max-width: 620px; line-height: 1.65; margin: 0 0 var(--space-6);">${intro}</p>
${filterBar(fixed ? posts : allPosts, { fixed, area, topic })}
<section id="post-list" data-fixed="${fixed || ""}" data-area="${area || ""}" data-topic="${topic || ""}">
${sorted.map(postCard).join("\n")}
</section>
</div>
</main>
${FILTER_SCRIPT}`;
  const ld = [
    breadcrumbLd(crumbs),
    { "@context": "https://schema.org", "@type": "CollectionPage", name: h1, url: SITE_URL + pathName, dateModified: maxDate(sorted.map(lastmodOf)), hasPart: sorted.slice(0, 30).map((p) => ({ "@type": "Article", headline: p.title, url: SITE_URL + postUrl(p), datePublished: p.publishedDate })) },
  ];
  return L.page({ title, description: intro.replace(/<[^>]+>/g, "").slice(0, 300), path: pathName, ld, body });
}

// ---------- market reports ----------

function lineChart(series, label) {
  const pts = series.filter((p) => p.medianSalePrice != null).slice(-25);
  if (pts.length < 3) return "";
  const W = 720, H = 280, padL = 64, padR = 20, padT = 20, padB = 40;
  const vals = pts.map((p) => p.medianSalePrice);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || hi * 0.1;
  lo = Math.max(0, lo - span * 0.15); hi = hi + span * 0.15;
  const x = (i) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const money = (v) => (v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : "$" + Math.round(v / 1000) + "K");
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const grid = ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="var(--color-divider)" stroke-width="1"/><text x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--color-neutral-600)">${money(t)}</text>`).join("");
  const xLabels = pts.map((p, i) => (i % 6 === (pts.length - 1) % 6 ? `<text x="${x(i).toFixed(1)}" y="${H - 14}" text-anchor="${i === pts.length - 1 ? "end" : "middle"}" font-size="11" fill="var(--color-neutral-600)">${M.shortWindowLabel(p).replace(/^\w+ (\d{4} )?to /, "")}</text>` : "")).join("");
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.medianSalePrice).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => `<g class="pt"><circle cx="${x(i).toFixed(1)}" cy="${y(p.medianSalePrice).toFixed(1)}" r="12" fill="transparent"/><circle cx="${x(i).toFixed(1)}" cy="${y(p.medianSalePrice).toFixed(1)}" r="${i === pts.length - 1 ? 5 : 3}" fill="var(--color-accent-700)" stroke="var(--color-bg)" stroke-width="2"/><title>${M.windowLabel(p)}: ${M.fmt.money(p.medianSalePrice)}${p.homesSold != null ? ` (${p.homesSold} sales)` : ""}</title></g>`).join("");
  const last = pts[pts.length - 1];
  return `<figure style="margin: var(--space-6) 0;">
<figcaption style="font-size: 14px; margin-bottom: var(--space-3);"><strong>${escapeHtml(label)}</strong><br><span style="color: var(--color-neutral-600); font-size: 13px;">Each point is a rolling 3 month window. Hover a point for the exact figure.</span></figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(label)}. Latest: ${M.fmt.money(last.medianSalePrice)} for ${M.windowLabel(last)}." style="width: 100%; height: auto; display: block; font-family: var(--font-body);">
${grid}${xLabels}
<path d="${d}" fill="none" stroke="var(--color-accent-700)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
<text x="${Math.min(x(pts.length - 1), W - padR).toFixed(1)}" y="${(y(last.medianSalePrice) - 12).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--color-text)">${M.fmt.money(last.medianSalePrice)}</text>
</svg>
</figure>`;
}

function reportTable(stats) {
  const rows = M.tableRows(stats);
  const head = `<tr><th>Single family homes</th><th>${M.shortWindowLabel(stats.cur)}</th>${stats.prev ? `<th>Last month's window<br>(${M.shortWindowLabel(stats.prev)})</th>` : ""}${stats.yearAgo ? `<th>Last year<br>(${M.shortWindowLabel(stats.yearAgo)})</th><th>Change vs last year</th>` : ""}</tr>`;
  const body = rows.map((r) => `<tr><td>${r.label}</td><td><strong>${r.cur}</strong></td>${stats.prev ? `<td>${r.prev || "&nbsp;"}</td>` : ""}${stats.yearAgo ? `<td>${r.yearAgo || "&nbsp;"}</td><td>${r.change || "&nbsp;"}</td>` : ""}</tr>`).join("");
  return `<div class="table-wrap"><table class="report-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function sourceNote(stats) {
  const small = stats.small ? ` ${stats.areaName} is a small market, so each window covers 3 months of sales to smooth out the swings, and a single sale can still move the median.` : "";
  return `<p style="font-size: 13px; color: var(--color-neutral-600); line-height: 1.7; margin-top: var(--space-8);"><strong>Source:</strong> <a href="https://www.redfin.com/news/data-center/" rel="nofollow noopener" target="_blank">Redfin Data Center</a>, city level data for ${escapeHtml(stats.areaName)}, WA, single family homes. Data from Redfin, a national real estate brokerage${marketData && marketData.redfinLastUpdated ? `, released ${formatDate(marketData.redfinLastUpdated)}` : ""}. Every figure is a rolling 3 month window (this one: ${M.windowLabel(stats.cur)}), which is how Redfin publishes city level numbers; "last month's window" is the same 3 month span shifted back one month.${small} Any figure Redfin didn't report is left out rather than estimated. These figures are deemed reliable but not guaranteed, and they are not an appraisal of any specific home.</p>`;
}

function buildReportPage(rep, allPosts) {
  const { stats, info, area } = rep;
  const crumbs = [{ name: "Home", path: "/" }, { name: "Market Reports", path: "/market-reports/" }, { name: area.name, path: rep.path }];
  const guides = allPosts.filter((p) => p.topic === "neighborhood-guides" && p.areas.includes(area.slug)).sort(byDateDesc);
  const updates = allPosts.filter((p) => p.topic === "market-reports" && p.areas.includes(area.slug)).sort(byDateDesc).slice(0, 6);
  const title = info.title;
  const c = info.commentary;
  const description = `${area.name}, WA home values and housing market report, updated ${info.updatedMonth}: median sale price, homes sold, days on market and months of supply, with what it means for buyers and sellers.`;
  const body = `<main class="page"><div class="narrow">
${breadcrumbHtml(crumbs)}
<div class="kicker" style="margin-top: var(--space-6);">Market report &middot; Updated ${escapeHtml(info.updatedMonth)}</div>
<h1 style="margin: var(--space-2) 0 var(--space-4); font-size: clamp(32px, 4.4vw, 50px); line-height: 1.12;">${escapeHtml(area.name)} Home Values &amp; Market Report</h1>
<p style="font-size: 19px; line-height: 1.7;">${escapeHtml(c.summary)}</p>
<h2 style="margin-top: var(--space-8);">${escapeHtml(M.windowLabel(stats.cur))} at a glance</h2>
${reportTable(stats)}
${lineChart(stats.series, `${area.name} median single family sale price`)}
<h2 style="margin-top: var(--space-8);">What this means if you're selling</h2>
<p style="line-height: 1.75;">${escapeHtml(c.selling)}</p>
<h2 style="margin-top: var(--space-6);">What this means if you're buying</h2>
<p style="line-height: 1.75;">${escapeHtml(c.buying)}</p>
${valuationCta()}
${guides.length ? `<h2 style="margin-top: var(--space-8);">${escapeHtml(area.name)} neighborhood guides</h2>${smallPostList(guides)}` : ""}
<p style="margin-top: var(--space-6); line-height: 1.7;">Everything else about ${escapeHtml(area.name)}, including current listings, is on the <a href="/areas/${area.slug}/">${escapeHtml(area.name)} area guide</a>.</p>
${updates.length ? `<h2 style="margin-top: var(--space-8);">Monthly ${escapeHtml(area.name)} updates</h2>${smallPostList(updates)}` : ""}
${sourceNote(stats)}
</div></main>`;
  const series = stats.series.filter((p) => p.medianSalePrice != null);
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${area.name}, WA home values and market report`,
      description,
      url: SITE_URL + rep.path,
      dateModified: info.updatedDate,
      temporalCoverage: `${series[0].begin}/${stats.cur.end}`,
      spatialCoverage: { "@type": "Place", name: `${area.name}, WA`, address: { "@type": "PostalAddress", addressLocality: area.name, addressRegion: "WA", addressCountry: "US" } },
      variableMeasured: ["Median sale price", "Homes sold", "Median days on market", "Average sale to list ratio", "Months of supply"],
      isBasedOn: "https://www.redfin.com/news/data-center/",
      creator: { "@type": "Person", name: "Jack Macdonald", url: `${SITE_URL}/about/` },
      isAccessibleForFree: true,
    },
    breadcrumbLd(crumbs),
  ];
  return L.page({ title, description, path: rep.path, ld, body, markdownAlt: true });
}

function buildReportMarkdown(rep) {
  const { stats, info, area } = rep;
  const rows = M.tableRows(stats).map((r) => `| ${r.label} | ${r.cur} | ${r.prev || ""} | ${r.yearAgo || ""} | ${r.change || ""} |`).join("\n");
  return `# ${info.title}

Web page: ${SITE_URL}${rep.path}
Updated: ${info.updatedMonth}. Data window: ${M.windowLabel(stats.cur)} (rolling 3 months, single family homes). Source: Redfin Data Center.

${info.commentary.summary}

| Metric | ${M.shortWindowLabel(stats.cur)} | Last month's window | Last year | Change vs last year |
| --- | --- | --- | --- | --- |
${rows}

## What this means if you're selling

${info.commentary.selling}

## What this means if you're buying

${info.commentary.buying}

Curious what your home would sell for right now? ${SITE_URL}${VALUATION_URL}
`;
}

function buildReportsIndex(reports) {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Market Reports", path: "/market-reports/" }];
  const cards = reports.map((r) => `<a href="${r.path}" class="card" style="display: block; padding: var(--space-6); color: inherit;">
<div class="kicker">Updated ${escapeHtml(r.info.updatedMonth)}</div>
<h2 style="margin: var(--space-2) 0; font-size: 26px;">${escapeHtml(r.area.name)}</h2>
${r.stats.cur.medianSalePrice != null ? `<div style="font-family: var(--font-heading); font-size: 24px;">${M.fmt.money(r.stats.cur.medianSalePrice)}</div><div style="font-size: 13px; color: var(--color-neutral-600);">Median single family sale price, ${escapeHtml(M.windowLabel(r.stats.cur))}</div>` : ""}
</a>`).join("\n");
  const body = `<main class="page">
${breadcrumbHtml(crumbs)}
<h1 style="margin: var(--space-6) 0 var(--space-3); font-size: clamp(36px, 5vw, 56px);">Eastside Market Reports</h1>
<p style="max-width: 640px; line-height: 1.65; margin: 0 0 var(--space-8);">Home values and market numbers for each city I work in, refreshed every month from Redfin Data Center data, with a plain English read on what it means if you're buying or selling.</p>
<div class="grid">${cards}</div>
<div class="narrow">${valuationCta()}</div>
</main>`;
  const ld = [breadcrumbLd(crumbs), { "@context": "https://schema.org", "@type": "CollectionPage", name: "Eastside Market Reports", url: `${SITE_URL}/market-reports/`, dateModified: maxDate(reports.map((r) => r.info.updatedDate)), hasPart: reports.map((r) => ({ "@type": "Dataset", name: r.info.title, url: SITE_URL + r.path, dateModified: r.info.updatedDate })) }];
  return L.page({ title: "Eastside Market Reports | Home Values by City | Jack Macdonald", description: `Monthly home value and market reports for ${listNames(REPORT_AREAS)} from Jack Macdonald, Macdonald Group of Compass.`, path: "/market-reports/", ld, body });
}

// ---------- area hubs ----------

const AREA_REVIEWS = loadJson(path.join(ROOT, "auto-blog-system/content/area-reviews.json"), {});
const GOOGLE_REVIEWS_URL = "https://www.google.com/search?q=Jack+Macdonald+Macdonald+Group+Real+Estate+Bellevue";

function hubSelling(area) {
  const reviews = Array.isArray(AREA_REVIEWS[area.slug]) ? AREA_REVIEWS[area.slug] : [];
  const quotes = reviews.map((r) => `<blockquote class="card" style="margin: var(--space-3) 0; padding: var(--space-5); font-style: italic; line-height: 1.7;">&ldquo;${escapeHtml(r.quote)}&rdquo;<div style="font-style: normal; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-neutral-600); margin-top: var(--space-3);">${escapeHtml(r.name)}, ${escapeHtml(r.detail)}</div></blockquote>`).join("\n");
  const report = reportFor(area.slug);
  const st = report && report.stats;
  const name = escapeHtml(area.name);
  let market = "";
  if (st && st.cur && st.cur.medianDom != null) {
    const dom = st.cur.medianDom, sold = st.cur.homesSold, s2l = st.cur.saleToList;
    const win = escapeHtml(report.info.window || "the last three months");
    const days = (n) => `${n} ${n === 1 ? "day" : "days"}`;
    if (sold != null && sold < 25) {
      market = `Only ${sold} single family homes sold in ${name} from ${win}, so there aren't many good comparables. That makes picking the right ones, and knowing what's different about your home, a bigger part of getting the price right.`;
    } else if (st.domYoY != null && st.domYoY >= 5) {
      const mos = st.cur.monthsOfSupply;
      market = `${name} has slowed down: the median home took ${days(dom)} to sell from ${win}, ${days(st.domYoY)} longer than a year ago${mos != null ? `, and there are about ${mos.toFixed(1)} months of supply` : ""}.`;
    } else if (st.domYoY != null && st.domYoY <= -1) {
      market = `${name} homes are selling a little faster than last year: ${days(dom)} at the median from ${win}${s2l != null ? `, with sellers getting about ${s2l.toFixed(1)}% of list price on average` : ""}.`;
    } else {
      market = `From ${win}, the median ${name} home sold in ${days(dom)}${s2l != null ? ` at about ${s2l.toFixed(1)}% of list price` : ""}.`;
    }
    market += ` <a href="${report.path}">See the full ${name} numbers</a>.`;
    market += ` <span style="display: block; font-size: 13px; color: var(--color-neutral-600); margin-top: var(--space-2);">Market figures are for single family homes from ${win}, from the Redfin Data Center, and are updated monthly.</span>`;
  }
  const example = "";
  return `<h2 style="margin-top: var(--space-8);">Selling in ${name}</h2>
${market ? `<p style="line-height: 1.7;">${market}</p>` : ""}
${hubAngle(area)}
${hubNotes(area)}
<p style="line-height: 1.7;">I price off the sales that actually happened near you, fix only what buyers will notice, and stay on top of the listing once it's live.${example} <a href="/sell/">Here's how I sell homes</a>, or <a href="/home-value/">get a price range for yours</a>.</p>
${quotes ? `${quotes}\n<p style="font-size: 14px;"><a href="${GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener">More client reviews on Google &rarr;</a></p>` : ""}`;
}

// ---------- city selling content (verified sales + local selling notes) ----------
// auto-blog-system/content/area-sales.json, keyed by area slug:
//   { "notes": ["paragraph", ...], "sales": [{ side: "seller"|"buyer", year, price, title, story }] }
// Only verified facts from Jack's transaction records go in this file.
const AREA_SALES = loadJson(path.join(ROOT, "auto-blog-system/content/area-sales.json"), {});
const fmtPrice = (n) => "$" + Number(n).toLocaleString("en-US");

const HUB_CSS = `<style>
.hub-hero { background: #141311; color: #f4f2ee; padding: var(--space-8) var(--space-6); margin: var(--space-4) 0 0; }
.hub-hero .kicker { color: #b9b5ae; }
.hub-hero h1 { color: #fdfdfc; margin: var(--space-3) 0 var(--space-4); font-size: clamp(36px, 5.5vw, 60px); line-height: 1.05; }
.hub-hero p { color: #e6e3de; max-width: 680px; line-height: 1.7; font-size: 17px; }
.hub-hero .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-5); }
.hub-hero .btn-primary { background: #fdfdfc; color: #141311; border-color: #fdfdfc; }
.hub-hero .btn-secondary { background: transparent; color: #fdfdfc; border-color: #fdfdfc; }
.hub-why { display: grid; grid-template-columns: minmax(0, 150px) minmax(0, 1fr); gap: var(--space-5); align-items: start; margin-top: var(--space-8); }
.hub-why img { width: 100%; height: auto; display: block; }
.hub-why h2 { margin: 0 0 var(--space-3); }
.hub-why p { line-height: 1.75; margin: 0 0 var(--space-3); }
.hub-sales { display: grid; gap: var(--space-5); margin-top: var(--space-5); }
.hub-sale { border: 1px solid var(--color-divider); background: #fff; display: grid; grid-template-columns: minmax(0, 1fr); }
.hub-sale.featured .photos { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
.hub-sale.featured .photos img:first-child { grid-column: 1; grid-row: 1 / span 2; aspect-ratio: auto; }
.hub-sale.featured .photos img { aspect-ratio: 4 / 3; }
.hub-sale .photos.two, .hub-sale.featured .photos.two { grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
.hub-sale .photos.two img, .hub-sale.featured .photos.two img:first-child { grid-column: auto; grid-row: auto; aspect-ratio: 4 / 3; }
.hub-sale .note { font-size: 13px; color: var(--color-neutral-600); margin: var(--space-3) 0 0; }
.hub-sale .photos { display: grid; gap: 4px; grid-template-columns: 1fr 1fr; align-content: start; }
.hub-sale .photos img { width: 100%; height: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.hub-sale .photos img:first-child { grid-column: 1 / -1; aspect-ratio: 3 / 2; }
.hub-sale .body { padding: var(--space-5) var(--space-6) var(--space-6); }
.hub-sale .tags { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-3); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
.hub-sale .side { padding: 4px 10px; border: 1px solid #201f1d; }
.hub-sale .side.seller { background: #201f1d; color: #fdfdfc; }
.hub-sale h3 { margin: 0 0 var(--space-3); font-size: 22px; line-height: 1.3; }
.hub-sale p { font-size: 15.5px; line-height: 1.7; margin: 0 0 var(--space-4); }
.hub-sale .figures { display: flex; flex-wrap: wrap; gap: var(--space-5); border-top: 1px solid var(--color-divider); padding-top: var(--space-4); }
.hub-sale .figures div { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-neutral-600); }
.hub-sale .figures strong { display: block; font-family: var(--font-heading); font-weight: 400; font-size: 26px; letter-spacing: 0; text-transform: none; color: #201f1d; margin-top: 2px; }
.hub-glance { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 1px; background: var(--color-divider); border: 1px solid var(--color-divider); margin-top: var(--space-5); }
.hub-glance a { display: block; background: #fff; padding: var(--space-4) var(--space-5); color: inherit; text-decoration: none; }
.hub-glance a:hover { background: #f7f6f4; }
.hub-glance .r { font-family: var(--font-heading); font-size: 21px; line-height: 1.3; color: #201f1d; }
.hub-glance .m { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-neutral-600); margin-top: var(--space-2); }
.hub-sale .result { font-family: var(--font-heading); font-size: 26px; line-height: 1.25; margin: 0 0 var(--space-2); color: #201f1d; }
.hub-sale h3.sub { font-family: inherit; font-size: 15px; letter-spacing: 0.02em; color: var(--color-neutral-600); margin: 0 0 var(--space-3); font-weight: 500; }
.hub-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: var(--space-5); }
@media (max-width: 760px) {
  .hub-hero { padding: var(--space-6) var(--space-4); margin-left: calc(-1 * var(--space-4)); margin-right: calc(-1 * var(--space-4)); }
  .hub-sale.featured .photos { grid-template-columns: 1fr 1fr; grid-template-rows: auto; }
  .hub-sale.featured .photos img:first-child { grid-column: 1 / -1; grid-row: auto; aspect-ratio: 3 / 2; }
  .hub-sale.featured .photos.two img:first-child { grid-column: auto; aspect-ratio: 4 / 3; }
  .hub-why { grid-template-columns: minmax(0, 1fr); }
  .hub-why img { max-width: 140px; }
  .hub-sale .body { padding: var(--space-4) var(--space-4) var(--space-5); }
}
</style>`;

function saleCard(x, featured) {
  const photos = Array.isArray(x.photos) && x.photos.length ? x.photos : null;
  const isBuyer = x.side === "buyer";
  return `<article class="hub-sale${featured && photos ? " featured" : ""}" id="sale-${escapeHtml(String(x.id || ""))}">
${photos ? `<div class="photos${photos.length === 2 ? " two" : ""}">${photos.map((ph) => `<img src="${escapeHtml(ph.src)}" alt="${escapeHtml(ph.alt)}" loading="lazy">`).join("")}</div>` : ""}
<div class="body">
<div class="tags"><span class="side ${isBuyer ? "buyer" : "seller"}">${isBuyer ? "I represented the buyer" : "I represented the seller"}</span><span>${escapeHtml(String(x.year))}${x.place ? ` &middot; ${escapeHtml(x.place)}` : ""}</span></div>
${x.result ? `<div class="result">${escapeHtml(x.result)}</div><h3 class="sub">${escapeHtml(x.title)}</h3>` : `<h3>${escapeHtml(x.title)}</h3>`}
${x.story ? `<p>${escapeHtml(x.story)}</p>` : ""}
<div class="figures">${x.listPrice ? `<div>Listed<strong>${fmtPrice(x.listPrice)}</strong></div>` : ""}<div>${isBuyer ? "Purchase price" : "Sold"}<strong>${fmtPrice(x.price)}</strong></div></div>
${x.note ? `<p class="note">${escapeHtml(x.note)}</p>` : ""}
</div>
</article>`;
}

function hubSales(area) {
  const d = AREA_SALES[area.slug];
  if (!d || !Array.isArray(d.sales) || !d.sales.length) return "";
  const name = escapeHtml(area.name);
  const sales = d.sales.slice();
  const fi = sales.findIndex((x) => Array.isArray(x.photos) && x.photos.length);
  const featured = fi >= 0 ? sales.splice(fi, 1)[0] : null;
  return `<section id="recent-sales" style="margin-top: var(--space-8);">
<h2>How I work in ${name}, with recent sales</h2>
${Array.isArray(d.how) ? d.how.map((t) => `<p style="line-height: 1.75;">${t}</p>`).join("\n") : ""}
<p style="font-size: 13px; color: var(--color-neutral-600); line-height: 1.6;">From my transaction records, prices as closed. <a href="/sell/">My full selling process</a>.</p>
<div class="hub-sales">
${featured ? saleCard(featured, true) : ""}
${sales.length ? `<div class="hub-pair">${sales.map((x) => saleCard(x, false)).join("\n")}</div>` : ""}
</div>
</section>`;
}

function hubGlance(area) {
  const d = AREA_SALES[area.slug];
  if (!d || !Array.isArray(d.sales) || !d.sales.length) return "";
  const items = d.sales.filter((x) => x.result && x.glance).sort((a, b) => a.glance - b.glance).slice(0, 3);
  return `<section aria-label="Recent results" style="margin-top: var(--space-6);">
<div class="kicker">Recent ${escapeHtml(area.name)} results</div>
<div class="hub-glance">${items.map((x) => `<a href="#sale-${escapeHtml(String(x.id))}"><div class="r">${escapeHtml(x.result)}</div><div class="m">${x.side === "buyer" ? "Buyer side" : "Seller side"} &middot; ${escapeHtml(String(x.year))}${x.place ? ` &middot; ${escapeHtml(x.place)}` : ""}</div></a>`).join("")}</div>
</section>`;
}

function hubWhy(area) {
  const d = AREA_SALES[area.slug];
  if (!d || !d.why) return "";
  return `<section class="hub-why" id="why">
<img src="/assets/estate/jack-headshot-720.jpg" alt="Jack Macdonald, Compass real estate broker" loading="lazy">
<div><h2>${escapeHtml(d.whyTitle || "Why sellers call me")}</h2>${d.why.map((t) => `<p>${t}</p>`).join("")}
<p style="font-size: 14px;"><a href="/about/">More about me</a></p></div>
</section>`;
}

function hubNotes(area) {
  const d = AREA_SALES[area.slug];
  if (!d || !Array.isArray(d.notes) || !d.notes.length) return "";
  return d.notes.map((t) => `<p style="line-height: 1.7;">${t}</p>`).join("\n");
}

// One data-driven paragraph per priority city, each built around a different market fact,
// so the city pages don't read alike. Numbers come from the same Redfin data as the reports.
const ANGLE_AREAS = ["bellevue", "kirkland", "redmond", "issaquah", "sammamish"];
function hubAngle(area) {
  if (!ANGLE_AREAS.includes(area.slug)) return "";
  const r = reportFor(area.slug);
  const st = r && r.stats; const c = st && st.cur;
  if (!c) return "";
  const win = escapeHtml(r.info.window || "the last three months");
  const name = escapeHtml(area.name);
  const pct = (n) => `${Number(n).toFixed(1)}%`;
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const peers = ANGLE_AREAS.map((s) => { const x = reportFor(s); return x && x.stats && x.stats.cur ? { slug: s, cur: x.stats.cur } : null; }).filter(Boolean);
  let t = "";
  if (area.slug === "bellevue" && c.soldAboveList != null && c.saleToList != null && c.medianSalePrice) {
    t = `From ${win}, ${pct(c.soldAboveList)} of Bellevue single family homes sold above list price, and sellers got about ${pct(c.saleToList)} of list on average. At a median sale price of ${money(c.medianSalePrice)}, a list price just 3% too high is about ${money(Math.round(c.medianSalePrice * 0.03 / 5000) * 5000)} of overreach, and an overpriced home can sit while buyers wait for a reduction.`;
  } else if (area.slug === "kirkland" && st.priceYoY != null && c.medianSalePrice) {
    t = `The median Kirkland single family sale was ${money(c.medianSalePrice)} from ${win}, ${st.priceYoY < 0 ? "down" : "up"} ${pct(Math.abs(st.priceYoY))} from the same months last year. When prices move that much, a neighbor's sale from last spring can point you to the wrong number, so the most recent closed sales near you matter most.`;
  } else if (area.slug === "redmond" && c.homesSold != null) {
    t = `Only ${c.homesSold} single family homes sold in Redmond from ${win}. With that few sales spread across Education Hill, Grass Lawn, the Overlake area and the plateau toward Redmond Ridge, the comparables you choose do a lot of the work in setting the price.`;
  } else if (area.slug === "issaquah" && c.medianDom != null) {
    const fastest = peers.every((p) => p.slug === "issaquah" || (p.cur.medianDom != null && p.cur.medianDom >= c.medianDom));
    t = `${fastest ? `That ${c.medianDom} day median was the fastest of the five Eastside cities I track most closely, and ` : ""}${c.soldAboveList != null ? `${pct(c.soldAboveList)} of Issaquah homes sold above list` : ""}. A home that's priced and prepared right from day one tends to see its strongest interest in that first stretch.`;
  } else if (area.slug === "sammamish" && c.monthsOfSupply != null) {
    const most = peers.every((p) => p.slug === "sammamish" || (p.cur.monthsOfSupply != null && p.cur.monthsOfSupply <= c.monthsOfSupply));
    t = `Sammamish had about ${c.monthsOfSupply.toFixed(1)} months of supply from ${win}${most ? ", the most of the five Eastside cities I track most closely" : ""}. When buyers have more homes to choose from, condition and presentation carry more weight.`;
  }
  return t ? `<p style="line-height: 1.7;">${t}</p>` : "";
}

function hubValuationForm(area) {
  const name = escapeHtml(area.name);
  const id = (k) => `hv-${area.slug}-${k}`;
  return `<section id="home-value" class="card" style="padding: var(--space-6); margin-top: var(--space-8);">
<div class="kicker">A price range from me, not an algorithm</div>
<h2 style="margin: var(--space-2) 0 var(--space-3); font-size: 28px;">What would your ${name} home sell for?</h2>
<p style="line-height: 1.65; margin: 0 0 var(--space-5);">Send me the address and I'll look at your home and the recent ${name} sales around it myself, then send you a price range with the comparable sales behind it. It's my analysis, not an automated estimate, and there's no obligation. Or call or text <a href="tel:4259416998">425.941.6998</a>.</p>
<form name="home-value" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/home-value/thanks/" style="display: grid; gap: var(--space-3);">
<input type="hidden" name="form-name" value="home-value">
<p hidden><label>Leave this empty <input name="bot-field"></label></p>
<input type="hidden" name="source" value="${name} city page">
<div class="field"><label for="${id("address")}">Property address</label><input class="input" id="${id("address")}" name="address" required autocomplete="street-address" placeholder="Street, ${name}"></div>
<div class="field"><label for="${id("name")}">Name</label><input class="input" id="${id("name")}" name="name" required autocomplete="name"></div>
<div class="field"><label for="${id("email")}">Email</label><input class="input" id="${id("email")}" name="email" type="email" required autocomplete="email"></div>
<div class="field"><label for="${id("phone")}">Phone (optional)</label><input class="input" id="${id("phone")}" name="phone" type="tel" autocomplete="tel"></div>
<div class="field"><label for="${id("timeline")}">When might you sell?</label><select class="input" id="${id("timeline")}" name="timeline"><option>Just curious</option><option>Within 3 months</option><option>3 to 6 months</option><option>6 to 12 months</option><option>More than a year</option></select></div>
<button type="submit" class="btn btn-primary">Send me a price range</button>
</form>
</section>`;
}

const listingsData = loadJson(LISTINGS_PATH, { listings: [] });

function listingCard(l) {
  const img = l.image && (l.image["0"] || l.image[0]);
  const photo = img && img.url ? img.url : "";
  const price = typeof l.listingPrice === "string" && l.listingPrice.startsWith("$") ? l.listingPrice : "$" + (Number(l.listingPrice) || 0).toLocaleString("en-US");
  const stats = [l.bedrooms ? `${l.bedrooms} bd` : "", l.totalBaths ? `${l.totalBaths} ba` : "", l.sqFt ? `${l.sqFt} sqft` : ""].filter(Boolean).join(" &middot; ");
  const status = l.propStatus || "Active";
  return `<div class="card" style="padding: 0; overflow: hidden;">
<div style="position: relative; background: var(--color-neutral-200);">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(l.address || "")}" loading="lazy" style="width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block;">` : ""}<span class="tag" style="position: absolute; top: 12px; left: 12px; background: ${status === "Pending" ? "#c8792a" : "#2f7d4f"}; color: #fff;">${escapeHtml(status)}</span></div>
<div style="padding: var(--space-4);">
<div style="font-family: var(--font-heading); font-size: 22px;">${escapeHtml(price)}</div>
<div style="font-size: 14px; color: var(--color-neutral-700); margin: 2px 0 var(--space-2);">${escapeHtml(l.address || l.displayAddress || "")}, ${escapeHtml(l.cityName || "")}</div>
${stats ? `<div style="font-size: 13px; color: var(--color-neutral-600); margin-bottom: var(--space-2);">${stats}</div>` : ""}
<p class="listing-attrib">${escapeHtml(attributionText(l.attribution))}</p>
<a href="${escapeHtml(l.fullDetailsURL || "https://jackmacdonaldre.idxbroker.com/idx/search")}" target="_blank" rel="noopener" class="btn btn-secondary btn-block">View details</a>
</div>
</div>`;
}

// IDX rules expect listing data no older than 12 hours. GitHub sometimes skips
// scheduled refresh runs, so a page built from older data hides its cards in
// the browser once the data is more than a day old, instead of showing homes
// that may have sold.
const STALE_LISTINGS_SCRIPT = `(function(){var g=document.querySelector("[data-listings-generated]");if(!g)return;var t=Date.parse(g.getAttribute("data-listings-generated"));if(t&&Date.now()-t>864e5){g.style.display="none";var n=g.parentNode.querySelector(".listings-stale");if(n)n.style.display="block";}})();`;

function hubListings(area) {
  const mine = (listingsData.listings || []).filter((l) => String(l.cityName || "").toLowerCase() === area.name.toLowerCase());
  const updated = listingsData.generatedAt ? formatDate(listingsData.generatedAt.slice(0, 10)) : null;
  return `<section id="listings" style="margin-top: var(--space-8);">
<h2>Homes for sale in ${escapeHtml(area.name)}</h2>
${mine.length ? `<div class="grid" style="margin-top: var(--space-4);" data-listings-generated="${escapeHtml(listingsData.generatedAt || "")}">${mine.map(listingCard).join("\n")}</div>
<p class="listings-stale" style="display: none; line-height: 1.65;">Our listing cards are being refreshed. Every home on the market in ${escapeHtml(area.name)} is in the full search.</p>
<script>${STALE_LISTINGS_SCRIPT}</script>` : `<p style="line-height: 1.65;">We don't have a listing of our own in ${escapeHtml(area.name)} right now. Every home on the market there is in the full search.</p>`}
<p style="margin-top: var(--space-4);"><a href="${SEARCH_URL}" class="btn btn-primary" style="white-space: normal; max-width: 100%; text-align: center;">Search all ${escapeHtml(area.name)} homes for sale</a></p>
<p style="font-size: 11px; color: var(--color-neutral-600); line-height: 1.6;">Listing information is provided through IDX from Northwest MLS and is deemed reliable but not guaranteed.${updated ? ` Listing data last updated ${updated}.` : ""}</p>
</section>`;
}

function buildHub(area, allPosts) {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Areas", path: "/areas/" }, { name: area.name, path: `/areas/${area.slug}/` }];
  const inArea = allPosts.filter((p) => p.areas.includes(area.slug)).sort(byDateDesc);
  const guides = inArea.filter((p) => p.topic === "neighborhood-guides");
  const schools = inArea.filter((p) => p.topic === "schools-and-family");
  const report = reportFor(area.slug);
  const priority = ANGLE_AREAS.includes(area.slug);
  const sd = AREA_SALES[area.slug] || {};
  const reportCard = report ? `<div class="card" style="padding: var(--space-6); margin-top: var(--space-8);">
<div class="kicker">Latest market report &middot; Updated ${escapeHtml(report.info.updatedMonth)}</div>
<p style="line-height: 1.7; margin: var(--space-3) 0;">${escapeHtml(report.info.commentary.summary)}</p>
<a href="${report.path}" class="btn btn-secondary">Read the ${escapeHtml(area.name)} market report</a>
</div>` : "";
  const guidesHtml = `<h2 style="margin-top: var(--space-8);">${escapeHtml(area.name)} neighborhood guides</h2>
${smallPostList(guides, `New ${escapeHtml(area.name)} guides are on the way.`)}
${schools.length ? `<h2 style="margin-top: var(--space-8);">Schools and family</h2>${smallPostList(schools)}` : ""}
<p style="margin-top: var(--space-6);"><a href="/blog/area/${area.slug}/">All ${escapeHtml(area.name)} posts &rarr;</a></p>`;
  const body = priority ? `${HUB_CSS}<main class="page">
<div class="narrow">
${breadcrumbHtml(crumbs)}
<header class="hub-hero">
<div class="kicker">Jack Macdonald &middot; Macdonald Group of Compass</div>
<h1>${escapeHtml(area.name)} Real Estate</h1>
<p>${escapeHtml(AREA_INTROS[area.slug] || "")}</p>
${sd.lead ? `<p>${escapeHtml(sd.lead)}</p>` : ""}
<div class="actions"><a href="#home-value" class="btn btn-primary">Get a price range from me</a><a href="tel:4259416998" class="btn btn-secondary">Call or text 425.941.6998</a></div>
</header>
${hubGlance(area)}
${hubWhy(area)}
${hubSelling(area)}
${hubSales(area)}
${hubValuationForm(area)}
${reportCard}
${guidesHtml}
</div>
${hubListings(area)}
</main>` : `<main class="page">
<div class="narrow">
${breadcrumbHtml(crumbs)}
<h1 style="margin: var(--space-6) 0 var(--space-3); font-size: clamp(36px, 5vw, 56px);">${escapeHtml(area.name)} Real Estate</h1>
<p style="font-size: 18px; line-height: 1.7;">${escapeHtml(AREA_INTROS[area.slug] || "")}</p>
<p style="font-size: 15px; margin-top: var(--space-3);"><a href="#home-value">Thinking about selling? Get a price range for your ${escapeHtml(area.name)} home</a> &middot; <a href="tel:4259416998">Call or text 425.941.6998</a></p>
${reportCard.replace("margin-top: var(--space-8)", "margin-top: var(--space-6)")}
${guidesHtml}
${hubSelling(area)}
${hubSales(area)}
</div>
${hubListings(area)}
<div class="narrow">${hubValuationForm(area)}</div>
</main>`;
  const ld = [
    { "@context": "https://schema.org", ...L.AGENT, "@id": `${SITE_URL}/#jack-macdonald`, areaServed: { "@type": "City", name: `${area.name}, WA` }, description: `Jack Macdonald helps buyers and sellers in ${area.name}, WA with Macdonald Group of Compass.` },
    breadcrumbLd(crumbs),
  ];
  const title = priority ? `${area.name}, WA Real Estate: Recent Sales & Selling | Jack Macdonald` : `${area.name}, WA Real Estate: Neighborhoods, Market Report & Homes for Sale | Jack Macdonald`;
  const description = priority ? `Selling in ${area.name}? See my recent ${area.name} sales, how I price, prepare and negotiate, current market numbers, and get a price range from me personally.` : `${area.name}, WA area guide from local REALTOR Jack Macdonald: neighborhood guides, the latest market report, schools, and homes for sale.`;
  return L.page({ title, description, path: `/areas/${area.slug}/`, ld, body });
}

function buildAreasIndex(allPosts) {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Areas", path: "/areas/" }];
  const cards = HUB_AREAS.map((a) => `<a href="/areas/${a.slug}/" class="card" style="display: block; padding: var(--space-6); color: inherit;">
<h2 style="margin: 0 0 var(--space-2); font-size: 26px;">${escapeHtml(a.name)}</h2>
<p style="margin: 0; line-height: 1.6; font-size: 15px;">${escapeHtml(AREA_INTROS[a.slug] || "")}</p>
</a>`).join("\n");
  const body = `<main class="page">
${breadcrumbHtml(crumbs)}
<h1 style="margin: var(--space-6) 0 var(--space-3); font-size: clamp(36px, 5vw, 56px);">Eastside Areas</h1>
<p style="max-width: 640px; line-height: 1.65; margin: 0 0 var(--space-8);">Neighborhood guides, market numbers, schools and current listings for each part of the Eastside I work in.</p>
<div class="grid">${cards}</div>
</main>`;
  const ld = [breadcrumbLd(crumbs), { "@context": "https://schema.org", ...L.AGENT, areaServed: HUB_AREAS.map((a) => ({ "@type": "City", name: `${a.name}, WA` })) }];
  return L.page({ title: "Eastside Area Guides | Neighborhoods, Market Reports, Schools | Jack Macdonald", description: `Area guides for ${listNames(HUB_AREAS)}: neighborhoods, market reports, schools and homes for sale.`, path: "/areas/", ld, body });
}

// ---------- AI / LLM readable files ----------

function decodeEntities(str) {
  return String(str || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"');
}
function htmlToMarkdown(html) {
  let md = stripReviewNote(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n* $1")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, text) => `[${text}](${href.startsWith("/") ? SITE_URL + href : href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n")
    .replace(/<[^>]+>/g, "");
  md = decodeEntities(md);
  return md.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function buildPostMarkdown(post) {
  const faq = Array.isArray(post.faq) && post.faq.length ? "\n\n## Common Questions\n\n" + post.faq.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n") : "";
  return `# ${post.title}

> ${post.metaDescription}

Author: Jack Macdonald, REALTOR, Macdonald Group of Compass, Bellevue WA
Published: ${formatDate(post.publishedDate)}
Topic: ${topicBySlug(post.topic).name}
Area: ${post.areas.map((a) => areaBySlug(a).name).join(", ")}, Washington
Web page: ${SITE_URL}${postUrl(post)}

${htmlToMarkdown(post.bodyHtml)}${faq}

About the author: Jack Macdonald grew up in Bellevue and helps buyers and sellers across Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell with Macdonald Group of Compass. Phone 425.941.6998. Website ${SITE_URL}/
`;
}

const SITE_SUMMARY = `# Jack Macdonald | Macdonald Group of Compass

> Jack Macdonald is a Bellevue native and REALTOR with Macdonald Group of Compass, helping people buy and sell homes across ${listNames(HUB_AREAS)} on the Eastside of Seattle, Washington. This site publishes monthly market reports, area guides, neighborhood guides, school district guides, city comparisons, and buyer and seller guides written from years of local experience.

Contact: 425.941.6998, 700 110th Ave NE, Suite 270, Bellevue, WA 98004. Washington license 21022645.

## Main pages

* [Home](${SITE_URL}/): overview of Jack Macdonald and Macdonald Group of Compass
* [About Jack](${SITE_URL}/about/): background, local roots in Bellevue, and approach
* [Seller services](${SITE_URL}/services/): pricing, marketing, and negotiation for Eastside sellers
* [Sell your home](${SITE_URL}/sell/): how Jack prices, preps, markets, and negotiates an Eastside home sale, with seller FAQs
* [Inherited and estate homes](${SITE_URL}/inherited-homes/): how Jack helps executors, heirs and families sell an inherited, estate or probate home, with Washington basics and FAQs
* [Home value](${SITE_URL}/home-value/): request a free price range for your home based on recent nearby sales
* [Buyer's guide](${SITE_URL}/buyers-guide/): the home buying process on the Eastside
* [Team](${SITE_URL}/team/): the Macdonald Group team
* [Contact](${SITE_URL}/contact/): phone, office, and message form
* [Areas](${SITE_URL}/areas/): area guides for each Eastside city
* [Market reports](${SITE_URL}/market-reports/): monthly home value reports by city
* [Blog](${SITE_URL}/blog/): all local guides, filterable by area and topic`;

function buildLlmsTxt(posts, reports) {
  const out = [SITE_SUMMARY, ""];
  out.push("## Market reports (updated monthly)", "");
  reports.forEach((r) => out.push(`* [${r.info.title}](${SITE_URL}${r.path}index.md): ${r.info.commentary.summary}`));
  out.push("", "## Area guides", "");
  HUB_AREAS.forEach((a) => out.push(`* [${a.name} area guide](${SITE_URL}/areas/${a.slug}/): ${AREA_INTROS[a.slug]}`));
  out.push("", "## Posts by area and topic", "");
  for (const area of AREAS) {
    const inArea = posts.filter((p) => p.areas[0] === area.slug);
    if (!inArea.length) continue;
    out.push(`### ${area.name}`, "");
    for (const t of TOPICS) {
      const list = inArea.filter((p) => p.topic === t.slug).sort(byDateDesc);
      if (!list.length) continue;
      out.push(`${t.name}:`, "");
      list.forEach((p) => out.push(`* [${p.title}](${SITE_URL}${postUrl(p)}index.md): ${p.metaDescription}`));
      out.push("");
    }
  }
  out.push("## Optional", "", `* [All guides and reports in one file](${SITE_URL}/llms-full.txt)`, `* [Sitemap](${SITE_URL}/sitemap.xml)`, "");
  return out.join("\n");
}

function buildLlmsFullTxt(posts, reports) {
  const parts = [SITE_SUMMARY];
  for (const area of AREAS) {
    const rep = reports.find((r) => r.area.slug === area.slug);
    const inArea = posts.filter((p) => p.areas[0] === area.slug);
    if (!rep && !inArea.length) continue;
    parts.push(`# AREA: ${area.name}${AREA_INTROS[area.slug] ? `\n\n${AREA_INTROS[area.slug]}\n\nArea guide: ${SITE_URL}/areas/${area.slug}/` : ""}`);
    if (rep) parts.push(buildReportMarkdown(rep));
    for (const t of TOPICS) {
      inArea.filter((p) => p.topic === t.slug).sort(byDateDesc).forEach((p) => parts.push(buildPostMarkdown(p)));
    }
  }
  return parts.join("\n\n* * *\n\n") + "\n";
}

// ---------- sitemap ----------

const MANAGED = [/^\/blog\//, /^\/areas\//, /^\/market-reports\//];

function buildSitemap(entries) {
  // Keep hand maintained entries (home, about, services, ...) exactly as listed.
  const existing = fs.existsSync(SITEMAP_PATH) ? fs.readFileSync(SITEMAP_PATH, "utf8") : "";
  const tag = (block, name) => (block.match(new RegExp(`<${name}>(.*?)</${name}>`)) || [])[1];
  const kept = (existing.match(/<url>[\s\S]*?<\/url>/g) || [])
    .map((block) => ({ path: (tag(block, "loc") || "").replace(SITE_URL, ""), lastmod: tag(block, "lastmod"), changefreq: tag(block, "changefreq"), priority: tag(block, "priority") }))
    .filter((e) => e.path && !MANAGED.some((re) => re.test(e.path)));
  const all = [...kept, ...entries.filter((e) => !kept.some((k) => k.path === e.path))];
  const xml = all.map((e) => `  <url>
    <loc>${SITE_URL}${e.path}</loc>
${e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : ""}${e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>\n` : ""}${e.priority ? `    <priority>${e.priority}</priority>\n` : ""}  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xml.join("\n")}\n</urlset>\n`;
}

// ---------- main ----------

function main() {
  const posts = loadPosts().map(cleanPost).map(classifyPost).filter((p) => p.slug);
  const sitemap = [];

  // Posts
  let created = 0;
  for (const post of posts) {
    const dir = path.join(BLOG_DIR, post.slug);
    if (!fs.existsSync(path.join(dir, "index.html"))) { created++; console.log(`Created page: blog/${post.slug}/index.html`); }
    writeFile(`blog/${post.slug}/index.html`, buildPostHtml(post, posts));
    writeFile(`blog/${post.slug}/index.md`, buildPostMarkdown(post));
    sitemap.push({ path: postUrl(post), lastmod: lastmodOf(post), changefreq: "monthly", priority: post.topic === "market-reports" ? "0.5" : "0.6" });
  }
  console.log(`Rebuilt ${posts.length} post pages (${created} new).`);

  // Blog home + filter pages
  writeFile("blog/index.html", buildListingPage({
    posts, allPosts: posts, fixed: "", title: "Eastside Real Estate Blog | Neighborhood Guides & Market Updates",
    h1: "Blog", intro: `Neighborhood guides, market updates, and local insight for buyers and sellers across ${listNames(HUB_AREAS)}. Filter by area and topic, or search.`,
    pathName: "/blog/", crumbs: [{ name: "Home", path: "/" }, { name: "Blog", path: "/blog/" }],
  }));
  sitemap.push({ path: "/blog/", lastmod: maxDate(posts.map(lastmodOf)), changefreq: "weekly", priority: "0.7" });
  for (const t of TOPICS) {
    const list = posts.filter((p) => p.topic === t.slug);
    if (!list.length) continue;
    const p = `/blog/topic/${t.slug}/`;
    writeFile(`blog/topic/${t.slug}/index.html`, buildListingPage({
      posts: list, allPosts: posts, fixed: "topic", topic: t.slug, title: `${t.name}: Eastside Real Estate Posts | Jack Macdonald`,
      h1: t.name, intro: `Every ${t.name.toLowerCase()} post for the Eastside, newest first. Narrow it down by area or search.`,
      pathName: p, crumbs: [{ name: "Home", path: "/" }, { name: "Blog", path: "/blog/" }, { name: t.name, path: p }],
    }));
    sitemap.push({ path: p, lastmod: maxDate(list.map(lastmodOf)), changefreq: "weekly", priority: "0.5" });
  }
  for (const a of AREAS) {
    const list = posts.filter((p) => p.areas.includes(a.slug));
    if (!list.length) continue;
    const p = `/blog/area/${a.slug}/`;
    writeFile(`blog/area/${a.slug}/index.html`, buildListingPage({
      posts: list, allPosts: posts, fixed: "area", area: a.slug, title: `${a.name} Real Estate Blog: Guides & Market Updates | Jack Macdonald`,
      h1: `${a.name} posts`, intro: `Everything I've written about ${a.name === "Eastside" ? "the Eastside as a whole" : a.name}, newest first.${a.hub ? ` For listings and the latest numbers, see the <a href="/areas/${a.slug}/">${escapeHtml(a.name)} area guide</a>.` : ""}`,
      pathName: p, crumbs: [{ name: "Home", path: "/" }, { name: "Blog", path: "/blog/" }, { name: a.name, path: p }],
    }));
    sitemap.push({ path: p, lastmod: maxDate(list.map(lastmodOf)), changefreq: "weekly", priority: "0.5" });
  }

  // Market reports
  const reports = REPORT_AREAS.map((a) => reportFor(a.slug)).filter(Boolean);
  for (const r of reports) {
    writeFile(`market-reports/${r.area.slug}/index.html`, buildReportPage(r, posts));
    writeFile(`market-reports/${r.area.slug}/index.md`, buildReportMarkdown(r));
    sitemap.push({ path: r.path, lastmod: r.info.updatedDate, changefreq: "monthly", priority: "0.8" });
  }
  if (reports.length) {
    writeFile("market-reports/index.html", buildReportsIndex(reports));
    sitemap.push({ path: "/market-reports/", lastmod: maxDate(reports.map((r) => r.info.updatedDate)), changefreq: "monthly", priority: "0.8" });
  }
  console.log(`Rebuilt ${reports.length} market reports.`);

  // Area hubs (lastmod follows content, not the twice daily listings refresh)
  for (const a of HUB_AREAS) {
    writeFile(`areas/${a.slug}/index.html`, buildHub(a, posts));
    const rep = reportFor(a.slug);
    sitemap.push({ path: `/areas/${a.slug}/`, lastmod: maxDate([...posts.filter((p) => p.areas.includes(a.slug)).map(lastmodOf), rep && rep.info.updatedDate]), changefreq: "weekly", priority: "0.8" });
  }
  writeFile("areas/index.html", buildAreasIndex(posts));
  sitemap.push({ path: "/areas/", lastmod: maxDate(sitemap.filter((e) => e.path.startsWith("/areas/")).map((e) => e.lastmod)), changefreq: "weekly", priority: "0.8" });
  console.log(`Rebuilt ${HUB_AREAS.length} area hubs.`);

  fs.writeFileSync(SITEMAP_PATH, buildSitemap(sitemap));
  fs.writeFileSync(path.join(ROOT, "llms.txt"), buildLlmsTxt(posts, reports));
  fs.writeFileSync(path.join(ROOT, "llms-full.txt"), buildLlmsFullTxt(posts, reports));
  console.log("Rebuilt sitemap.xml, llms.txt and llms-full.txt.");
}

main();
