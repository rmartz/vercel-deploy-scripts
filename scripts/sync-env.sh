#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

# ─── Defaults ─────────────────────────────────────────────────────────────────

TARGET_ENV="all"
DEPLOYMENT_DIR="deployment"
DRY_RUN=false

VERCEL_API="https://api.vercel.com"

# ─── Globals ──────────────────────────────────────────────────────────────────

VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-}"

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from
Terraform deployment configuration files. Reads the list of active environments
from deployment/environments.yml and per-environment values from
deployment/{env}.yml, using the same source of truth as Terraform.

Existing variables are updated in place; missing ones are created as plain-type
records. Variables not present in the config files are left untouched.

OPTIONS:
  --env <name>             Target a specific environment by name as listed in
                           environments.yml (default: all active environments)
  --deployment-dir <path>  Path to deployment config directory (default: deployment/)
  --dry-run                Print what would change without making any API calls
  -h, --help               Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN       Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID  Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID     Vercel team/org ID (auto-detected from .vercel/project.json)

ENVIRONMENT MAPPING (matches Terraform target_map):
  production  → production (Vercel target)
  staging     → preview   (Vercel target)
  preview     → preview   (Vercel target)
  development → development (Vercel target)
  <other>     → passed through as-is

DEPLOYMENT DIRECTORY LAYOUT:
  deployment/
    environments.yml   # active: [production, staging, ...]
    production.yml     # KEY: value pairs for production
    staging.yml        # KEY: value pairs for staging
    ...

EXAMPLES:
  # Sync all active environments
  sync-env

  # Sync only the staging environment
  sync-env --env staging

  # Preview what would change without touching Vercel
  sync-env --dry-run
EOF
}

# ─── Logging ──────────────────────────────────────────────────────────────────

log()  { echo "[$SCRIPT_NAME] $*"; }
warn() { echo "[$SCRIPT_NAME] WARNING: $*" >&2; }
err()  { echo "[$SCRIPT_NAME] ERROR: $*" >&2; exit 1; }

# ─── Argument parsing ─────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env)
        TARGET_ENV="${2:-}"
        [[ -n "$TARGET_ENV" ]] || err "--env requires an environment name or 'all'"
        shift 2
        ;;
      --deployment-dir)
        DEPLOYMENT_DIR="${2:-}"
        [[ -n "$DEPLOYMENT_DIR" ]] || err "--deployment-dir requires a path"
        shift 2
        ;;
      --dry-run)
        DRY_RUN=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        err "Unknown option: $1. Run '$SCRIPT_NAME --help' for usage."
        ;;
    esac
  done
}

# ─── Prerequisites ────────────────────────────────────────────────────────────

check_prereqs() {
  local missing=""
  command -v jq      &>/dev/null || missing="${missing} jq"
  command -v curl    &>/dev/null || missing="${missing} curl"
  command -v python3 &>/dev/null || missing="${missing} python3"
  [[ -n "$missing" ]] && err "Missing required tools:$missing"

  [[ -n "${VERCEL_TOKEN:-}" ]] || err "VERCEL_TOKEN environment variable is required"
  [[ -d "$DEPLOYMENT_DIR" ]] || err "Deployment directory not found: $DEPLOYMENT_DIR"
  [[ -f "$DEPLOYMENT_DIR/environments.yml" ]] \
    || err "environments.yml not found: $DEPLOYMENT_DIR/environments.yml"
}

# ─── Project detection ────────────────────────────────────────────────────────

detect_project() {
  if [[ -f ".vercel/project.json" ]]; then
    VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-$(jq -r '.projectId' .vercel/project.json)}"
    if [[ -z "${VERCEL_TEAM_ID:-}" ]]; then
      VERCEL_TEAM_ID="$(jq -r '.orgId // empty' .vercel/project.json)"
    fi
  fi

  [[ -n "${VERCEL_PROJECT_ID:-}" ]] \
    || err "Could not detect Vercel project ID. Set VERCEL_PROJECT_ID or run from a Vercel project directory."

  log "Project: $VERCEL_PROJECT_ID${VERCEL_TEAM_ID:+ (team: $VERCEL_TEAM_ID)}"
}

# ─── Vercel API helpers ───────────────────────────────────────────────────────

vercel_api() {
  local path="$1"
  local method="${2:-GET}"
  local data="${3:-}"

  local url="${VERCEL_API}${path}"
  if [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
    if [[ "$url" == *"?"* ]]; then
      url="${url}&teamId=${VERCEL_TEAM_ID}"
    else
      url="${url}?teamId=${VERCEL_TEAM_ID}"
    fi
  fi

  if [[ -n "$data" ]]; then
    curl -sf --http1.1 -X "$method" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data" "$url"
  else
    curl -sf --http1.1 -X "$method" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
  fi
}

list_env_vars() {
  local url="/v9/projects/${VERCEL_PROJECT_ID}/env?limit=100"
  local result next
  result="$(vercel_api "$url")"
  # Follow pagination until exhausted
  while next="$(echo "$result" | jq -r '.pagination.next // empty')" && [[ -n "$next" ]]; do
    local page
    page="$(vercel_api "/v9/projects/${VERCEL_PROJECT_ID}/env?limit=100&since=${next}")"
    result="$(jq -s '.[0].envs += .[1].envs | .[0].pagination = .[1].pagination | .[0]' \
      <(echo "$result") <(echo "$page"))"
  done
  echo "$result"
}

# ─── Target resolution ────────────────────────────────────────────────────────

# Maps deployment environment names to Vercel target names.
# Matches the target_map defined in templates/terraform/main.tf.
vercel_target() {
  case "$1" in
    production)  echo "production" ;;
    staging)     echo "preview" ;;
    preview)     echo "preview" ;;
    development) echo "development" ;;
    *)           echo "$1" ;;
  esac
}

# ─── Deployment config parsing ────────────────────────────────────────────────

# Prints active environment names from environments.yml, one per line.
list_active_envs() {
  python3 - "${DEPLOYMENT_DIR}/environments.yml" <<'PYEOF'
import yaml, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)
for env in (data.get('active') or []):
    print(env)
PYEOF
}

# Reads a deployment YAML file and outputs null-delimited key\0value\0 pairs.
# Skips null and empty values, matching Terraform's `if v != null && v != ""` guard.
# Numeric and boolean YAML values are stringified.
parse_deployment_env() {
  python3 - "$1" <<'PYEOF'
import yaml, sys
with open(sys.argv[1]) as f:
    data = yaml.safe_load(f) or {}
for k, v in data.items():
    sv = str(v).lower() if isinstance(v, bool) else (str(v) if v is not None else '')
    if sv:
        sys.stdout.buffer.write((str(k) + '\0' + sv + '\0').encode())
PYEOF
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  check_prereqs
  detect_project

  local active_envs
  active_envs="$(list_active_envs)"
  [[ -n "$active_envs" ]] \
    || err "No active environments found in ${DEPLOYMENT_DIR}/environments.yml"

  local env_list
  if [[ "$TARGET_ENV" == "all" ]]; then
    env_list="$active_envs"
  else
    echo "$active_envs" | grep -qx "$TARGET_ENV" \
      || err "--env '$TARGET_ENV' not in active environments: $(echo "$active_envs" | paste -sd ', ' -)"
    env_list="$TARGET_ENV"
  fi

  local env_count
  env_count="$(echo "$env_list" | grep -c .)"

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run — no changes will be made"
    while IFS= read -r env_name; do
      [[ -z "$env_name" ]] && continue
      local env_file="${DEPLOYMENT_DIR}/${env_name}.yml"
      if [[ ! -f "$env_file" ]]; then
        warn "No config file for '$env_name': $env_file"
        continue
      fi
      local vercel_env
      vercel_env="$(vercel_target "$env_name")"
      log "Would sync $env_name → $vercel_env:"
      local key value
      while IFS= read -r -d $'\0' key && IFS= read -r -d $'\0' value; do
        log "  Would sync: $key"
      done < <(parse_deployment_env "$env_file")
    done <<< "$env_list"
    return
  fi

  local all_envs
  all_envs="$(list_env_vars)"

  local total_updated=0 total_created=0

  while IFS= read -r env_name; do
    [[ -z "$env_name" ]] && continue

    local env_file="${DEPLOYMENT_DIR}/${env_name}.yml"
    if [[ ! -f "$env_file" ]]; then
      warn "No config file for '$env_name': $env_file — skipping"
      continue
    fi

    local vercel_env
    vercel_env="$(vercel_target "$env_name")"
    log "Syncing $env_name → $vercel_env..."

    local keys=() values=()
    local key value
    while IFS= read -r -d $'\0' key && IFS= read -r -d $'\0' value; do
      keys+=("$key")
      values+=("$value")
    done < <(parse_deployment_env "$env_file")

    local total="${#keys[@]}"
    if [[ "$total" -eq 0 ]]; then
      warn "No variables found in $env_file — skipping"
      continue
    fi

    local updated=0 created=0 i
    for (( i = 0; i < total; i++ )); do
      local k="${keys[$i]}"
      local v="${values[$i]}"

      # Find any existing record for this key that targets this environment
      local existing_id
      existing_id="$(echo "$all_envs" | jq -r \
        --arg k "$k" --arg t "$vercel_env" \
        'first(.envs[] | select(.key == $k and (.target | index($t) != null)) | .id) // empty')"

      if [[ -n "$existing_id" ]]; then
        # Update the value in place; leave target and type unchanged
        local patch_payload
        patch_payload="$(jq -n --arg v "$v" '{value: $v}')"
        vercel_api "/v9/projects/${VERCEL_PROJECT_ID}/env/${existing_id}" PATCH "$patch_payload" >/dev/null
        log "  Updated : $k"
        (( updated++ )) || true
      else
        # Create a new plain-text record for this key and target
        local create_payload
        create_payload="$(jq -n --arg k "$k" --arg v "$v" --arg t "$vercel_env" \
          '{key: $k, value: $v, target: [$t], type: "plain"}')"
        vercel_api "/v10/projects/${VERCEL_PROJECT_ID}/env" POST "$create_payload" >/dev/null
        log "  Created : $k"
        (( created++ )) || true
      fi
    done

    log "  $env_name — $created created, $updated updated"
    (( total_created += created )) || true
    (( total_updated += updated )) || true

    # Re-fetch so subsequent environments see up-to-date state
    [[ "$env_count" -gt 1 ]] && all_envs="$(list_env_vars)"

  done <<< "$env_list"

  log "Done — $total_created created, $total_updated updated across all target environments."
}

main "$@"
