// Monthly market reports. Runs after fetch-market-data.js.
//
// When Redfin has released a newer data window than the one last published:
//   1. writes the plain English copy for each area's evergreen report
//      (/market-reports/{area}/) in Jack's voice,
//   2. FACT CHECK: every number in that copy must match the Redfin data exactly,
//      otherwise the AI copy is thrown out and the number safe template is used,
//   3. publishes ONE combined "Eastside Market Update: {Month Year}" post per
//      calendar month covering every report area, linking to each evergreen page,
//   4. records what happened for the "New post published" email.
// If Redfin hasn't released anything new, nothing changes and no email is sent.

const fs = require("fs");
const path = require("path");
const { loadPosts, savePosts } = require("./posts-data");
const { cleanText } = require("./no-dashes");
const { AREAS } = require("./taxonomy");
const M = require("./market-reports");

const CONTENT = path.join(__dirname, "..", "content");
const DATA_PATH = path.join(CONTENT, "market-data.json");
const STATE_PATH = path.join(CONTENT, "market-reports-state.json");
const SITE_URL = "https://jackmacdonaldre.com";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";

function setEnv(name, value) {
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${String(value).replace(/[\r\n]+/g, " ")}\n`);
}

const VOICE =
  "You write for Jack Macdonald, a Bellevue native and REALTOR with Macdonald Group of Compass. His voice: grounded, specific, plainspoken, " +
  "like explaining the market to a client across the kitchen table. No hype, no cliches (no 'hot market', 'navigate', 'dream home', 'in today's market'), " +
  "no sales pitch, no call to action. Never use any dash character (no hyphen, en dash or em dash); write 'single family', '3 month'.";

function factsFor(s) {
  const f = {
    area: s.areaName,
    window: M.windowLabel(s.cur),
    note: "Rolling 3 month window of single family home sales from Redfin. Do not call it a single month.",
    median_sale_price: M.fmt.moneyShort(s.cur.medianSalePrice),
    homes_sold: s.cur.homesSold,
    median_days_on_market: s.cur.medianDom,
    average_sale_to_list_percent: s.cur.saleToList != null ? M.fmt.pct1(s.cur.saleToList) : null,
    months_of_supply: s.cur.monthsOfSupply != null ? M.fmt.months(s.cur.monthsOfSupply) : null,
    small_market: s.small,
  };
  if (s.yearAgo) {
    f.same_window_last_year = {
      median_sale_price: s.yearAgo.medianSalePrice != null ? M.fmt.moneyShort(s.yearAgo.medianSalePrice) : null,
      homes_sold: s.yearAgo.homesSold,
      median_days_on_market: s.yearAgo.medianDom,
      months_of_supply: s.yearAgo.monthsOfSupply != null ? M.fmt.months(s.yearAgo.monthsOfSupply) : null,
    };
    if (s.priceYoY != null) f.median_price_change_vs_last_year = (s.priceYoY >= 0 ? "up " : "down ") + M.fmt.pct1(Math.abs(s.priceYoY));
    if (s.soldYoY != null) f.homes_sold_change_vs_last_year = (s.soldYoY >= 0 ? "up " : "down ") + M.fmt.pct1(Math.abs(s.soldYoY));
  }
  return f;
}

async function aiCommentary(s) {
  if (!API_KEY) return null;
  const prompt =
    "Write three short pieces of copy for this area's monthly market report, from these facts ONLY:\n" +
    JSON.stringify(factsFor(s), null, 1) +
    "\n\nRules: use only numbers that appear in the facts, written exactly as given (you may leave numbers out). Do not compute new numbers, do not round differently, " +
    "do not mention any statistic that isn't in the facts. If small_market is true or homes_sold is under 10, say the numbers can swing a lot and avoid calling anything a trend.\n" +
    "Return ONLY JSON: {\"summary\": \"2 to 3 sentences, plain English, the headline numbers first\", " +
    "\"selling\": \"2 to 4 sentences: what this means if you're selling here now\", \"buying\": \"2 to 4 sentences: what this means if you're buying here now\"}";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: VOICE, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  if (!parsed.summary || !parsed.selling || !parsed.buying) throw new Error("incomplete copy");
  return { summary: cleanText(parsed.summary), selling: cleanText(parsed.selling), buying: cleanText(parsed.buying), method: "ai" };
}

// Fact check: AI copy is only used if every number in it matches the data.
async function commentaryFor(s) {
  const allowed = M.allowedNumbers(s);
  try {
    const ai = await aiCommentary(s);
    if (ai) {
      const bad = M.unverifiedNumbers(`${ai.summary} ${ai.selling} ${ai.buying}`, allowed);
      if (!bad.length) return { ...ai, numbersChecked: (`${ai.summary} ${ai.selling} ${ai.buying}`.match(/\d[\d,]*(\.\d+)?/g) || []).length };
      console.error(`${s.areaName}: AI copy had numbers not in the Redfin data (${bad.join(", ")}). Using the template instead.`);
    }
  } catch (err) {
    console.error(`${s.areaName}: AI copy failed (${err.message}). Using the template instead.`);
  }
  const t = M.templateCommentary(s);
  const bad = M.unverifiedNumbers(`${t.summary} ${t.selling} ${t.buying}`, allowed);
  if (bad.length) throw new Error(`Template produced unverified numbers for ${s.areaName}: ${bad.join(", ")}`);
  return { ...t, numbersChecked: (`${t.summary} ${t.selling} ${t.buying}`.match(/\d[\d,]*(\.\d+)?/g) || []).length };
}

// One combined post for all report areas, once per calendar month.
function buildCombinedPost(entries, monthLabel, today) {
  const slug = `eastside-market-update-${monthLabel.toLowerCase().replace(/\s+/g, "-")}`;
  const w = M.windowLabel(entries[0].s.cur);
  const sections = entries.map(({ area, s, commentary }) => {
    const items = [];
    if (s.cur.medianSalePrice != null) items.push(`<li>Median sale price: ${M.fmt.money(s.cur.medianSalePrice)}${s.yearAgo && s.yearAgo.medianSalePrice != null ? ` (same months last year: ${M.fmt.money(s.yearAgo.medianSalePrice)})` : ""}</li>`);
    if (s.cur.homesSold != null) items.push(`<li>Homes sold: ${M.fmt.int(s.cur.homesSold)}${s.yearAgo && s.yearAgo.homesSold != null ? ` (last year: ${M.fmt.int(s.yearAgo.homesSold)})` : ""}</li>`);
    if (s.cur.medianDom != null) items.push(`<li>Median days on market: ${M.fmt.int(s.cur.medianDom)}</li>`);
    if (s.cur.saleToList != null) items.push(`<li>Average sale to list price: ${M.fmt.pct1(s.cur.saleToList)}</li>`);
    if (s.cur.monthsOfSupply != null) items.push(`<li>Months of supply: ${M.fmt.months(s.cur.monthsOfSupply)}</li>`);
    return `<h2>${area.name}</h2>\n<p>${commentary.summary}</p>\n<ul>\n${items.join("\n")}\n</ul>\n` +
      `<p><a href="/market-reports/${area.slug}/">Full ${area.name} market report</a>, with the trend chart and what it means if you're buying or selling.</p>`;
  });
  const names = entries.map((e) => e.area.name);
  const bodyHtml =
    `<p>Here's where the ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} housing markets stand for ${w}. Every number below is for single family homes over a rolling 3 month window, from the Redfin Data Center.</p>\n` +
    sections.join("\n");
  const faq = [];
  const priced = entries.filter((e) => e.s.cur.medianSalePrice != null);
  if (priced.length) faq.push({ q: `What are median home prices on the Eastside right now?`, a: `For single family homes sold ${w}, according to Redfin Data Center figures: ${priced.map((e) => `${e.area.name} ${M.fmt.money(e.s.cur.medianSalePrice)}`).join("; ")}.` });
  const supply = entries.filter((e) => e.s.cur.monthsOfSupply != null);
  if (supply.length) faq.push({ q: `Is the Eastside a buyer's or seller's market?`, a: `It depends on the city. Months of supply for ${w}: ${supply.map((e) => `${e.area.name} ${M.fmt.months(e.s.cur.monthsOfSupply)}`).join("; ")}. Under about 4 months still leans toward sellers, but pricing and condition decide how any one home does.` });
  return {
    id: `post-${Date.now()}-eastside-market`,
    slug,
    title: `Eastside Market Update: ${monthLabel}`,
    metaDescription: cleanText(`Eastside housing market for ${w}: median sale price, homes sold and days on market in ${names.join(", ")}, with links to each city's full report.`),
    city: "Eastside",
    topic: "market-reports",
    areas: ["eastside", ...entries.map((e) => e.area.slug)],
    publishedDate: today,
    bodyHtml: bodyHtml + `\n<!-- FACT CHECK ${today}: every number checked against Redfin Data Center data for ${w}. -->`,
    faq,
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : { areas: {} };
  const today = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
  const monthLabel = M.monthYear(today);
  const monthKey = today.slice(0, 7);

  const reportAreas = AREAS.filter((a) => a.report);
  const stats = reportAreas.map((a) => ({ area: a, s: M.computeStats(a.slug, data.areas[a.slug]) })).filter((x) => x.s);
  const dataEnd = stats.map((x) => x.s.cur.end).sort().pop();

  if (state.dataEnd === dataEnd && !process.env.FORCE_REPORTS) {
    console.log(`No new Redfin data (latest window still ends ${dataEnd}). Reports unchanged.`);
    return;
  }

  let posts = loadPosts();
  const newPosts = [];
  const checks = [];
  const entries = [];
  for (const { area, s } of stats) {
    const commentary = await commentaryFor(s);
    checks.push(`${area.name}: ${commentary.numbersChecked} numbers verified (${commentary.method === "ai" ? "AI copy" : "template copy"})`);
    state.areas[area.slug] = {
      title: `${area.name} Home Values & Market Report | Updated ${monthLabel}`,
      updatedDate: today,
      updatedMonth: monthLabel,
      dataEnd: s.cur.end,
      window: M.windowLabel(s.cur),
      commentary: { summary: commentary.summary, selling: commentary.selling, buying: commentary.buying, method: commentary.method },
    };
    entries.push({ area, s, commentary });
  }
  // One combined Eastside post per calendar month.
  const post = buildCombinedPost(entries, monthLabel, today);
  if (!posts.some((p) => p.slug === post.slug)) {
    posts = [post, ...posts];
    newPosts.push(post);
  }
  state.dataEnd = dataEnd;
  state.redfinLastUpdated = data.redfinLastUpdated;
  state.lastRun = today;
  state.lastPostsMonth = newPosts.length ? monthKey : state.lastPostsMonth;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
  if (newPosts.length) savePosts(posts);

  console.log(`Market reports updated with Redfin data through ${dataEnd}.`);
  checks.forEach((c) => console.log(" * " + c));
  newPosts.forEach((p) => console.log(` + ${p.title}: ${SITE_URL}/blog/${p.slug}/`));

  setEnv("NOTIFY_KIND", "market-reports");
  setEnv("NEW_POST_TITLE", newPosts.length ? newPosts[0].title : `Market reports refreshed (${monthLabel})`);
  setEnv("NEW_POST_URL", `${SITE_URL}/market-reports/`);
  setEnv("NEW_POSTS_LIST", newPosts.map((p) => `${p.title}|${SITE_URL}/blog/${p.slug}/`).join(";;"));
  setEnv("FACT_CHECK_SUMMARY", `Fact checked against Redfin Data Center data for the window ending ${dataEnd}: ${checks.join("; ")}.`);
}

main().catch((err) => {
  console.error("Market report publishing failed:", err);
  setEnv("REPORT_FAILED", "true");
  setEnv("FAILURE_REASON", `The monthly market reports could not be published (${err.message}). Last month's reports stay up.`);
  process.exit(1);
});
