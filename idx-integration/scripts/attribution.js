// Adds an "attribution" block to each IDX listing: the listing firm and, when
// known, the listing broker's name and phone. Every card on the site shows it.
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'listing-attribution.json'), 'utf8'));

function attributionFor(listing) {
  const firm = CONFIG.offices[String(listing.listingOfficeID)] || null;
  const agent = CONFIG.agents[String(listing.listingAgentID)] || {};
  return { firm, agentName: agent.name || null, agentPhone: agent.phone || null };
}

function attributionText(a) {
  if (!a || !a.firm) return 'Listing courtesy of the listing brokerage via NWMLS';
  const who = a.agentName ? `${a.agentName}, ${a.firm}` : a.firm;
  return `Listing courtesy of ${who}${a.agentPhone ? ` (${a.agentPhone})` : ''}`;
}

module.exports = { attributionFor, attributionText };
