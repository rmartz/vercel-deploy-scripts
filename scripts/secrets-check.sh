#!/usr/bin/env bash
set -euo pipefail

if command -v realpath > /dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "$(realpath "$0")")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

DEFAULT_CONFIG="$(cd "$SCRIPT_DIR/.." && pwd)/.gitleaks.toml"
CONFIG="$DEFAULT_CONFIG"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if ! command -v gitleaks > /dev/null 2>&1; then
  echo "secrets-check: gitleaks not installed, skipping secret scan" >&2
  exit 0
fi

exec gitleaks protect --staged --config "$CONFIG"
