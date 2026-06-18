#!/usr/bin/env bash
# Enforces hard LOC caps derived from CLAUDE.md recommended limits:
#   Source files (src/**/*.ts, not __tests__): recommended 200 → hard cap 400
#   Test files  (src/__tests__/**/*.ts):       recommended 300 → hard cap 600
#
# Known exceptions to the hard cap are listed in .loc-exceptions, one path per
# line (relative to repo root, comments with # permitted). Files listed there
# are flagged as warnings rather than errors so CI stays green while the
# violation is tracked and scheduled for refactoring.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXCEPTIONS_FILE="$REPO_ROOT/.loc-exceptions"

SOURCE_CAP=400
TEST_CAP=600

violations=0
warnings=0

is_exception() {
  local file="$1"
  if [ ! -f "$EXCEPTIONS_FILE" ]; then
    return 1
  fi
  local rel="${file#"$REPO_ROOT/"}"
  while IFS= read -r line; do
    # strip comments and whitespace
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [ -z "$line" ] && continue
    [ "$line" = "$rel" ] && return 0
  done < "$EXCEPTIONS_FILE"
  return 1
}

check_file() {
  local file="$1"
  local cap="$2"
  local lines
  lines=$(wc -l < "$file")
  local rel="${file#"$REPO_ROOT/"}"

  if [ "$lines" -gt "$cap" ]; then
    if is_exception "$file"; then
      echo "WARNING (known exception): $rel — $lines lines exceeds cap of $cap"
      warnings=$((warnings + 1))
    else
      echo "ERROR: $rel — $lines lines exceeds hard cap of $cap"
      violations=$((violations + 1))
    fi
  fi
}

while IFS= read -r file; do
  if [[ "$file" == *"/__tests__/"* ]]; then
    check_file "$file" "$TEST_CAP"
  else
    check_file "$file" "$SOURCE_CAP"
  fi
done < <(find "$REPO_ROOT/src" -name "*.ts" -not -path "*/node_modules/*")

if [ "$violations" -gt 0 ] || [ "$warnings" -gt 0 ]; then
  echo ""
  echo "Summary: $violations violation(s), $warnings known exception(s)"
fi

if [ "$violations" -gt 0 ]; then
  echo "Add files to .loc-exceptions to acknowledge known violations pending refactoring."
  exit 1
fi
