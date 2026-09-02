const fs = require('fs');
const path = require('path');

const IDX_ACCESS_KEY = process.env.IDX_ACCESS_KEY;

if (!IDX_ACCESS_KEY) {
  console.error("Missing IDX_ACCESS_KEY environment variable.");
  process.exit(1);
}

const TEAM_AGENT_IDS = ['1186410', '121277198'];

(async () => {
  const response = await fetch("https://api.idxbroker.com/clients/soldpending", {
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

 listings = listings.filter(l => {
   var status = (l.propStatus || l.idxStatus || '').toString().toLowerCase();
   var agentMatch = TEAM_AGENT_IDS.indexOf(String(l.listingAgentID)) !== -1;
   return status.indexOf('sold') !== -1 && agentMatch;
 });

 listings.sort((a, b) => {
   var da = new Date(a.pendingDate || a.closeDate || a.soldDate || a.dateAdded || 0).getTime();
   var db = new Date(b.pendingDate || b.closeDate || b.soldDate || b.dateAdded || 0).getTime();
   return db - da;
 });

 const output = {
   generatedAt: new Date().toISOString(),
   count: listings.length,
   listings: listings,
 };

 const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sold-listings.json'), JSON.stringify(output, null, 2));

 console.log("Wrote", listings.length, "sold listings to idx-integration/data/sold-listings.json");
})();
