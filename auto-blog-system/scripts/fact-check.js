// Fact checks a freshly written post BEFORE it is published.
//
// Pass 1 (preferred): a second Claude call with live web search verifies every
// specific claim (schools and feeder patterns, boundaries, street and park names,
// businesses, hours, prices, tax rates, laws, transit) against official and
// primary sources, fixes anything wrong, and rewrites anything it cannot verify
// so the post stays true without the risky specific.
//
// Pass 2 (fallback, only if web search is unavailable or errors): a conservative
// edit with no browsing that removes or generalizes every claim the writer was
// unsure about and any other specific detail that isn't common knowledge.
//
// If both passes fail, the caller does not publish (the topic stays queued and
// the next scheduled run tries again).

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

const RULES =
  "Rules for your edits:\n" +
  "1. Only change what is needed for accuracy. Keep Jack's plain, conversational voice, the structure, headings and HTML tags.\n" +
  "2. If a claim is wrong, correct it using what the authoritative source says.\n" +
  "3. If a claim cannot be confirmed from a reliable source, or it depends on the exact address (for example which school a particular street is assigned to), rewrite the sentence so it stays true and useful without the risky specific, for example by telling the reader to confirm with the school district's school locator for the exact address. Never replace one guess with another guess.\n" +
  "4. Do not add new facts unless you verified them.\n" +
  "5. Zero dashes: never use any dash character (no hyphen, en dash, or em dash) in any text you write. Write single family, off leash, I 90, SR 520, 3 to 4.\n" +
  "6. Prices, medians, rates and limits change. Only keep a number if a reliable source from the last 12 months supports it, and say roughly when (for example as of summer 2026). Otherwise make it general.\n\n" +
  "Return ONLY valid JSON, no markdown fences, no commentary before or after, in exactly this shape: " +
  "{\"title\": \"...\", \"meta_description\": \"...\", \"body_html\": \"...\", \"faq\": [{\"q\": \"...\", \"a\": \"...\"}], " +
  "\"claims_checked\": <number of specific claims you checked>, " +
  "\"changes\": [{\"what\": \"short description of the claim\", \"action\": \"corrected\" | \"made general\" | \"removed\", \"source\": \"URL or 'not verifiable'\"}]}";

const SEARCH_SYSTEM =
  "You are the fact checker for jackmacdonaldre.com, the website of Jack Macdonald, a real estate agent with Macdonald Group of Compass in Bellevue, Washington. " +
  "Buyers and sellers rely on these articles, so accuracy matters more than anything else. Today's date is " + new Date().toISOString().slice(0, 10) + ".\n\n" +
  "You will receive a draft article as JSON plus the writer's own notes about facts it was unsure of. Use web search to verify EVERY specific, checkable claim in the title, meta description, body and FAQ: " +
  "school names, school locations, feeder patterns and district boundaries (use the school district's own website and school locator), neighborhood boundaries and street names (city neighborhood plans), parks and what they contain (city, county or state parks sites), " +
  "businesses and whether they still exist at that location, market days, hours and seasons (official sites), trail distances and elevation gain (Washington Trails Association), prices and medians (recent NWMLS or Redfin data), tax rates and laws (Washington Department of Revenue, official state sources), lending rules and loan limits (FHFA, Fannie Mae, HUD), and transit (Sound Transit, WSDOT). " +
  "Start with everything in the writer's notes, then check the rest. Prefer official sources over blogs.\n\n" + RULES;

const OFFLINE_SYSTEM =
  "You are the fact checker for jackmacdonaldre.com, the website of Jack Macdonald, a real estate agent in Bellevue, Washington. Buyers rely on these articles, so accuracy matters more than anything else. " +
  "You cannot browse the web for this check. So be conservative: remove or make general every specific claim the writer said it was unsure about, and any other specific detail that is not well established common knowledge " +
  "(especially school assignments and feeder patterns, district or neighborhood boundaries, exact street names, business names, locations and hours, event days and seasons, trail statistics, prices, medians, tax rates, loan limits, and dates). " +
  "Keep the article useful by telling the reader where to confirm those details (the school district's school locator, the city's website, the business's own site). Report claims_checked as the number of specific claims you reviewed.\n\n" + RULES;

async function callClaude(apiKey, body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON in fact check response");
  return JSON.parse(text.slice(start, end + 1));
}

function validate(original, checked) {
  if (!checked || typeof checked.body_html !== "string" || typeof checked.title !== "string") throw new Error("Fact check returned an incomplete article");
  if (checked.body_html.length < original.body_html.length * 0.5) throw new Error("Fact check removed too much of the article");
  if (!Array.isArray(checked.faq)) checked.faq = original.faq || [];
  if (!checked.meta_description) checked.meta_description = original.meta_description;
  if (!Array.isArray(checked.changes)) checked.changes = [];
  checked.claims_checked = Number(checked.claims_checked) || 0;
  return checked;
}

async function factCheckArticle(apiKey, article, topic) {
  const draft = JSON.stringify({
    topic: topic.topic,
    city: topic.city,
    neighborhood: topic.neighborhood || null,
    writer_notes_on_uncertain_facts: article.review_notes || "",
    article: { title: article.title, meta_description: article.meta_description, body_html: article.body_html, faq: article.faq || [] },
  });

  try {
    const checked = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 16000,
      system: SEARCH_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
      messages: [{ role: "user", content: "Fact check this draft and return the corrected JSON.\n\n" + draft }],
    });
    return { ...validate(article, checked), method: "web search" };
  } catch (err) {
    console.error("Web search fact check failed, using the conservative fallback:", err.message);
  }

  const checked = await callClaude(apiKey, {
    model: MODEL,
    max_tokens: 12000,
    system: OFFLINE_SYSTEM,
    messages: [{ role: "user", content: "Review this draft conservatively and return the corrected JSON.\n\n" + draft }],
  });
  return { ...validate(article, checked), method: "conservative (no web search)" };
}

module.exports = { factCheckArticle };
