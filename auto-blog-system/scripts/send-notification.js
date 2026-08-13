// Sends an email to Jack whenever a new blog post is auto-published, and
// separately warns him when the topic queue is running low or empty.
// Uses the Resend API (https://resend.com) — free tier, no domain verification
// needed when sending from onboarding@resend.dev.
//
// Requires a RESEND_API_KEY repo secret. If it's not set yet, the script exits
// quietly without failing the workflow.

const title = process.env.NEW_POST_TITLE;
const url = process.env.NEW_POST_URL;
const remaining = process.env.REMAINING_TOPICS;
const lowQueueWarning = process.env.LOW_QUEUE_WARNING === "true";
const queueEmpty = process.env.QUEUE_EMPTY === "true";
const apiKey = process.env.RESEND_API_KEY;
const to = process.env.NOTIFY_EMAIL || "jack@macdonaldgroupre.com";

if (!title && !queueEmpty) {
  console.log("Nothing to notify about this run — skipping email.");
  process.exit(0);
}

if (!apiKey) {
  console.log("RESEND_API_KEY is not set yet — skipping notification email. Add it as a repo secret to enable this.");
  process.exit(0);
}

function buildEmail() {
  if (queueEmpty) {
    return {
      subject: "Action needed: your blog topic queue is empty",
      html: "<p>Your auto-blog topic queue is out of topics, so no new post was published today.</p>" +
        "<p>Add more topics to <code>auto-blog-system/content/topics-queue.json</code> to keep posts going out on schedule.</p>",
    };
  }

  let html = `<p>A new post just went live on your site:</p><p><strong>${title}</strong></p><p><a href="${url}">${url}</a></p>`;

  if (lowQueueWarning) {
    html += `<p style="margin-top: 16px; color: #b45309;">Heads up: only ${remaining} topic${remaining === "1" ? "" : "s"} left in your queue. Add more to auto-blog-system/content/topics-queue.json soon so posts don't stop.</p>`;
  }

  return {
    subject: `New blog post published: ${title}`,
    html,
  };
}

(async () => {
  const { subject, html } = buildEmail();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Jack's Blog Bot <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error("Failed to send notification email:", response.status, await response.text());
    // Don't fail the whole workflow just because the email didn't send.
    process.exit(0);
  }

  console.log(`Notification email sent to ${to}: ${subject}`);
})();
