// Downloads Redfin Data Center city level data and keeps only the cities we
// report on. Writes auto-blog-system/content/market-data.json.
//
// Source: https://www.redfin.com/news/data-center/ (free, credit Redfin).
// Redfin moved its downloads in mid 2026: the old redfin_market_tracker/*.tsv000.gz
// files stopped updating on 2026-06-02. The current city file is a ~2 GB CSV, so
// it is streamed line by line and never held in memory.
//
// For cities, Redfin now publishes ROLLING 3 MONTH windows (e.g. Jun 1 to Aug 31),
// not single months. If a monthly series ever appears in the file, it is preferred.
//
// Local testing: REDFIN_CSV_FILE=/path/to/extract.csv node fetch-market-data.js

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { Readable } = require("stream");
const { AREAS } = require("./taxonomy");

const SOURCE_URL = "https://redfin-public-data.s3.us-west-2.amazonaws.com/redfin_data_center/property_types/monthly/all_cities.csv";
const OUT_PATH = path.join(__dirname, "..", "content", "market-data.json");
const KEEP_PERIODS = 40;
const PROPERTY_TYPES = { "Single Family Residential": "sfr", "Condo/Co-op": "condo", Townhouse: "townhouse" };

const REPORT_AREAS = AREAS.filter((a) => a.report);
const REGION_NAMES = new Set(REPORT_AREAS.map((a) => a.redfin));

function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function num(v) {
  if (v === undefined || v === null || v === "" || v === "NA") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function openStream() {
  if (process.env.REDFIN_CSV_FILE) return fs.createReadStream(process.env.REDFIN_CSV_FILE);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SOURCE_URL);
      if (!res.ok) throw new Error(`Redfin download returned ${res.status}`);
      return Readable.fromWeb(res.body);
    } catch (err) {
      lastErr = err;
      console.error(`Download attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, attempt * 20000));
    }
  }
  throw lastErr;
}

async function main() {
  const stream = await openStream();
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  const rows = [];
  let lastUpdated = null;
  for await (const line of rl) {
    if (!header) { header = parseCsvLine(line); continue; }
    // Cheap substring filter first; the file has millions of rows.
    let hit = false;
    for (const name of REGION_NAMES) if (line.includes(`"${name}"`)) { hit = true; break; }
    if (!hit) continue;
    const cells = parseCsvLine(line);
    const r = {};
    header.forEach((h, i) => { r[h] = cells[i]; });
    if (r["REGION TYPE"] !== "City" || !REGION_NAMES.has(r["REGION NAME"])) continue;
    if (String(r["IS SEASONALLY ADJUSTED"]).toLowerCase() !== "false") continue;
    if (!PROPERTY_TYPES[r["PROPERTY TYPE"]]) continue;
    rows.push(r);
    if (!lastUpdated || r["LAST UPDATED"] > lastUpdated) lastUpdated = r["LAST UPDATED"];
  }
  if (!header) throw new Error("Redfin file was empty");
  for (const col of ["PERIOD END", "REGION NAME", "MEDIAN SALE PRICE NSA ($)", "HOMES SOLD"]) {
    if (!header.includes(col)) throw new Error(`Redfin file format changed: column "${col}" is missing`);
  }

  const areas = {};
  for (const area of REPORT_AREAS) {
    const mine = rows.filter((r) => r["REGION NAME"] === area.redfin);
    const freqs = new Set(mine.map((r) => r.FREQUENCY));
    const frequency = freqs.has("Monthly") ? "Monthly" : "Rolling 3 Months";
    const series = {};
    for (const [label, key] of Object.entries(PROPERTY_TYPES)) {
      const list = mine
        .filter((r) => r["PROPERTY TYPE"] === label && r.FREQUENCY === frequency)
        .map((r) => ({
          begin: r["PERIOD BEGIN"],
          end: r["PERIOD END"],
          homesSold: num(r["HOMES SOLD"]),
          medianSalePrice: num(r["MEDIAN SALE PRICE NSA ($)"]),
          medianDom: num(r["MEDIAN DAYS ON MARKET (DAYS)"]),
          saleToList: num(r["AVERAGE SALE TO LIST RATIO (%)"]),
          soldAboveList: num(r["SHARE SOLD ABOVE ORIGINAL LIST (%)"]),
          monthsOfSupply: num(r["MONTHS OF SUPPLY"]),
          newListings: num(r["NEW LISTINGS"]),
          inventory: num(r["INVENTORY"]),
          medianPpsf: num(r["MEDIAN SALE PRICE PER SQ.FT. ($)"]),
        }))
        .sort((a, b) => a.end.localeCompare(b.end));
      // De-duplicate periods, keep the most recent window list.
      const byEnd = new Map(list.map((p) => [p.end, p]));
      const uniq = [...byEnd.values()].slice(-KEEP_PERIODS);
      if (uniq.length) series[key] = uniq;
    }
    areas[area.slug] = { name: area.name, region: area.redfin, frequency, series };
    const sfr = series.sfr || [];
    console.log(`${area.name}: ${frequency}, ${sfr.length} single family periods, latest ${sfr.length ? sfr[sfr.length - 1].end : "none"}`);
  }

  const out = {
    source: "Redfin Data Center",
    sourceUrl: "https://www.redfin.com/news/data-center/",
    downloadUrl: SOURCE_URL,
    redfinLastUpdated: lastUpdated,
    fetchedAt: new Date().toISOString(),
    areas,
  };
  if (!REPORT_AREAS.every((a) => (areas[a.slug].series.sfr || []).length)) {
    throw new Error("Some report areas have no single family data; keeping the previous market-data.json");
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Market data fetch failed:", err.message);
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `REPORT_FAILED=true\nFAILURE_REASON=The Redfin data download failed (${String(err.message).replace(/[\r\n]+/g, " ")}). Last month's reports stay up. The backup run on the 12th tries again.\n`);
  }
  process.exit(1);
});
