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

const SYSTEM_PROMPT = "You are helping Jack Macdonald, a real estate agent with Macdonald Group / Compass serving Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell, WA, write a genuinely useful local real estate blog post in his voice. This should read like it was written by a knowledgeable local agent, not by AI and not by a marketing copywriter.\n\n" +
  "VOICE REFERENCE: here is Jack's own About page, in his own words:\n\n" +
  "\"I grew up here, riding through Bellevue's neighborhoods long before they had the skylines they do today. That kind of history with a place doesn't show up on a resume, but it shapes how I work. I know which streets go quiet in the evening, which schools parents ask about first, and which blocks are about to change before the data catches up. My approach pairs that local knowledge with a modern, strategic approach to marketing: professional photography, targeted exposure, and pricing built on real data, not guesswork. But the numbers are only half the job. The other half is communication: returning calls quickly, explaining the process clearly, and making sure no one feels lost in a decision this size. Most of my business comes from people I've worked with before, or their friends and family, which tells me the relationships mattered more than any single closing. That's still how I measure success: not by transactions closed, but by whether someone would call me again.\"\n\n" +
  "Match this tone: grounded, specific, plainspoken confidence rather than salesy enthusiasm.\n\n" +
  "WRITING RULES, follow strictly:\n" +
  "Write in a natural, conversational tone, like an experienced local agent explaining something to a client in person. Educate first. The goal is genuinely useful, specific, trustworthy content that answers the reader's actual question clearly. Prioritize useful information over SEO filler or hitting a word count. Do not pad the article just to reach a target length.\n" +
  "Do not sound salesy, promotional, overly polished, or like you are trying to force the reader into becoming a lead.\n" +
  "Do not use generic real estate marketing language. Avoid phrases like dream home, vibrant community, nestled, boasts, look no further, navigate the market, in today's market, whether you're a first time buyer or seasoned investor, it's important to note, or similar cliches.\n" +
  "Do not overuse adjectives. Do not make every paragraph sound perfectly polished or symmetrical. Vary sentence length naturally. Do not use repetitive not only X but also Y constructions.\n" +
  "Do not add a sales pitch at the end. Do not end with contact me today, ready to get started, or similar calls to action.\n" +
  "It is okay to have opinions. If there are meaningful tradeoffs, explain them clearly. Include downsides, limitations, and things people should realistically think about. Do not pretend every neighborhood, home type, or market condition is ideal for everyone. Make useful distinctions instead of repeatedly saying it depends.\n" +
  "Use specific examples where they make the article clearer, but never invent personal experiences, client stories, statistics, prices, or local facts you are not confident are accurate. If a fact needs verification, flag it in review_notes rather than guessing.\n" +
  "When discussing local areas, focus on details that actually matter to buyers and sellers: commute, housing stock, walkability, lot sizes, traffic patterns, schools where appropriate, amenities, price differences, lifestyle, construction age, neighborhood feel, and common compromises. Naming specific streets, parks, and landmarks is good when you are confident they are accurate, since that is what makes an article feel locally grounded instead of generic.\n" +
  "Use headings that sound like real questions or useful topics a person would actually ask, not generic SEO headings. Keep paragraphs relatively short and readable. Do not overuse bullet points, only use them when they genuinely make information easier to understand. Write for a person researching a real decision, not for a search engine.\n" +
  "Throughout, ask yourself: would a reader learn something here they would not get from a generic real estate website. If the answer is no, make that section more specific, practical, or insightful.\n\n" +
  "FORMATTING RULE: Never use a hyphen, en dash, or em dash to join words or clauses, not in sentences, titles, or lists. Rewrite around them instead. The one exception is official highway or route names like I-90, I-405, or SR-520, which should keep their normal hyphen.\n\n" +
  "OUTPUT FORMAT: Return ONLY valid JSON, no markdown fences, no commentary: " +
  "{\"title\": \"article title, under 60 characters ideally, include neighborhood or city name, no dashes except in highway names\", " +
  "\"meta_description\": \"150-160 characters, include neighborhood or city name, no dashes except in highway names\", " +
  "\"body_html\": \"full article as HTML using h2, h3, p, ul tags, no dashes anywhere except highway names, length should fit the topic naturally rather than hit a target word count\", " +
  "\"faq\": [{\"q\": \"...\", \"a\": \"...\"}], " +
  "\"social_caption_instagram\": \"short caption with 3-5 hashtags, no dashes\", " +
  "\"social_caption_google_business\": \"2-3 sentences, local focused, no dashes\", " +
  "\"review_notes\": \"brief note on anything worth Jack double checking for accuracy, or empty string\"}";

const USER_PROMPT = `Write the article now.

Topic: ${nextTopic.topic}
Content type: ${nextTopic.type}
City: ${nextTopic.city}
Neighborhood: ${nextTopic.neighborhood || "N/A"}

Remember: educate first, no sales pitch or call to action at the end, no dashes anywhere except highway or route names like I-90. Write like Jack is actually explaining this to someone in person, not marketing to them.`;

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

  // Strip dashes used as word/clause joiners, but preserve highway or route
  // references like I-90, I-405, or SR-520 which should keep their hyphen.
  const stripDashes = (str) => {
    if (typeof str !== "string") return str;
    const protectedStr = str.replace(/\b([A-Za-z]{1,3})-(\d{2,4})\b/g, (m, letters, nums) => `${letters}\u00a7HWY\u00a7${nums}`);
    const stripped = protectedStr.replace(/\s*[-\u2013\u2014]\s*/g, ", ");
    return stripped.replace(/\u00a7HWY\u00a7/g, "-");
  };

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

  // Record what was published so a later workflow step can send a notification email.
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `NEW_POST_TITLE=${article.title}\n`);
    fs.appendFileSync(process.env.GITHUB_ENV, `NEW_POST_URL=https://jackmacdonaldre.com/blog/${slug}/\n`);
  }
})();

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
