const fs = require('fs');
const path = require('path');

const IDX_ACCESS_KEY = process.env.IDX_ACCESS_KEY;

if (!IDX_ACCESS_KEY) {
  console.error("Missing IDX_ACCESS_KEY environment variable.");
    process.exit(1);
    }

    (async () => {
    const response = await fetch("https://api.idxbroker.com/clients/featured", {
    method: "GET",
    headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "accesskey": IDX_ACCESS_KEY,
    "outputtype": "json",
    },
    });

    if (response.status !== 200) {
    console.error("IDX API returned status", response.status);
    process.exit(1);
    }

    const raw = await response.json();

    let listings = [];
    if (raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    listings = Object.values(raw.data);
    } else if (Array.isArray(raw)) {
    listings = raw;
    }

    listings.sort((a, b) => (Number(b.listingPrice) || 0) - (Number(a.listingPrice) || 0));

    const output = {
    generatedAt: new Date().toISOString(),
    count: listings.length,
    listings: listings,
    };

    const outDir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'active-listings.json'), JSON.stringify(output, null, 2));

    console.log("Wrote", listings.length, "listings to idx-integration/data/active-listings.json");
    })();
    
