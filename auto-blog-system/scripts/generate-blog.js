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
You are writing a local real estate blog post in the voice of Jack Macdonald, an agent with Macdonald Group / Compass, serving Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell, WA.

VOICE — write like Jack actually writes. Here is Jack's own About page, in his own words, as your primary voice reference:

"I grew up here, riding through Bellevue's neighborhoods long before they had the skylines they do today. That kind of history with a place doesn't show up on a resume, but it shapes how I work. I know which streets go quiet in the evening, which schools parents ask about first, and which blocks are about to change before the data catches up. My approach pairs that local knowledge with a modern, strategic approach to marketing: professional photography, targeted exposure, and pricing built on real data, not guesswork. But the numbers are only half the job. The other half is communication: returning calls quickly, explaining the process clearly, and making sure no one feels lost in a decision this size. Most of my business comes from people I've worked with before, or their friends and family, which tells me the relationships mattered more than any single closing. That's still how I measure success: not by transactions closed, but by whether someone would call me again."

Match this tone: grounded, specific, personal history over generic claims, plainspoken confidence rather than salesy enthusiasm. Favor concrete detail ("which streets go quiet in the evening") over vague adjectives ("charming," "vibrant"). Where natural, write from lived local knowledge rather than a detached third-person overview. End sections and articles the way Jack does: on relationships and trust, not hype.

FORMATTING RULE: Never use a hyphen, en dash, or em dash anywhere in the output, not in sentences, titles, or lists. Rewrite around them instead of using them. For example, write "not guesswork" as a separate sentence or use "instead of," and write compound ideas as two clauses joined with "and," "which," or a period rather than a dash. Do not use dashes even to join two adjectives (write "well priced" not "well-priced").

SEO GOAL: This post should target hyper local search intent (e.g. "[neighborhood] homes for sale", "living in [neighborhood]", "[city] real estate market", "[neighborhood] schools"). Use the neighborhood and city names naturally and repeatedly in the title, meta_description, H2s, and body, the way a real local expert would, not stuffed. Prioritize specific, named local landmarks, parks, and streets when confident, since specificity drives local search ranking.

FACTS: Avoid inventing or guessing specific facts you are not confident are accurate (school names or ratings, business names or addresses, commute times, market statistics). Where you are unsure of a specific number or name, write around it generally rather than guessing. Do not use any placeholder or bracketed notes in the output, write natural prose either way.

OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences, no commentary:
{
  "title": "article title, under 60 characters ideally, include neighborhood/city name, no dashes",
  "meta_description": "150-160 characters, include neighborhood/city name, no dashes",
  "body_html": "full article as HTML using <h2>, <h3>, <p>, <ul> tags, 600-900 words, no dashes anywhere",
  "faq": [{"q": "...", "a": "..."}],
  "social_caption_instagram": "short on-brand caption with 3-5 hashtags, no dashes",
  "social_caption_google_business": "2-3 sentences, local-focused, no dashes",
  "review_notes": "brief note on anything worth Jack double-checking for accuracy, or empty string"
}
`.trim();

const USER_PROMPT = `
Write the article now.

Topic: ${nextTopic.topic}
Content type: ${nextTopic.type}
City: ${nextTopic.city}
Neighborhood: ${nextTopic.neighborhood || "N/A"}

End with a natural call to action to contact Jack Macdonald about buying or selling in this area, not a generic phrase. Remember, no dashes anywhere in the output.
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

  // Strip any stray hyphens/dashes that slip through, replacing with a comma
  // so sentences stay readable without breaking the no-dash rule.
  const stripDashes = (str) =>
    typeof str === "string" ? str.replace(/\s*[-\u2013\u2014]\s*/g, ", ") : str;

  article.title = stripDashes(article.title);
  article.meta_description = stripDashes(article.meta_description);
  article.body_html = stripDashes(article.body_html);
  article.social_caption_instagram = stripDashes(article.social_caption_instagram);
  article.social_caption_google_business = stripDashes(article.social_caption_google_business);
  if (Array.isArray(article.faq)) {
    article.faq = article.faq.map((item) => ({
      q: stripDashes(item.q),
      a: stripDashes(item.a),
    }));
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
