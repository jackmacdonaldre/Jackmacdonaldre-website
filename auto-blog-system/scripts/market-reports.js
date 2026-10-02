// Market report math and wording. Every number on a report page comes from
// auto-blog-system/content/market-data.json (Redfin Data Center). Nothing here
// estimates or fills in a missing value: if Redfin has no number, the row or
// sentence is left out.

const SMALL_MARKETS = new Set(["north-bend", "fall-city"]);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthName(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  return { month: MONTHS[m - 1], year: y };
}

// "June to August 2026" or "November 2025 to January 2026"
function windowLabel(p) {
  const a = monthName(p.begin), b = monthName(p.end);
  if (a.month === b.month && a.year === b.year) return `${b.month} ${b.year}`;
  return a.year === b.year ? `${a.month} to ${b.month} ${b.year}` : `${a.month} ${a.year} to ${b.month} ${b.year}`;
}
function shortWindowLabel(p) {
  const a = monthName(p.begin), b = monthName(p.end);
  const s = (x) => x.month.slice(0, 3);
  return a.year === b.year ? `${s(a)} to ${s(b)} ${b.year}` : `${s(a)} ${a.year} to ${s(b)} ${b.year}`;
}
function monthYear(date) {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00Z`) : date;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// The window ending N months before `end` (rolling windows end on month ends).
function shiftEnd(end, months) {
  const [y, m] = end.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - months + 1, 0)); // last day of target month
  return d.toISOString().slice(0, 10);
}

const fmt = {
  money: (n) => "$" + Math.round(n).toLocaleString("en-US"),
  moneyShort: (n) => (n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + " million" : "$" + Math.round(n / 1000).toLocaleString("en-US") + ",000"),
  int: (n) => Math.round(n).toLocaleString("en-US"),
  pct1: (n) => n.toFixed(1) + "%",
  months: (n) => n.toFixed(1),
};

function pctChange(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}

// Pulls the latest window plus the comparisons the page shows.
function computeStats(areaSlug, areaData) {
  const series = (areaData.series && areaData.series.sfr) || [];
  if (!series.length) return null;
  const cur = series[series.length - 1];
  const byEnd = new Map(series.map((p) => [p.end, p]));
  const prev = byEnd.get(shiftEnd(cur.end, 1)) || null;
  const yearAgo = byEnd.get(shiftEnd(cur.end, 12)) || null;
  const condo = ((areaData.series && areaData.series.condo) || []).slice(-1)[0];
  const condoCur = condo && condo.end === cur.end && condo.homesSold ? condo : null;
  return {
    areaSlug,
    areaName: areaData.name,
    frequency: areaData.frequency,
    small: SMALL_MARKETS.has(areaSlug),
    cur, prev, yearAgo, condo: condoCur,
    priceYoY: pctChange(cur.medianSalePrice, yearAgo && yearAgo.medianSalePrice),
    priceVsPrev: pctChange(cur.medianSalePrice, prev && prev.medianSalePrice),
    soldYoY: pctChange(cur.homesSold, yearAgo && yearAgo.homesSold),
    domYoY: cur.medianDom != null && yearAgo && yearAgo.medianDom != null ? cur.medianDom - yearAgo.medianDom : null,
    s2lYoY: cur.saleToList != null && yearAgo && yearAgo.saleToList != null ? cur.saleToList - yearAgo.saleToList : null,
    mosYoY: cur.monthsOfSupply != null && yearAgo && yearAgo.monthsOfSupply != null ? cur.monthsOfSupply - yearAgo.monthsOfSupply : null,
    series,
  };
}

// Table rows: only metrics Redfin actually reported for the current window.
function tableRows(s) {
  const defs = [
    { label: "Median sale price", key: "medianSalePrice", f: fmt.money, change: "pct" },
    { label: "Homes sold", key: "homesSold", f: fmt.int, change: "pct" },
    { label: "Median days on market", key: "medianDom", f: (n) => fmt.int(n) + " days", change: "days" },
    { label: "Average sale to list price", key: "saleToList", f: fmt.pct1, change: "pts" },
    { label: "Months of supply", key: "monthsOfSupply", f: fmt.months, change: "abs" },
  ];
  return defs
    .filter((d) => s.cur[d.key] != null)
    .map((d) => {
      const v = (p) => (p && p[d.key] != null ? d.f(p[d.key]) : null);
      let change = null;
      if (s.yearAgo && s.yearAgo[d.key] != null) {
        const a = s.cur[d.key], b = s.yearAgo[d.key];
        // Worded as up/down: the site never shows a dash or minus sign in text.
        const word = (c, text) => (Math.abs(c) < 0.05 ? "No change" : `${c > 0 ? "Up" : "Down"} ${text}`);
        if (d.change === "pct") { const c = pctChange(a, b); if (c != null) change = word(c, Math.abs(c).toFixed(1) + "%"); }
        else if (d.change === "days") { const c = a - b; change = c === 0 ? "No change" : word(c, fmt.int(Math.abs(c)) + (Math.abs(c) === 1 ? " day" : " days")); }
        else if (d.change === "pts") { const c = a - b; change = word(c, Math.abs(c).toFixed(1) + " pts"); }
        else { const c = a - b; change = word(c, Math.abs(c).toFixed(1)); }
      }
      return { label: d.label, cur: v(s.cur), prev: v(s.prev), yearAgo: v(s.yearAgo), change };
    });
}

function direction(pct, flatBand = 1.5) {
  if (pct == null) return null;
  if (Math.abs(pct) < flatBand) return "flat";
  return pct > 0 ? "up" : "down";
}

function marketType(s) {
  const mos = s.cur.monthsOfSupply;
  if (mos == null) return null;
  if (mos < 2) return "tight";
  if (mos < 4) return "moderate";
  if (mos < 6) return "balanced";
  return "buyer";
}

// ---- Plain English copy built only from the numbers above (fallback and default) ----

function templateCommentary(s) {
  const c = s.cur, w = windowLabel(c);
  const parts = [];
  // Summary
  const thin = c.homesSold != null && (c.homesSold < 10 || (s.yearAgo && s.yearAgo.homesSold != null && s.yearAgo.homesSold < 10));
  let sum = `${s.areaName}'s median single family sale price was ${fmt.moneyShort(c.medianSalePrice)} for ${w}`;
  const pd = thin ? null : direction(s.priceYoY);
  if (pd === "flat") sum += ", about the same as the same months last year.";
  else if (pd) sum += `, ${pd} ${fmt.pct1(Math.abs(s.priceYoY))} from the same months last year.`;
  else sum += ".";
  parts.push(sum);
  const s2 = [];
  if (c.homesSold != null) {
    let t = `${fmt.int(c.homesSold)} single family ${c.homesSold === 1 ? "home" : "homes"} sold`;
    const sd = thin ? null : direction(s.soldYoY, 3);
    if (sd === "up") t += ` (${fmt.pct1(Math.abs(s.soldYoY))} more than a year ago)`;
    else if (sd === "down") t += ` (${fmt.pct1(Math.abs(s.soldYoY))} fewer than a year ago)`;
    s2.push(t);
  }
  if (c.medianDom != null) s2.push(`the median home spent ${fmt.int(c.medianDom)} days on the market`);
  if (s2.length) parts.push(s2.join(", and ").replace(/^./, (m) => m.toUpperCase()) + ".");
  if (thin) parts.push(`With this few sales, one or two homes can swing the median a long way, so read it as a rough guide, not a trend.`);
  else if (s.small) parts.push(`${s.areaName} is a small market, so a few sales can move these numbers a lot.`);
  const summary = parts.join(" ");

  // Selling
  const type = marketType(s);
  const sell = [];
  const buy = [];
  const mos = c.monthsOfSupply != null ? fmt.months(c.monthsOfSupply) : null;
  const s2l = c.saleToList != null ? fmt.pct1(c.saleToList) : null;
  if (type === "tight") {
    sell.push(`With ${mos} months of supply, there still aren't many homes for buyers to choose from, and that works in your favor.`);
    buy.push(`Inventory is thin at ${mos} months of supply, so the good homes don't wait long. Have your financing settled before you start touring, not after.`);
  } else if (type === "moderate") {
    sell.push(`At ${mos} months of supply, buyers have some choice but not a lot. Homes that are prepared and priced right still move; homes priced on hope tend to sit.`);
    const room = s.mosYoY == null ? "" : s.mosYoY > 0.3 ? " That's more choice than a year ago," : s.mosYoY < -0.3 ? " That's less choice than a year ago," : "";
    buy.push(`At ${mos} months of supply you have some room to look.${room ? room + " but" : " Still,"} well priced homes in the best locations draw competition.`);
  } else if (type === "balanced") {
    sell.push(`At ${mos} months of supply, this is closer to a balanced market. Buyers compare, so condition and price have to hold up next to the other homes they toured that weekend.`);
    buy.push(`At ${mos} months of supply you have real choices. Take the time to compare, and use inspection and price to negotiate where it's warranted.`);
  } else if (type === "buyer") {
    sell.push(`With ${mos} months of supply, buyers have the upper hand. The first two weeks matter most, so get the price right at launch instead of chasing the market down.`);
    buy.push(`With ${mos} months of supply, buyers have leverage. Homes that have been sitting are where you'll find the most room to negotiate.`);
  }
  if (s2l) {
    if (c.saleToList >= 100) {
      sell.push(`Sellers averaged ${s2l} of list price, so well priced homes are still getting full price or better.`);
      buy.push(`Homes averaged ${s2l} of list price, so plan on paying at least asking for the ones you really want.`);
    } else if (c.saleToList >= 98) {
      sell.push(`Sellers averaged ${s2l} of list price. Most homes are selling close to asking, which tells me the pricing, not the market, decides the result.`);
      buy.push(`Homes averaged ${s2l} of list price, so there is usually a little room to negotiate, but not much on the best homes.`);
    } else {
      sell.push(`Sellers averaged ${s2l} of list price, so buyers are negotiating. Pricing right from day one protects you from a string of reductions.`);
      buy.push(`Homes averaged ${s2l} of list price, so there is room to negotiate, especially on homes that have been on the market a while.`);
    }
  }
  if (s.domYoY != null && s.yearAgo && Math.abs(s.domYoY) >= 3) {
    sell.push(s.domYoY > 0
      ? `Homes are taking longer to sell than a year ago (${fmt.int(c.medianDom)} days at the median versus ${fmt.int(s.yearAgo.medianDom)}), so build that into your timeline.`
      : `Homes are selling faster than a year ago (${fmt.int(c.medianDom)} days at the median versus ${fmt.int(s.yearAgo.medianDom)}).`);
  }
  if (pd === "down") buy.push(`Prices are softer than a year ago, which is worth knowing when you write an offer.`);
  if (pd === "up") buy.push(`Prices are higher than a year ago, so waiting has not been cheaper lately.`);
  if (!sell.length) sell.push(`The numbers are thin this period, so pricing comes down to the recent sales closest to your home. That's the part I'd go through with you street by street.`);
  if (!buy.length) buy.push(`The numbers are thin this period, so look closely at the recent sales near any home you're considering.`);
  return { summary, selling: sell.join(" "), buying: buy.join(" "), method: "template" };
}

// ---- Number check: every number in AI written copy must come from the data ----

function allowedNumbers(s) {
  const set = new Set();
  const add = (v) => { if (v == null) return; String(v).split(/\s+/).forEach((t) => { const n = normalizeNum(t); if (n) set.add(n); }); };
  const addVal = (n, kind) => {
    if (n == null) return;
    add(fmt.int(n)); add(String(n)); add(n.toFixed(1)); add(n.toFixed(2));
    if (kind === "money") { add(fmt.money(n)); add(fmt.moneyShort(n)); add((n / 1e6).toFixed(1)); add((n / 1e6).toFixed(2)); add(Math.round(n / 1000)); }
  };
  for (const p of [s.cur, s.prev, s.yearAgo, s.condo]) {
    if (!p) continue;
    addVal(p.medianSalePrice, "money"); addVal(p.homesSold); addVal(p.medianDom); addVal(p.saleToList); addVal(p.monthsOfSupply); addVal(p.soldAboveList);
    add(monthName(p.begin).year); add(monthName(p.end).year);
  }
  for (const v of [s.priceYoY, s.priceVsPrev, s.soldYoY, s.domYoY, s.s2lYoY, s.mosYoY]) if (v != null) { addVal(Math.abs(v)); }
  ["3", "12", "1", "2"].forEach((n) => set.add(n)); // "3 month window", "12 months", ordinary small counts
  return set;
}
function normalizeNum(t) {
  const m = String(t).match(/\d[\d,]*(\.\d+)?/);
  if (!m) return null;
  let n = m[0].replace(/,/g, "");
  if (n.includes(".")) n = n.replace(/0+$/, "").replace(/\.$/, "");
  return n;
}
function unverifiedNumbers(text, allowed) {
  return (String(text).match(/\d[\d,]*(\.\d+)?/g) || []).map(normalizeNum).filter((n) => n && !allowed.has(n));
}

module.exports = {
  MONTHS, monthName, monthYear, windowLabel, shortWindowLabel, shiftEnd, fmt, computeStats, tableRows,
  templateCommentary, allowedNumbers, unverifiedNumbers, marketType, direction,
};
