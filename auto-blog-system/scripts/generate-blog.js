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

SEO GOAL: This post should target hyper-local search intent (e.g. "[neighborhood] homes for sale", "living in [neighborhood]", "[city] real estate market", "[neighborhood] schools"). Use the neighborhood and city names naturally and repeatedly in the title, meta_description, H2s, and body — the way a real local expert would, not stuffed. Prioritize specific, named local landmarks, parks, and streets when confident, since specificity drives local search ranking.

FACTS: Avoid inventing or guessing specific facts you're not confident are accurate (school names/ratings, business names/addresses, commute times, market statistics). Where you're unsure of a specific number or name, write around it generally rather than guessing. Do not use any placeholder or bracketed notes in the output — write natural prose either way.

OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences, no commentary:
{
  "title": "article title, under 60 characters ideally, include neighborhood/city name",
  "meta_description": "150-160 characters, include neighborhood/city name",
  "body_html": "full article as HTML using <h2>, <h3>, <p>, <ul> tags — 600-900 words",
  "faq": [{"q": "...", "a": "..."}],
  "social_caption_instagram": "short on-brand caption with 3-5 hashtags",
  "social_caption_google_business": "2-3 sentences, local-focused",
  "review_notes": "brief note on anything worth Jack double-checking for accuracy, or empty string"
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

  // Always publish. If there's a review note, tuck it into the HTML as a
  // hidden comment so Jack can spot-check later without blocking the post.
  let bodyHtml = article.body_html;
  if (article.review_notes && article.review_notes.trim().length > 0) {
    bodyHtml += `\n<!-- REVIEW NOTE: ${article.review_notes.replace(/-->/g, "")} -->`;
  }

  const newPostObj = {
    id: `post-${Date.now()}`,
    slug,
    title: article.title,
    metaDescription: article.meta_description,
    city: nextTopic.city,
    publishedDate: new Date().toISOString().split("T")[0],
    bodyHtml,
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
