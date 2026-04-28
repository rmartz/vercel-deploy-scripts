#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATES_DIR="${PACKAGE_ROOT}/templates"

DEST_TERRAFORM="terraform"
DEST_WORKFLOW=".github/workflows/terraform-plan.yml"

skipped=0

if [[ -d "${DEST_TERRAFORM}" ]]; then
  echo "WARNING: '${DEST_TERRAFORM}/' already exists — skipping copy. Remove it to reinitialize." >&2
  skipped=1
else
  cp -r "${TEMPLATES_DIR}/terraform" "${DEST_TERRAFORM}"
  echo "Copied terraform templates → ${DEST_TERRAFORM}/"
fi

if [[ -f "${DEST_WORKFLOW}" ]]; then
  echo "WARNING: '${DEST_WORKFLOW}' already exists — skipping copy. Remove it to reinitialize." >&2
  skipped=1
else
  mkdir -p "$(dirname "${DEST_WORKFLOW}")"
  cp "${TEMPLATES_DIR}/workflows/terraform-plan.yml" "${DEST_WORKFLOW}"
  echo "Copied workflow template → ${DEST_WORKFLOW}"
fi

if [[ "${skipped}" -eq 0 ]]; then
  echo ""
  echo "Next steps:"
  echo "  1. Copy terraform/terraform.tfvars.example → terraform/terraform.tfvars and fill in your values"
  echo "  2. Add VERCEL_PROJECT_ID, VERCEL_TEAM_ID (if applicable), and VERCEL_API_TOKEN to GitHub Actions secrets"
  echo "  3. Run: cd terraform && terraform init"
fi
