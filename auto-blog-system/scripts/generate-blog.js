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

FORMATTING RULE: Never use a
