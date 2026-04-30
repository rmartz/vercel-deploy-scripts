#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

# ─── Defaults ─────────────────────────────────────────────────────────────────

TARGET_ENV="all"
ENV_FILE=".env"
DRY_RUN=false

VERCEL_API="https://api.vercel.com"

# ─── Globals ──────────────────────────────────────────────────────────────────

VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-}"

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from a
local .env file. Existing variables are updated in place; missing ones are
created. Variables not present in the file are left untouched.

OPTIONS:
  --env <env>      Target Vercel environment (default: all)
                     production   Vercel production environment
                     preview      Vercel preview environment (alias: staging)
                     development  Vercel development environment
                     all          All three environments
  --file <path>    Path to .env file to read from (default: .env)
  --dry-run        Print what would change without making any API calls
  -h, --help       Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN       Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID  Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID     Vercel team/org ID (auto-detected from .vercel/project.json)

EXAMPLES:
  # Sync .env to all environments
  sync-env

  # Sync .env.production to the production environment only
  sync-env --env production --file .env.production

  # Preview what would change without touching Vercel
  sync-env --dry-run --file .env.staging
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
        [[ "$TARGET_ENV" =~ ^(production|preview|staging|development|all)$ ]] \
          || err "--env must be one of: production, preview, staging, development, all"
        [[ "$TARGET_ENV" == "staging" ]] && TARGET_ENV="preview"
        shift 2
        ;;
      --file)
        ENV_FILE="${2:-}"
        [[ -n "$ENV_FILE" ]] || err "--file requires a path"
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
  command -v jq   &>/dev/null || missing="${missing} jq"
  command -v curl &>/dev/null || missing="${missing} curl"
  [[ -n "$missing" ]] && err "Missing required tools:$missing"

  [[ -n "${VERCEL_TOKEN:-}" ]] || err "VERCEL_TOKEN environment variable is required"
  [[ -f "$ENV_FILE" ]] || err "Env file not found: $ENV_FILE"
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
    result="$(jq -s '.[0].envs += .[1].envs | .[0]' \
      <(echo "$result") <(echo "$page"))"
  done
  echo "$result"
}

# ─── Target resolution ────────────────────────────────────────────────────────

target_envs() {
  case "$TARGET_ENV" in
    production)  echo "production" ;;
    preview)     echo "preview" ;;
    development) echo "development" ;;
    all)         printf 'production\npreview\ndevelopment\n' ;;
  esac
}

# ─── .env file parsing ────────────────────────────────────────────────────────

# Reads KEY=VALUE lines from a .env file, skipping comments and blank lines.
# Strips optional surrounding single or double quotes from values.
parse_env_file() {
  local file="$1"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" == *=* ]]            || continue
    local key="${line%%=*}"
    local value="${line#*=}"
    # Strip surrounding quotes only when both ends use the same quote character
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
    printf '%s\0%s\0' "$key" "$value"
  done < "$file"
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  check_prereqs
  detect_project

  # Load key=value pairs into parallel arrays (bash 3.2 compatible)
  local keys=() values=()
  local key value
  while IFS= read -r -d $'\0' key && IFS= read -r -d $'\0' value; do
    keys+=("$key")
    values+=("$value")
  done < <(parse_env_file "$ENV_FILE")

  local total="${#keys[@]}"
  [[ "$total" -gt 0 ]] || err "No KEY=VALUE pairs found in $ENV_FILE"
  log "Read $total variable(s) from $ENV_FILE"

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run — no changes will be made"
    local i
    for (( i = 0; i < total; i++ )); do
      log "  Would sync: ${keys[$i]}"
    done
    return
  fi

  local all_envs
  all_envs="$(list_env_vars)"

  local total_updated=0 total_created=0

  while IFS= read -r vercel_env; do
    [[ -z "$vercel_env" ]] && continue
    log "Syncing to $vercel_env..."

    local updated=0 created=0
    local i
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

    log "  $vercel_env — $created created, $updated updated"
    (( total_created += created )) || true
    (( total_updated += updated )) || true

    # Re-fetch so subsequent environments see up-to-date state
    [[ "$TARGET_ENV" == "all" ]] && all_envs="$(list_env_vars)"

  done < <(target_envs)

  log "Done — $total_created created, $total_updated updated across all target environments."
}

main "$@"
