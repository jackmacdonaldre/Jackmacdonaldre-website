// Reads and writes blog-posts-data.js (one JSON object per line inside
// "export const POSTS = [ ... ]"), keeping the file's header comment.
const fs = require("fs");
const path = require("path");

const POSTS_DATA_PATH = path.join(__dirname, "..", "..", "blog-posts-data.js");

function loadPosts() {
  const text = fs.readFileSync(POSTS_DATA_PATH, "utf8");
  const match = text.match(/export const POSTS = (\[[\s\S]*\]);?\s*$/);
  if (!match) throw new Error("Could not locate 'export const POSTS = [...]' in blog-posts-data.js");
  // Evaluate as JS (not JSON) so hand written object literals also work.
  const posts = new Function(`"use strict"; return (${match[1]});`)();
  if (!Array.isArray(posts)) throw new Error("Parsed POSTS is not an array.");
  return posts;
}

// Puts the commonly read fields first so the file stays easy to scan.
function orderPost(p) {
  const first = ["id", "slug", "title", "metaDescription", "city", "topic", "areas", "publishedDate", "updatedDate"];
  const out = {};
  first.forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
  Object.keys(p).forEach((k) => { if (!(k in out)) out[k] = p[k]; });
  return out;
}

function savePosts(posts) {
  const text = fs.readFileSync(POSTS_DATA_PATH, "utf8");
  const header = text.slice(0, text.indexOf("export const POSTS = ["));
  const body = posts.map((p) => "  " + JSON.stringify(orderPost(p))).join(",\n");
  fs.writeFileSync(POSTS_DATA_PATH, `${header}export const POSTS = [\n${body}\n];\n`);
}

module.exports = { POSTS_DATA_PATH, loadPosts, savePosts };
