// One-off live check (temporary branch, read only, submits nothing).
(async () => {
  for (const p of ["/", "/buyers-guide/", "/contact/"]) {
    const t = await (await fetch("https://jackmacdonaldre.com" + p + "?n=" + Date.now())).text();
    const forms = t.match(/<form[\s\S]{0,400}?>[\s\S]{0,200}/g) || [];
    console.log(`\n== ${p} length=${t.length} forms=${forms.length} has_netlify_word=${/netlify/i.test(t)}`);
    forms.forEach((f) => console.log("  ", f.replace(/\s+/g, " ").slice(0, 400)));
    const body = t.indexOf("<body");
    console.log("   BODY START:", t.slice(body, body + 400).replace(/\s+/g, " "));
  }
})();
