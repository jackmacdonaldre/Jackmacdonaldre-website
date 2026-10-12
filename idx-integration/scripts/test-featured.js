// One-off live check (temporary branch, read only, submits nothing).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let t = "";
  for (let i = 0; i < 30; i++) {
    t = await (await fetch("https://jackmacdonaldre.com/?n=" + Date.now())).text();
    if (t.includes("if (view === 'contact') { window.location.href = '/contact/'")) break;
    console.log("waiting for deploy...", i + 1); await sleep(20000);
  }
  console.log(t.includes("if (view === 'contact') { window.location.href = '/contact/'") ? "PASS contact buttons now open /contact/" : "FAIL fix not live yet");
  const c = await (await fetch("https://jackmacdonaldre.com/contact/?n=" + Date.now())).text();
  console.log(/<form[^>]*name='contact'/.test(c) && !/data-netlify/.test(c) ? "PASS /contact/ form is Netlify-processed" : "CHECK /contact/ form markup");
})();
