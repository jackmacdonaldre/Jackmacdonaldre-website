// One-time (safe to re-run) cleanup: removes every dash from all posts in
// blog-posts-data.js using the same rules as new posts (see no-dashes.js).
const fs = require("fs");
const path = require("path");
const { cleanPost } = require("./no-dashes");
const FILE = path.join(__dirname, "..", "..", "blog-posts-data.js");
const text = fs.readFileSync(FILE, "utf8");
const idx = text.indexOf("export const POSTS = [");
const header = text.slice(0, idx);
const m = text.match(/export const POSTS = (\[[\s\S]*\]);?\s*$/);
const posts = new Function(`"use strict"; return (${m[1]});`)().map(cleanPost);
const out = header + "export const POSTS = [\n" + posts.map((p) => "  " + JSON.stringify(p)).join(",\n") + "\n];\n";
fs.writeFileSync(FILE, out);
console.log(`Cleaned ${posts.length} posts.`);
