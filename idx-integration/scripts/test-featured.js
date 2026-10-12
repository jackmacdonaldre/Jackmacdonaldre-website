// One-off live check (temporary branch, read only, submits nothing):
// waits for the PR #2 deploy, then confirms the home page buyer's guide form
// is wired to Netlify Forms, and spot-checks a few live URLs.
const BASE = "https://jackmacdonaldre.com";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let html = "";
  for (let i = 0; i < 30; i++) {
    html = await (await fetch(BASE + "/?nocache=" + Date.now())).text();
    if (html.includes("'form-name': 'buyers-guide'")) break;
    console.log("waiting for deploy... attempt", i + 1);
    await sleep(20000);
  }
  const checks = {
    "new submit code deployed (posts form-name=buyers-guide to /)": html.includes("'form-name': 'buyers-guide'") && html.includes("fetch('/', { method: 'POST'"),
    "static buyers-guide form present in served HTML": /<form[^>]*name="buyers-guide"/.test(html),
    "Netlify processed the form (data-netlify attribute stripped at deploy)": /<form[^>]*name="buyers-guide"/.test(html) && !/<form[^>]*name="buyers-guide"[^>]*data-netlify/.test(html),
    "old localStorage-only lead save removed": !html.includes("localStorage.setItem('mgLeads'"),
  };
  const m = html.match(/<form[^>]*name="buyers-guide"[^>]*>[\s\S]{0,300}?<\/form>/);
  console.log("SERVED FORM:", m ? m[0].replace(/\s+/g, " ") : "(none)");
  for (const [k, v] of Object.entries(checks)) console.log(v ? "PASS" : "FAIL", k);
  for (const p of ["/blog/finn-hill-homes-for-sale-neighborhood-overview/", "/blog/bellevue-school-district-guide-for-home-buyers/", "/blog/what-woodinville-living-is-really-like/", "/areas/kirkland/", "/areas/issaquah/", "/market-reports/bellevue/", "/blog/", "/search.html", "/sitemap.xml", "/llms.txt", "/buyers-guide/"]) {
    const r = await fetch(BASE + p, { redirect: "manual" });
    const t = r.status === 200 ? await r.text() : "";
    const title = (t.match(/<title>([^<]*)/) || [])[1] || "";
    let extra = "";
    if (p === "/sitemap.xml") extra = `urls=${(t.match(/<url>/g) || []).length} kirkland_hub=${t.includes("/areas/kirkland/")} report=${t.includes("/market-reports/bellevue/")} eastside_update=${t.includes("eastside-market-update-october-2026")}`;
    if (p === "/llms.txt") extra = `reports=${t.includes("/market-reports/bellevue/")} hubs=${t.includes("/areas/kirkland/")}`;
    if (p === "/areas/issaquah/") extra = (t.match(/Listing courtesy of [^<]*/) || [""])[0];
    if (p === "/search.html") extra = t.includes("idxbroker.com/idx/search") ? "redirects to IDX search" : "";
    console.log(r.status, p, title, extra);
  }
})();
