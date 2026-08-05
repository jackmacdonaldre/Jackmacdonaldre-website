// Blog posts data — same pattern as properties-data.js.
// The automation script appends new posts to the POSTS array below.
// Each post needs: id, slug, title, metaDescription, city, publishedDate,
// bodyHtml (the article body as HTML), faq (array of {q, a}).

export const POSTS = [
  {
    id: "post-1",
    slug: "welcome-to-the-blog",
    title: "Welcome to the Blog",
    metaDescription: "Market updates, neighborhood guides, and local insight from Jack Macdonald and the Macdonald Group, serving Bellevue and the greater Eastside.",
    city: "Bellevue",
    publishedDate: "2026-08-04",
    bodyHtml: "<p>This is where you'll find neighborhood guides, market updates, and local insight for buyers and sellers across Bellevue, Kirkland, Redmond, Sammamish, Issaquah, Woodinville, and Bothell. New posts are added automatically — check back often.</p>",
    faq: []
  }
];
