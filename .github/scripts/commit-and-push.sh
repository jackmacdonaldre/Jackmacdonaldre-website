#!/usr/bin/env bash
# Commits whatever the workflow changed and pushes it to main.
# If another workflow pushed first (blog post, listings refresh, market
# reports), it rebases on top, rebuilds the generated pages so they include
# both changes, and tries again. Usage: commit-and-push.sh "Commit message"
set -u
MSG="$1"
git config user.name "${GIT_BOT_NAME:-site-bot}"
git config user.email "${GIT_BOT_EMAIL:-site-bot@users.noreply.github.com}"
git add -A
if git diff --staged --quiet; then
  echo "No changes to commit."
  exit 0
fi
git commit -q -m "$MSG"
for i in 1 2 3 4 5; do
  if git push; then
    echo "Pushed on attempt $i."
    exit 0
  fi
  echo "Push rejected (someone else pushed first). Syncing and rebuilding pages..."
  sleep $((i * 10))
  if ! git pull --rebase -X theirs; then
    git rebase --abort || true
    echo "Could not rebase cleanly."
    exit 1
  fi
  node auto-blog-system/scripts/generate-blog-pages.js >/dev/null
  git add -A
  git diff --staged --quiet || git commit -q -m "Rebuild pages after sync"
done
echo "Gave up after 5 push attempts."
exit 1
