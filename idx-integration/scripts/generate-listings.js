const fs = require('fs');
const path = require('path');
const { attributionFor } = require('./attribution');

const IDX_ACCESS_KEY = process.env.IDX_ACCESS_KEY;
const OUT_FILE = path.join(__dirname, '..', 'data', 'active-listings.json');
const EXCLUDED_LISTING_IDS = ['2577547'];

if (!IDX_ACCESS_KEY) {
  console.error("Missing IDX_ACCESS_KEY environment variable.");
  process.exit(1);
}

// Retries a couple of times so one bad response from IDX Broker doesn't skip a refresh.
async function fetchFeatured() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch("https://api.idxbroker.com/clients/featured", {
        method: "GET",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "accesskey": IDX_ACCESS_KEY,
          "outputtype": "json",
        },
      });
      if (response.status === 200) return response.json();
      lastError = new Error("IDX API returned status " + response.status + ": " + (await response.text()).slice(0, 200));
    } catch (err) {
      lastError = err;
    }
    console.error("Attempt " + attempt + " failed: " + lastError.message);
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 15000));
  }
  throw lastError;
}

(async () => {
  let raw;
  try {
    raw = await fetchFeatured();
  } catch (err) {
    // Leave the last good file in place so the site never shows an empty list.
    console.error("Could not refresh active listings, keeping the previous file:", err.message);
    process.exit(1);
  }

  let listings = [];
  if (raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    listings = Object.values(raw.data);
  } else if (Array.isArray(raw)) {
    listings = raw;
  } else if (raw && typeof raw === 'object') {
    listings = Object.values(raw);
  }

  listings = listings.filter((l) =>
    (l.propSubType || '').toString().toLowerCase().indexOf('manufactured') === -1 &&
    EXCLUDED_LISTING_IDS.indexOf(String(l.listingID)) === -1
  );
  listings.forEach((l) => { l.attribution = attributionFor(l); });
  listings.sort((a, b) => (Number(b.listingPrice) || 0) - (Number(a.listingPrice) || 0));

  const output = {
    generatedAt: new Date().toISOString(),
    count: listings.length,
    listings: listings,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log("Wrote", listings.length, "listings to idx-integration/data/active-listings.json");
})();
