#!/usr/bin/env bash
set -euo pipefail

if ! command -v vercel &>/dev/null; then
  echo "generate-local-env: vercel CLI not found. Install it with: npm i -g vercel" >&2
  exit 1
fi

if ! vercel whoami &>/dev/null; then
  echo "generate-local-env: not authenticated. Run: vercel login" >&2
  exit 1
fi

vercel env pull .env.local --environment=preview
