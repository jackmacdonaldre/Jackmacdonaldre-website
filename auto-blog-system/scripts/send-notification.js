// Sends an email to Jack whenever a new blog post is auto-published.
// Uses the Resend API (https://resend.com) — free tier, no domain verification
// needed when sending from onboarding@resend.dev.
//
// Requires a RESEND_API_KEY repo secret. If it's not set yet, or no new post
// was published this run, the script exits quietly without failing the workflow.

const title = process.env.NEW_POST_TITLE;
const url = process.env.NEW_POST_URL;
const apiKey = process.env.RESEND_API_KEY;
const to = process.env.NOTIFY_EMAIL || "jack@macdonaldgroupre.com";

if (!title || !url) {
  console.log("No new post was published this run — skipping notification email.");
  process.exit(0);
}

if (!apiKey) {
  console.log("RESEND_API_KEY is not set yet — skipping notification email. Add it as a repo secret to enable this.");
  process.exit(0);
}

(async () => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Jack's Blog Bot <onboarding@resend.dev>",
      to: [to],
      subject: `New blog post published: ${title}`,
      html: `<p>A new post just went live on your site:</p><p><strong>${title}</strong></p><p><a href="${url}">${url}</a></p>`,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send notification email:", response.status, await response.text());
    // Don't fail the whole workflow just because the email didn't send.
    process.exit(0);
  }

  console.log(`Notification email sent to ${to} for: ${title}`);
})();
