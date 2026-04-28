#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG="$REPO_ROOT/.gitleaks.toml"

if ! command -v gitleaks &>/dev/null; then
  echo "SKIP: gitleaks not installed" >&2
  exit 0
fi

PASS=0
FAIL=0

check_detected() {
  local file="$1"
  if gitleaks detect --no-git --source="$(dirname "$file")" --config="$CONFIG" --report-format=sarif --report-path=/dev/null --quiet 2>/dev/null; then
    echo "FAIL: $file — expected detection, got none"
    FAIL=$((FAIL+1))
  else
    echo "PASS: $file detected"
    PASS=$((PASS+1))
  fi
}

check_ignored() {
  local file="$1"
  if gitleaks detect --no-git --source="$(dirname "$file")" --config="$CONFIG" --report-format=sarif --report-path=/dev/null --quiet 2>/dev/null; then
    echo "FAIL: $file — expected no detection, got a hit"
    FAIL=$((FAIL+1))
  else
    echo "PASS: $file ignored"
    PASS=$((PASS+1))
  fi
}

for f in "$SCRIPT_DIR/fixtures/should-detect/"*; do
  check_detected "$f"
done

for f in "$SCRIPT_DIR/fixtures/should-ignore/"*; do
  check_ignored "$f"
done

echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "$FAIL/$((PASS+FAIL)) tests failed"
  exit 1
fi
echo "$PASS/$((PASS+FAIL)) tests passed"
