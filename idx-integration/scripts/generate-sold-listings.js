const fs = require('fs');
const path = require('path');

const IDX_ACCESS_KEY = process.env.IDX_ACCESS_KEY;

if (!IDX_ACCESS_KEY) {
  console.error("Missing IDX_ACCESS_KEY environment variable.");
  process.exit(1);
}

const TEAM_AGENT_IDS = ['1186410', '121277198'];
const CHUNK_HOURS = 720;
const CHUNK_COUNT = 60;
const NOTABLE_HOUSE_NUMBERS = ['16434', '3654', '500', '11710', '20040', '2208', '13246', '7112', '8601', '1830', '7930', '4445', '7860', '11631', '16920', '8245'];

function pad(v) {
  return String(v).padStart(2, '0');
}

function formatDate(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + '+' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}

async function fetchChunk(startDatetime) {
  var url = "https://api.idxbroker.com/clients/soldpending?interval=" + CHUNK_HOURS + "&startDatetime=" + startDatetime + "&dateType=dateAdded";
  var response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "accesskey": IDX_ACCESS_KEY,
      "outputtype": "json",
    },
  });
  if (response.status === 204) {
    return [];
  }
  if (response.status !== 200) {
    console.error("IDX API returned status", response.status, "for", startDatetime);
    return [];
  }
  var raw = await response.json();
  var listings = [];
  if (raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    listings = Object.values(raw.data);
  } else if (Array.isArray(raw)) {
    listings = raw;
  }
  return listings;
}

(async () => {
  var allListings = [];
  var seenIds = {};
  var cursor = new Date();

 for (var i = 0; i < CHUNK_COUNT; i++) {
   var startDatetime = formatDate(cursor);
   var chunkListings = await fetchChunk(startDatetime);
   chunkListings.forEach(function (l) {
     var key = (l.idxID || '') + '!' + (l.listingID || l.listingId || JSON.stringify(l).slice(0, 40));
     if (!seenIds[key]) {
       seenIds[key] = true;
       allListings.push(l);
     }
   });
   cursor = new Date(cursor.getTime() - CHUNK_HOURS * 60 * 60 * 1000);
 }

 var listings = allListings.filter(function (l) {
   var status = (l.propStatus || l.idxStatus || '').toString().toLowerCase();
   var agentMatch = TEAM_AGENT_IDS.indexOf(String(l.listingAgentID)) !== -1;
   var houseNum = ((l.address || l.displayAddress || '').match(/^\d+/) || [''])[0]; var addressMatch = NOTABLE_HOUSE_NUMBERS.indexOf(houseNum) !== -1; return status.indexOf('sold') !== -1 && (agentMatch || addressMatch);
 });

 listings.sort(function (a, b) {
   var da = new Date(a.pendingDate || a.closeDate || a.soldDate || a.dateAdded || 0).getTime();
   var db = new Date(b.pendingDate || b.closeDate || b.soldDate || b.dateAdded || 0).getTime();
   return db - da;
 });

 var output = {
   generatedAt: new Date().toISOString(),
   count: listings.length,
   listings: listings,
 };

 var outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'sold-listings.json'), JSON.stringify(output, null, 2));

 console.log("Wrote", listings.length, "sold listings to idx-integration/data/sold-listings.json");
})();
