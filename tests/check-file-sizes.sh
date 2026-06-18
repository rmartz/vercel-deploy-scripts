#!/usr/bin/env bash
# Ratchet-style file-size enforcement for TypeScript source files.
#
# Only checks files changed in the current PR (against merge-base).
# For files over the limit: passes only if this PR reduces the line count.
# For files under the limit: always passes.
# Newly-added files over the limit: always fail (old count is 0).
#
# Thresholds from CLAUDE.md — 2× the recommended split threshold:
#   Source files (src/**/*.ts, not __tests__): recommended ~200 → hard cap 400
#   Test files   (src/__tests__/**/*.ts):      recommended ~300 → hard cap 600
#
# Requires: called from a git checkout with full history (fetch-depth: 0)
# and the BASE_REF environment variable pointing to the PR's base branch.

set -euo pipefail

SOURCE_CAP=400
TEST_CAP=600

base=$(git merge-base "origin/${BASE_REF}" HEAD)

failed=0

while IFS= read -r file; do
  [ -f "$file" ] || continue

  case "$file" in
    src/*.ts|src/lib/*.ts) ;;
    src/__tests__/*.ts|src/__tests__/*/*.ts) ;;
    *) continue ;;
  esac

  case "$file" in
    src/__tests__/*) limit=$TEST_CAP; kind="test" ;;
    *) limit=$SOURCE_CAP; kind="source" ;;
  esac

  new=$(wc -l < "$file")

  [ "$new" -lt "$limit" ] && continue

  old=$(git show "$base:$file" 2>/dev/null | wc -l)

  if [ "$new" -lt "$old" ]; then
    echo "::notice file=$file,title=Oversized but improving::$file — $new lines (was $old, $kind cap: $limit); reducing, allowed"
    continue
  fi

  echo "::error file=$file,title=File too long::$file — $new lines (was $old, $kind cap: $limit); over limit and not reduced by this PR"
  failed=1
done < <(git diff --name-only "$base" HEAD)

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "One or more changed files exceed the maximum line count and were not reduced by this PR."
  echo "  Source files: recommended ~200 lines, hard cap ${SOURCE_CAP}"
  echo "  Test files:   recommended ~300 lines, hard cap ${TEST_CAP}"
  echo "A file over the cap passes only if this PR reduces its line count."
  echo "Reduce or split the flagged files before merging."
  exit 1
fi
