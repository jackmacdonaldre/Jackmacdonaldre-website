// Blog organization: every post has ONE topic and one or more area tags.
// Existing posts carry "topic" and "areas" in blog-posts-data.js. New posts get
// them automatically from the queue entry (see classify() below), so nothing
// needs to be tagged by hand.

const TOPICS = [
  { slug: "neighborhood-guides", name: "Neighborhood guides" },
  { slug: "market-reports", name: "Market reports" },
  { slug: "buying", name: "Buying" },
  { slug: "selling", name: "Selling" },
  { slug: "relocation", name: "Relocation" },
  { slug: "schools-and-family", name: "Schools and family" },
];

// hub: has an /areas/{slug}/ page. report: has a monthly /market-reports/{slug}/ page.
const AREAS = [
  { slug: "bellevue", name: "Bellevue", hub: true, report: true, redfin: "Bellevue, WA" },
  { slug: "redmond", name: "Redmond", hub: true, report: true, redfin: "Redmond, WA" },
  { slug: "kirkland", name: "Kirkland", hub: true, report: true, redfin: "Kirkland, WA" },
  { slug: "issaquah", name: "Issaquah", hub: true, report: true, redfin: "Issaquah, WA" },
  { slug: "sammamish", name: "Sammamish", hub: true, report: false },
  { slug: "north-bend", name: "North Bend", hub: true, report: true, redfin: "North Bend, WA" },
  { slug: "fall-city", name: "Fall City", hub: true, report: true, redfin: "Fall City, WA" },
  { slug: "eastside", name: "Eastside", hub: false, report: false },
];

// Short, factual hub intros (no numbers, nothing that goes stale).
const AREA_INTROS = {
  bellevue: "Bellevue is the Eastside's largest city, from the high rises downtown to established neighborhoods like Somerset, Newport Hills and Bridle Trails. I grew up here, so this is the market I know street by street.",
  redmond: "Redmond runs from a fast growing, walkable downtown out to Education Hill, Overlake and Redmond Ridge. Light rail, Microsoft and the Lake Washington School District shape a lot of what buyers ask about here.",
  kirkland: "Kirkland pairs a lakefront downtown with very different neighborhoods a few minutes away, from Houghton and Rose Hill to Juanita and Finn Hill. It is one of the most requested areas on the Eastside for buyers who want to be near the water.",
  issaquah: "Issaquah sits at the edge of the Cascade foothills along I 90, with a historic downtown, the Issaquah Highlands, and hillside neighborhoods on Squak and Cougar Mountain. Trails start practically in town.",
  sammamish: "Sammamish is a plateau of mostly single family neighborhoods between Lake Sammamish and the foothills, served by both the Lake Washington and Issaquah school districts. Lots tend to be larger than in the closer in cities.",
  "north-bend": "North Bend is a small mountain town at the base of Mount Si, about 30 minutes east of Bellevue on I 90. Buyers come for space, acreage and the outdoors, and the trade off is the drive.",
  "fall-city": "Fall City is an unincorporated river community along the Snoqualmie River between Issaquah, Snoqualmie and Carnation. Homes here are often on larger rural lots, and the market is small, so every sale moves the numbers.",
};

// Topic for each existing post (set once, Oct 2026). Areas come from the post's
// city unless listed here.
const EXISTING = {
  "seller-s-guide-preparing-your-eastside-home-for-market": { topic: "selling", areas: ["eastside"] },
  "issaquah-school-district-guide-for-home-buyers": { topic: "schools-and-family", areas: ["issaquah", "sammamish"] },
  "best-parks-in-kirkland-wa-for-families": { topic: "schools-and-family", areas: ["kirkland"] },
  "rose-hill-kirkland-schools-which-elementary-middle-and-high-school-feeds-each-street": { topic: "schools-and-family", areas: ["kirkland"] },
  "bellevue-farmers-market-guide": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "dog-parks-in-redmond-wa-a-local-s-list": { topic: "neighborhood-guides", areas: ["redmond"] },
  "best-hiking-trails-near-issaquah": { topic: "neighborhood-guides", areas: ["issaquah"] },
  "best-coffee-shops-in-bellevue-wa": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "how-much-house-can-you-afford-on-the-eastside-in-2026": { topic: "buying", areas: ["eastside"] },
  "first-time-home-buying-on-the-eastside-step-by-step": { topic: "buying", areas: ["eastside"] },
  "cost-of-living-in-bellevue-what-to-expect": { topic: "relocation", areas: ["bellevue"] },
  "lake-washington-school-district-boundaries-a-buyer-s-guide": { topic: "schools-and-family", areas: ["kirkland", "redmond", "sammamish"] },
  "bellevue-school-district-guide-for-home-buyers": { topic: "schools-and-family", areas: ["bellevue"] },
  "relocating-to-the-eastside-for-a-tech-job-what-to-know": { topic: "relocation", areas: ["eastside"] },
  "moving-to-bellevue-from-california-a-practical-guide": { topic: "relocation", areas: ["bellevue"] },
  "redmond-vs-sammamish-comparing-two-eastside-suburbs": { topic: "neighborhood-guides", areas: ["redmond", "sammamish"] },
  "bellevue-vs-kirkland-which-eastside-city-is-right-for-you": { topic: "neighborhood-guides", areas: ["bellevue", "kirkland"] },
  "juanita-kirkland-homes-for-sale-neighborhood-guide": { topic: "neighborhood-guides", areas: ["kirkland"] },
  "sammamish-plateau-homes-for-sale-neighborhood-guide": { topic: "neighborhood-guides", areas: ["sammamish"] },
  "newport-hills-bellevue-neighborhood-guide-for-buyers": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "west-bellevue-homes-for-sale-neighborhood-guide": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "finn-hill-homes-for-sale-neighborhood-overview": { topic: "neighborhood-guides", areas: ["kirkland"] },
  "klahanie-homes-for-sale-community-guide": { topic: "neighborhood-guides", areas: ["sammamish"] },
  "downtown-redmond-condos-and-homes-neighborhood-guide": { topic: "neighborhood-guides", areas: ["redmond"] },
  // Education Hill is in Redmond (the post was tagged Bellevue by mistake).
  "education-hill-homes-for-sale-what-buyers-should-know": { topic: "neighborhood-guides", areas: ["redmond"] },
  "somerset-bellevue-homes-for-sale-neighborhood-guide": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "living-in-bridle-trails-a-neighborhood-guide": { topic: "neighborhood-guides", areas: ["bellevue"] },
  "welcome-to-the-blog": { topic: "neighborhood-guides", areas: ["eastside"] },
};

// Queue "type" -> topic, for new posts.
const TYPE_TO_TOPIC = {
  neighborhood_guide: "neighborhood-guides",
  lifestyle_guide: "neighborhood-guides",
  comparison: "neighborhood-guides",
  school_guide: "schools-and-family",
  seller_guide: "selling",
  buyer_guide: "buying",
  relocation_guide: "relocation",
  market_update: "market-reports",
};

const topicBySlug = (slug) => TOPICS.find((t) => t.slug === slug);
const areaBySlug = (slug) => AREAS.find((a) => a.slug === slug);

function areaSlugFromCity(city) {
  const c = String(city || "").toLowerCase().trim();
  const hit = AREAS.find((a) => a.name.toLowerCase() === c);
  return hit ? hit.slug : "eastside"; // Bothell, Woodinville, Newcastle, etc. roll up to Eastside
}

// Topic + areas for a queue entry (used by generate-blog.js when it writes a post).
function classifyTopic(queueItem) {
  const topic = queueItem.topic_slug || TYPE_TO_TOPIC[queueItem.type] || "neighborhood-guides";
  const areas = Array.isArray(queueItem.areas) && queueItem.areas.length ? queueItem.areas : [areaSlugFromCity(queueItem.city)];
  return { topic, areas };
}

// Guarantees every post has a valid topic and areas, even if the data is missing them.
function classifyPost(post) {
  const fixed = EXISTING[post.slug] || {};
  let topic = post.topic || fixed.topic;
  if (!topicBySlug(topic)) topic = "neighborhood-guides";
  let areas = Array.isArray(post.areas) && post.areas.length ? post.areas : fixed.areas || [areaSlugFromCity(post.city)];
  areas = areas.filter((a) => areaBySlug(a));
  if (!areas.length) areas = ["eastside"];
  return { ...post, topic, areas };
}

module.exports = { TOPICS, AREAS, AREA_INTROS, EXISTING, TYPE_TO_TOPIC, topicBySlug, areaBySlug, areaSlugFromCity, classifyTopic, classifyPost };
