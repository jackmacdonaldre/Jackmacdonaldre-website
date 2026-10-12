// One-off lookup (temporary branch): who are the listing agent IDs in the featured feed?
// Prints, for each agent ID, the "courtesy of" / agent lines from one IDX Broker detail page,
// plus the agents list on the IDX Broker account.
const KEY = process.env.IDX_ACCESS_KEY;
const H = { "Content-Type": "application/x-www-form-urlencoded", accesskey: KEY, outputtype: "json" };
(async () => {
  const agents = await fetch("https://api.idxbroker.com/clients/agents", { headers: H });
  console.log("clients/agents status", agents.status);
  try {
    const a = await agents.json();
    const list = a && a.agent ? a.agent : Object.values(a || {});
    (Array.isArray(list) ? list : []).forEach((x) => console.log("ACCOUNT AGENT", JSON.stringify({ agentID: x.agentID, listingAgentID: x.listingAgentID, name: [x.agentFirstName, x.agentLastName].join(" "), phone: x.agentContactPhone1 || x.agentPhone1, email: x.agentEmail })));
  } catch (e) { console.log("agents parse error", e.message); }

  const res = await fetch("https://api.idxbroker.com/clients/featured", { headers: H });
  const raw = await res.json();
  const listings = raw && raw.data ? Object.values(raw.data) : Array.isArray(raw) ? raw : Object.values(raw || {});
  const seen = {};
  for (const l of listings) {
    const id = String(l.listingAgentID);
    if (seen[id]) continue;
    seen[id] = true;
    console.log(`\n=== agent ${id} office ${l.listingOfficeID} | ${l.address}, ${l.cityName} | ${l.fullDetailsURL}`);
    try {
      const html = await (await fetch(l.fullDetailsURL, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const hits = text.match(/.{0,80}(courtesy|Listing Agent|Listed by|Listing Office|Agent Name).{0,120}/gi) || [];
      [...new Set(hits)].slice(0, 6).forEach((h) => console.log("  ", h.trim()));
      if (!hits.length) console.log("   (no courtesy text found; page length " + html.length + ")");
    } catch (e) { console.log("   fetch failed", e.message); }
  }
})();
