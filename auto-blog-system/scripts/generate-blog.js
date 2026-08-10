const fs = require("fs");
const path = require("path");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable.");
  process.exit(1);
}

const QUEUE_PATH = path.join(__dirname, "..", "content", "topics-queue.json");
const POSTS_DATA_PATH = path.join(__dirname, "..", "..", "blog-posts-data.js");

const queueData = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
const nextTopic = queueData.topics.find((t) => t.status === "queued");

if (!nextTopic) {
  console.log("No queued topics remain. Add more to content/topics-queue.json. Exiting without publishing.");
  process.exit(0);
}

if (!fs.existsSync(POSTS_DATA_PATH)) {
  console.error(`Could not find blog-posts-data.js at ${POSTS_DATA_PATH}. Create it first.`);
  process.exit(1);
}
const existingFileText = fs.readFileSync(POSTS_DATA_PATH, "utf8");
const slug = slugify(nextTopic.topic);

if (existingFileText.includes(`"${slug}"`)) {
  console.log(`Slug "${slug}" already exists. Marking topic published (skip).`);
  nextTopic.status = "published";
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queueData, null, 2));
  process.exit(0);
}

const SYSTEM_PROMPT = `
You are writing a local real estate blog post for Jack Macdonald, an agent with Macdonald Group / Compass, serving Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell, WA.

VOICE: Local, confident, conversational, helpful — not salesy. Sounds like a knowledgeable Eastside agent, not a generic AI article.

HARD SAFETY RULE:
Never invent or guess specific facts: school names/ratings, business names/addresses, commute times, population or market statistics, park names, or any other verifiable local fact you're not highly confident is accurate. If a specific fact is needed and you're not confident, write around it generally, or mark it with {{NEEDS VERIFICATION: what's needed}}. Never fabricate to fill a gap.

OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences, no commentary:
{
  "title": "article title, under 60 characters ideally",
  "meta_description": "150-160 characters",
  "body_html": "full article as HTML using <h2>, <h3>, <p>, <ul> tags — 600-900 words",
  "faq": [{"q": "...", "a": "..."}],
  "social_caption_instagram": "short on-brand caption with 3-5 hashtags",
  "social_caption_google_business": "2-3 sentences, local-focused",
  "needs_human_review": true or false,
  "review_notes": "anything flagged with {{NEEDS VERIFICATION}}, or empty string"
}
`.trim();

const USER_PROMPT = `
Write the article now.

Topic: ${nextTopic.topic}
Content type: ${nextTopic.type}
City: ${nextTopic.city}
Neighborhood: ${nextTopic.neighborhood || "N/A"}

End with a natural call-to-action to contact Jack Macdonald about buying/selling in this area — not a generic phrase.
`.trim();

(async () => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_PROMPT }],
    }),
  });

  if (!response.ok) {
    console.error("Claude API error:", response.status, await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const rawText = data.content.find((b) => b.type === "text")?.text || "";

  let article;
  try {
    article = JSON.parse(rawText.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("Failed to parse Claude's response as JSON. Skipping this run.", err);
    process.exit(1);
  }

  if (article.needs_human_review) {
    console.log("Flagged for human review — NOT publishing automatically.");
    console.log("Notes:", article.review_notes);
    const draftsDir = path.join(__dirname, "..", "..", "blog-drafts");
    if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
    fs.writeFileSync(path.join(draftsDir, `${slug}.json`), JSON.stringify(article, null, 2));
    process.exit(0);
  }

  const newPostObj = {
    id: `post-${Date.now()}`,
    slug,
    title: article.title,
    metaDescription: article.meta_description,
    city: nextTopic.city,
    publishedDate: new Date().toISOString().split("T")[0],
    bodyHtml: article.body_html,
    faq: article.faq || [],
  };

  const insertion = `\n  ${JSON.stringify(newPostObj)},`;
  const updatedFileText = existingFileText.replace(
    /export const POSTS = \[/,
    (match) => `${match}${insertion}`
  );

  if (updatedFileText === existingFileText) {
    console.error("Could not find 'export const POSTS = [' in blog-posts-data.js.");
    process.exit(1);
  }

  fs.writeFileSync(POSTS_DATA_PATH, updatedFileText);

  nextTopic.status = "published";
  nextTopic.published_slug = slug;
  nextTopic.published_date = new Date().toISOString().split("T")[0];
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queueData, null, 2));

  console.log(`Published to blog-posts-data.js: ${slug}`);
  console.log("Instagram caption:", article.social_caption_instagram);
  console.log("Google Business caption:", article.social_caption_google_business);
})();

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
