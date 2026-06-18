#!/usr/bin/env bash
# Ratchet-style file-size enforcement for TypeScript source files.
#
# Ratchet, not a hard ceiling: a changed file over its limit fails only if
# this change grows it or leaves its length unchanged.  Reducing an oversized
# file passes even while still over the limit — progress is always allowed.
# Files under the limit always pass; a newly-added file over the limit fails.
#
# Thresholds (CLAUDE.md — 2× the recommended split threshold):
#   Source files (src/**/*.ts, not __tests__): recommended ~200 → hard cap 400
#   Test files   (src/__tests__/**/*.ts):      recommended ~300 → hard cap 600
#
# Modes:
#   --staged            staged index vs HEAD (pre-commit hook)
#   --base <ref>        working tree vs <ref> (CI; <ref> is the PR merge-base)

set -euo pipefail

SOURCE_CAP=400
TEST_CAP=600
mode=""
base_ref=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) mode="staged"; shift ;;
    --base)   mode="base"; base_ref="$2"; shift 2 ;;
    *) echo "Usage: $0 --staged | --base <ref>" >&2; exit 1 ;;
  esac
done

if [[ -z "$mode" ]]; then
  echo "Usage: $0 --staged | --base <ref>" >&2
  exit 1
fi

changed_files() {
  if [[ "$mode" == "staged" ]]; then
    git diff --cached --name-only --diff-filter=ACMR
  else
    git diff --name-only "$base_ref" HEAD
  fi
}

new_lines() {
  local file="$1"
  if [[ "$mode" == "staged" ]]; then
    git show ":$file" 2>/dev/null | wc -l
  else
    [ -f "$file" ] && wc -l < "$file" || echo 0
  fi
}

old_lines() {
  local file="$1"
  if [[ "$mode" == "staged" ]]; then
    git show "HEAD:$file" 2>/dev/null | wc -l || echo 0
  else
    git show "$base_ref:$file" 2>/dev/null | wc -l || echo 0
  fi
}

in_ci() { [[ "${GITHUB_ACTIONS:-}" == "true" ]]; }

failed=0

while IFS= read -r file; do
  case "$file" in
    src/__tests__/*.ts|src/__tests__/*/*.ts) limit=$TEST_CAP;   kind="test" ;;
    src/*.ts|src/lib/*.ts)                   limit=$SOURCE_CAP; kind="source" ;;
    *) continue ;;
  esac

  new=$(new_lines "$file")
  [ "$new" -lt "$limit" ] && continue

  old=$(old_lines "$file")

  if [ "$new" -lt "$old" ]; then
    if in_ci; then
      echo "::notice file=$file,title=Oversized but improving::$file — $new lines (was $old, $kind cap: $limit); reducing, allowed"
    else
      echo "note: $file — $new lines, down from $old ($kind cap: $limit); reducing, allowed"
    fi
    continue
  fi

  if in_ci; then
    echo "::error file=$file,title=File too long::$file — $new lines (was $old, $kind cap: $limit); over limit and not reduced by this PR"
  else
    echo "error: $file — $new lines ($kind cap: $limit); over limit and not reduced by this change" >&2
  fi
  failed=1
done < <(changed_files)

if [ "$failed" -ne 0 ]; then
  echo "" >&2
  echo "One or more changed files exceed the line-count cap and were not reduced by this change." >&2
  echo "  Source files: recommended ~200 lines, hard cap ${SOURCE_CAP}" >&2
  echo "  Test files:   recommended ~300 lines, hard cap ${TEST_CAP}" >&2
  echo "A file over the cap passes only if this change reduces its line count." >&2
  exit 1
fi
