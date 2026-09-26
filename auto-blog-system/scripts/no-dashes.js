// Removes EVERY dash (hyphen, en dash, em dash, and similar) from visible text.
// Jack's rule: zero dashes anywhere in blog content. HTML tags, attributes and
// comments are left untouched so markup, classes and links keep working.
//   "single-family"   -> "single family"      "pre-approval" -> "preapproval"
//   "I-90" / "SR-520" -> "I 90" / "SR 520"     "3-4 weeks"    -> "3 to 4 weeks"
//   "K-12"            -> "K through 12"        "941-6998"     -> "941.6998"
//   "word — word"     -> "word, word"
const DASH = "\\-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212";
const JOIN_PREFIXES = ["pre", "re", "non", "co", "multi", "semi", "sub", "anti", "e"];

function cleanText(text) {
  if (typeof text !== "string" || !new RegExp(`[${DASH}]`).test(text)) return text;
  let t = text;
  // phone numbers: 425-941-6998 -> 425.941.6998
  t = t.replace(new RegExp(`\\((\\d{3})\\)\\s*(\\d{3})[${DASH}](\\d{4})\\b`, "g"), "$1.$2.$3");
  t = t.replace(new RegExp(`\\b(\\d{3})[${DASH}](\\d{3})[${DASH}](\\d{4})\\b`, "g"), "$1.$2.$3");
  t = t.replace(new RegExp(`\\b(\\d{3})[${DASH}](\\d{4})\\b`, "g"), "$1.$2");
  // grade range
  t = t.replace(new RegExp(`\\bK[${DASH}](\\d{1,2})\\b`, "g"), "K through $1");
  // highways / routes: I-90, SR-520, US-2
  t = t.replace(new RegExp(`\\b(I|SR|US|WA|Hwy)[${DASH}](\\d{1,3})\\b`, "g"), "$1 $2");
  // number ranges: 3-4, 150–160, $500-$700, 1970s-80s
  t = t.replace(new RegExp(`(\\d[\\d,.%kKmM]*s?)\\s*[${DASH}]\\s*(\\$?\\d)`, "g"), "$1 to $2");
  // dashes with space on at least one side = clause break -> comma
  t = t.replace(new RegExp(`\\s+[${DASH}]+\\s*|\\s*[${DASH}]+\\s+`, "g"), ", ");
  // prefixes that are normally written closed: preapproval, reverify, nonwaterfront
  t = t.replace(new RegExp(`\\b(${JOIN_PREFIXES.join("|")})[${DASH}](?=[a-z])`, "gi"), "$1");
  // any remaining dash between characters -> space (single-family -> single family)
  t = t.replace(new RegExp(`(\\S)[${DASH}]+(?=\\S)`, "g"), "$1 ");
  // leftovers at the start/end of the string
  t = t.replace(new RegExp(`^[${DASH}]+\\s*|\\s*[${DASH}]+$`, "g"), "");
  t = t.replace(/,\s*,/g, ",").replace(/ ,/g, ",").replace(/ {2,}/g, " ");
  return t;
}

// Apply to HTML: only the text between tags is changed.
function cleanHtml(html) {
  if (typeof html !== "string") return html;
  return html
    .split(/(<!--[\s\S]*?-->|<[^>]*>)/g)
    .map((part) => (part.startsWith("<") ? part : cleanText(part)))
    .join("");
}

function cleanPost(post) {
  const out = { ...post };
  out.title = cleanText(out.title);
  out.metaDescription = cleanText(out.metaDescription);
  out.bodyHtml = cleanHtml(out.bodyHtml);
  if (Array.isArray(out.faq)) out.faq = out.faq.map((f) => ({ ...f, q: cleanText(f.q), a: cleanText(f.a) }));
  return out;
}

module.exports = { cleanText, cleanHtml, cleanPost, DASH };
