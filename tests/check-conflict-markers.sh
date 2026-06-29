#!/usr/bin/env bash
# Block committing leftover Git conflict markers in staged content.
#
# `git diff --cached --check` reports both whitespace errors and conflict
# markers; we filter to the latter so an unrelated whitespace nit never blocks
# a commit. Pure git with no dependencies, so it runs in every worktree —
# unlike the tsc/lint-staged/file-size checks, which the hook skips in linked
# worktrees.

set -euo pipefail

markers=$(git diff --cached --check | grep "leftover conflict marker" || true)

if [ -n "$markers" ]; then
  echo "error: staged changes contain Git conflict markers:" >&2
  echo "$markers" >&2
  echo "Resolve the conflict before committing." >&2
  exit 1
fi
