#!/bin/bash

set -euo pipefail

FORCE=false
PRINT_BRANCH=false
TARGET_BRANCH="${TARGET_BRANCH:-dev}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-dev}"
UPSTREAM_REPO="${UPSTREAM_REPO:-anomalyco/opencode}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream-$(date +%Y%m%d-%H%M%S)}"

while [ $# -gt 0 ]; do
  case "$1" in
    --force)
      FORCE=true
      ;;
    --print-branch)
      PRINT_BRANCH=true
      ;;
    --target-branch)
      TARGET_BRANCH="$2"
      shift
      ;;
    --upstream-branch)
      UPSTREAM_BRANCH="$2"
      shift
      ;;
    --upstream-repo)
      UPSTREAM_REPO="$2"
      shift
      ;;
    --sync-branch)
      SYNC_BRANCH="$2"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is dirty. Commit or stash changes before syncing." >&2
  exit 1
fi

echo "🔄 Syncing ${UPSTREAM_REPO}@${UPSTREAM_BRANCH} into ${TARGET_BRANCH}"

if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  git remote set-url "$UPSTREAM_REMOTE" "https://github.com/${UPSTREAM_REPO}.git"
else
  git remote add "$UPSTREAM_REMOTE" "https://github.com/${UPSTREAM_REPO}.git"
fi

git fetch origin "$TARGET_BRANCH"
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"
git checkout -B "$SYNC_BRANCH" "origin/$TARGET_BRANCH"

merge_upstream() {
  git merge --no-ff --no-edit "$@"
}

if merge_upstream "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
  echo "✅ Merge completed cleanly"
else
  if [ "$FORCE" != "true" ]; then
    echo "❌ Merge conflicts detected on $SYNC_BRANCH. Resolve them manually, then commit the merge." >&2
    exit 1
  fi

  echo "⚠️  Retrying with upstream-preferred conflict resolution"
  git merge --abort || true
  merge_upstream -X theirs "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
fi

echo "📌 Sync branch: $SYNC_BRANCH"
echo "📍 Base branch: $TARGET_BRANCH"

if [ "$PRINT_BRANCH" = "true" ]; then
  echo "$SYNC_BRANCH"
fi