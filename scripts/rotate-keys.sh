#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"

# ─── Defaults ─────────────────────────────────────────────────────────────────

TARGET_ENV="all"       # production | preview | staging | development | all
INVALIDATE_KEYS=true

VERCEL_API="https://api.vercel.com"
SENTRY_URL="${SENTRY_URL:-https://sentry.io}"

# ─── Globals ──────────────────────────────────────────────────────────────────

VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-}"

HAS_FIREBASE=false
HAS_SENTRY=false

# Maps Vercel env name → old GCP key ID (populated during rotation, consumed
# during invalidation). Format: "production:KEY_ID preview:KEY_ID ..."
# Stored as parallel arrays for bash 3.2 compatibility.
OLD_FIREBASE_ENVS=()
OLD_FIREBASE_KEYS=()
FIREBASE_SA_EMAIL=""
FIREBASE_GCP_PROJECT=""

OLD_SENTRY_KEY_ID=""
SENTRY_ORG_SLUG=""
SENTRY_PROJECT_SLUG=""

DEPLOYMENT_IDS=()
TEMP_DIR=""

# ─── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR:-}" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# ─── Usage ────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS]

Rotate Firebase service account keys and Sentry DSN keys in a Vercel project.
Each Vercel environment (production, preview, development) is rotated
independently and receives its own GCP service account key.

For each configured provider the script:
  1. Creates a new key (GCP service account key / Sentry project key)
  2. Updates the Vercel environment variable for each targeted environment
  3. Triggers a redeployment and waits for it to finish
  4. Deletes the old key (skippable with --no-invalidate)

Providers are auto-detected from existing Vercel env var names:
  Firebase  FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY
  Sentry    SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN

OPTIONS:
  --env <env>           Which Vercel environment to rotate. One of:
                          production   Vercel production environment
                          preview      Vercel preview environment (alias: staging)
                          development  Vercel development environment
                          all          All environments that have the key set,
                                       plus any that are missing it (default)
  --no-invalidate       Skip deleting old keys after redeployment
  -h, --help            Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN          Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID     Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID        Vercel team/org ID (auto-detected from .vercel/project.json)
  SENTRY_AUTH_TOKEN     Sentry API token (required when Sentry DSN is present)
  SENTRY_ORG            Sentry organization slug (required with Sentry rotation)
  SENTRY_PROJECT        Sentry project slug (required with Sentry rotation)
  SENTRY_URL            Sentry base URL (default: https://sentry.io)
  GCLOUD_PROJECT        GCP project ID (auto-detected from service account JSON)
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
        # Normalise alias
        [[ "$TARGET_ENV" == "staging" ]] && TARGET_ENV="preview"
        shift 2
        ;;
      --no-invalidate)
        INVALIDATE_KEYS=false
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

  command -v vercel &>/dev/null || missing="${missing} vercel"
  command -v gcloud  &>/dev/null || missing="${missing} gcloud"
  command -v jq      &>/dev/null || missing="${missing} jq"
  command -v curl    &>/dev/null || missing="${missing} curl"

  if [[ -n "$missing" ]]; then
    err "Missing required tools:$missing"
  fi

  [[ -n "${VERCEL_TOKEN:-}" ]] || err "VERCEL_TOKEN environment variable is required"

  if ! vercel whoami &>/dev/null; then
    err "Vercel CLI not authenticated. Run: vercel login"
  fi

  TEMP_DIR="$(mktemp -d)"
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
    curl -sf -X "$method" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data" "$url"
  else
    curl -sf -X "$method" \
      -H "Authorization: Bearer ${VERCEL_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
  fi
}

# Returns the decrypted value of a Vercel env var by its record ID.
# Uses the /v1 endpoint which returns the plaintext value.
get_env_value() {
  local env_id="$1"
  vercel_api "/v1/projects/${VERCEL_PROJECT_ID}/env/${env_id}" | jq -r '.value'
}

# Returns raw JSON array of all env var records from the Vercel API.
list_env_vars() {
  vercel_api "/v9/projects/${VERCEL_PROJECT_ID}/env"
}

# Returns the Vercel API env record (JSON) for a specific key and target
# environment, or empty string if not found.
find_env_record() {
  local key="$1"
  local target="$2"   # production | preview | development
  local all_envs="$3" # pre-fetched JSON from list_env_vars

  echo "$all_envs" | jq -r \
    --arg k "$key" --arg t "$target" \
    '.envs[] | select(.key == $k and (.target | index($t) != null))'
}

# Creates a single Vercel env var record for one target environment.
# Uses jq --arg for the value to correctly handle newlines and special chars.
create_env_record() {
  local key="$1"
  local value="$2"
  local target="$3"  # production | preview | development

  local payload
  payload="$(jq -n --arg k "$key" --arg v "$value" --arg t "$target" \
    '{key: $k, value: $v, target: [$t], type: "encrypted"}')"

  vercel_api "/v10/projects/${VERCEL_PROJECT_ID}/env" POST "$payload"
}

# Deletes a Vercel env var record by its ID.
delete_env_record() {
  local env_id="$1"
  vercel_api "/v9/projects/${VERCEL_PROJECT_ID}/env/${env_id}" DELETE >/dev/null
}

# Sets (replace or create) a Vercel env var for a specific target environment.
# Deletes any existing record for that key+target before creating the new one.
# Returns the new record ID via stdout.
set_env_for_target() {
  local key="$1"
  local value="$2"
  local target="$3"
  local all_envs="$4"

  # Delete existing record for this key in this specific target
  local existing_id
  existing_id="$(echo "$all_envs" | jq -r \
    --arg k "$key" --arg t "$target" \
    'first(.envs[] | select(.key == $k and (.target | index($t) != null)) | .id) // empty')"

  if [[ -n "$existing_id" ]]; then
    delete_env_record "$existing_id"
    log "  Removed old $key ($target, id: $existing_id)"
  fi

  local result
  result="$(create_env_record "$key" "$value" "$target")"

  # Read back to confirm — a null id means the record wasn't actually saved
  local new_id
  new_id="$(echo "$result" | jq -r '.id // empty')"
  if [[ -z "$new_id" ]]; then
    # Attempt a read-back to see if it landed anyway
    local all_envs_after
    all_envs_after="$(list_env_vars)"
    new_id="$(echo "$all_envs_after" | jq -r \
      --arg k "$key" --arg t "$target" \
      'first(.envs[] | select(.key == $k and (.target | index($t) != null)) | .id) // empty')"
    [[ -n "$new_id" ]] \
      || err "Failed to confirm $key was saved for $target after write"
  fi

  log "  Set $key for $target (id: $new_id)"
  echo "$new_id"
}

# ─── Target resolution ────────────────────────────────────────────────────────

# Vercel environment names to operate on.
# "all" expands to the three canonical environments; each provider's rotation
# function will skip environments that have no existing key and add the key to
# environments that are missing it (based on the project's actual configuration).
target_envs() {
  case "$TARGET_ENV" in
    production)  echo "production" ;;
    preview)     echo "preview" ;;
    development) echo "development" ;;
    all)         printf 'production\npreview\ndevelopment' ;;
  esac
}

# ─── Provider detection ───────────────────────────────────────────────────────

detect_providers() {
  log "Detecting configured providers..."

  local env_keys
  env_keys="$(list_env_vars | jq -r '.envs[].key')"

  if echo "$env_keys" | grep -qE '^(FIREBASE_SERVICE_ACCOUNT|FIREBASE_PRIVATE_KEY)$'; then
    HAS_FIREBASE=true
    log "  Firebase: service account keys detected"
  else
    log "  Firebase: no service account keys found — skipping"
  fi

  if echo "$env_keys" | grep -qE '^(SENTRY_DSN|NEXT_PUBLIC_SENTRY_DSN)$'; then
    HAS_SENTRY=true
    log "  Sentry: DSN detected"
  else
    log "  Sentry: no DSN found — skipping"
  fi

  if [[ "$HAS_FIREBASE" == false && "$HAS_SENTRY" == false ]]; then
    err "No Firebase or Sentry keys found in this Vercel project — nothing to rotate."
  fi
}

# ─── Firebase rotation ────────────────────────────────────────────────────────

# Determines which service account pattern the project uses, extracts the
# service account email and GCP project, then returns via globals.
# Sets: FIREBASE_SA_EMAIL, FIREBASE_GCP_PROJECT, FIREBASE_KEY_PATTERN
# FIREBASE_KEY_PATTERN is one of: "json" | "split"
detect_firebase_pattern() {
  local all_envs="$1"

  local sa_json_records private_key_records
  sa_json_records="$(echo "$all_envs" | jq -r '.envs[] | select(.key == "FIREBASE_SERVICE_ACCOUNT") | .id')"
  private_key_records="$(echo "$all_envs" | jq -r '.envs[] | select(.key == "FIREBASE_PRIVATE_KEY") | .id')"

  if [[ -n "$sa_json_records" ]]; then
    FIREBASE_KEY_PATTERN="json"
    # Read the first available service account JSON to extract metadata
    local first_id
    first_id="$(echo "$sa_json_records" | head -1)"
    local sa_json
    sa_json="$(get_env_value "$first_id")"
    FIREBASE_SA_EMAIL="$(echo "$sa_json" | jq -r '.client_email')"
    FIREBASE_GCP_PROJECT="${GCLOUD_PROJECT:-$(echo "$sa_json" | jq -r '.project_id // empty')}"

  elif [[ -n "$private_key_records" ]]; then
    FIREBASE_KEY_PATTERN="split"
    # Read client_email from the first available record
    local ce_records
    ce_records="$(echo "$all_envs" | jq -r '.envs[] | select(.key == "FIREBASE_CLIENT_EMAIL") | .id')"
    [[ -n "$ce_records" ]] \
      || err "FIREBASE_CLIENT_EMAIL not found in Vercel (required alongside FIREBASE_PRIVATE_KEY)"
    FIREBASE_SA_EMAIL="$(get_env_value "$(echo "$ce_records" | head -1)")"

    # GCP project from env var or from any FIREBASE_PROJECT_ID record
    if [[ -z "${GCLOUD_PROJECT:-}" ]]; then
      local pid_records
      pid_records="$(echo "$all_envs" | jq -r '.envs[] | select(.key == "FIREBASE_PROJECT_ID") | .id')"
      if [[ -n "$pid_records" ]]; then
        FIREBASE_GCP_PROJECT="$(get_env_value "$(echo "$pid_records" | head -1)")"
      fi
    else
      FIREBASE_GCP_PROJECT="$GCLOUD_PROJECT"
    fi
  fi

  [[ -n "${FIREBASE_SA_EMAIL:-}" ]]    || err "Could not extract service account email"
  [[ -n "${FIREBASE_GCP_PROJECT:-}" ]] \
    || err "Could not detect GCP project. Set GCLOUD_PROJECT or ensure project_id is in the service account JSON."

  log "  Service account : $FIREBASE_SA_EMAIL"
  log "  GCP project     : $FIREBASE_GCP_PROJECT"
}

# Finds the private_key_id currently stored for a given Vercel environment.
# Returns empty string if not found.
get_firebase_key_id_for_env() {
  local vercel_env="$1"
  local all_envs="$2"

  if [[ "${FIREBASE_KEY_PATTERN:-}" == "json" ]]; then
    local record_id
    record_id="$(echo "$all_envs" | jq -r \
      --arg t "$vercel_env" \
      'first(.envs[] | select(.key == "FIREBASE_SERVICE_ACCOUNT" and (.target | index($t) != null)) | .id) // empty')"
    if [[ -n "$record_id" ]]; then
      get_env_value "$record_id" | jq -r '.private_key_id // empty'
    fi
  else
    local record_id
    record_id="$(echo "$all_envs" | jq -r \
      --arg t "$vercel_env" \
      'first(.envs[] | select(.key == "FIREBASE_PRIVATE_KEY_ID" and (.target | index($t) != null)) | .id) // empty')"
    if [[ -n "$record_id" ]]; then
      get_env_value "$record_id"
    fi
  fi
}

# Creates a new GCP user-managed service account key and returns the path to
# the JSON file (caller must ensure file is eventually deleted).
create_gcp_key() {
  local output_file="$1"
  gcloud iam service-accounts keys create "$output_file" \
    --iam-account="$FIREBASE_SA_EMAIL" \
    --project="$FIREBASE_GCP_PROJECT" \
    --quiet 2>/dev/null
}

# Lists only user-managed service account keys for the project's SA.
list_user_managed_gcp_keys() {
  gcloud iam service-accounts keys list \
    --iam-account="$FIREBASE_SA_EMAIL" \
    --project="$FIREBASE_GCP_PROJECT" \
    --managed-by=user \
    --format='value(name.basename())' 2>/dev/null
}

rotate_firebase() {
  log "Rotating Firebase service account keys..."

  local all_envs
  all_envs="$(list_env_vars)"

  detect_firebase_pattern "$all_envs"
  log "  Key pattern: ${FIREBASE_KEY_PATTERN}"

  # Rotate each targeted environment. For "--env all", only environments that
  # already have a Firebase key are rotated — we don't add keys to environments
  # that aren't configured (e.g. a prod/staging project with no development key).
  # When a specific env is given explicitly (e.g. "--env development"), we add
  # the key even if it doesn't exist yet, since that's the explicit intent.
  local rotated_any=false

  while IFS= read -r vercel_env; do
    [[ -z "$vercel_env" ]] && continue

    # Read old key ID before creating the new one
    local old_key_id
    old_key_id="$(get_firebase_key_id_for_env "$vercel_env" "$all_envs")"

    if [[ -z "$old_key_id" ]]; then
      if [[ "$TARGET_ENV" == "all" ]]; then
        log "  [$vercel_env] No existing key — skipping (use --env $vercel_env to explicitly add)"
        continue
      fi
      log "  [$vercel_env] No existing key found — will add"
    else
      log "  [$vercel_env] Current key ID: $old_key_id"
    fi

    log "  [$vercel_env] Rotating..."

    # Create a fresh GCP service account key for this specific environment
    local new_key_file="$TEMP_DIR/key-${vercel_env}.json"
    create_gcp_key "$new_key_file"

    local new_sa_json new_key_id
    new_sa_json="$(cat "$new_key_file")"
    new_key_id="$(echo "$new_sa_json" | jq -r '.private_key_id')"
    log "  [$vercel_env] New key ID: $new_key_id"

    # Re-fetch env vars before each write (state may have changed)
    local current_envs
    current_envs="$(list_env_vars)"

    if [[ "${FIREBASE_KEY_PATTERN:-}" == "json" ]]; then
      set_env_for_target \
        "FIREBASE_SERVICE_ACCOUNT" \
        "$(echo "$new_sa_json" | jq -c .)" \
        "$vercel_env" \
        "$current_envs" >/dev/null
    else
      local new_private_key new_private_key_id
      new_private_key="$(echo "$new_sa_json" | jq -r '.private_key')"
      new_private_key_id="$(echo "$new_sa_json" | jq -r '.private_key_id')"

      set_env_for_target "FIREBASE_PRIVATE_KEY"    "$new_private_key"    "$vercel_env" "$current_envs" >/dev/null
      set_env_for_target "FIREBASE_PRIVATE_KEY_ID" "$new_private_key_id" "$vercel_env" "$current_envs" >/dev/null
      # client_email, project_id, and other static fields don't change between keys
    fi

    # Record old key for post-redeployment invalidation (only if one existed)
    if [[ -n "$old_key_id" ]]; then
      OLD_FIREBASE_ENVS+=("$vercel_env")
      OLD_FIREBASE_KEYS+=("$old_key_id")
    fi

    rotated_any=true

  done < <(target_envs)

  [[ "$rotated_any" == true ]] || err "No Firebase keys rotated — check --env and project configuration"

  log "Firebase key rotation complete."
}

# ─── Sentry rotation ──────────────────────────────────────────────────────────

sentry_api() {
  local path="$1"
  local method="${2:-GET}"
  local data="${3:-}"

  [[ -n "${SENTRY_AUTH_TOKEN:-}" ]] \
    || err "SENTRY_AUTH_TOKEN is required for Sentry key rotation"

  if [[ -n "$data" ]]; then
    curl -sf -X "$method" \
      -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "${SENTRY_URL}/api/0${path}"
  else
    curl -sf -X "$method" \
      -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
      -H "Content-Type: application/json" \
      "${SENTRY_URL}/api/0${path}"
  fi
}

rotate_sentry() {
  log "Rotating Sentry client key..."

  [[ -n "${SENTRY_AUTH_TOKEN:-}" ]] || err "SENTRY_AUTH_TOKEN is required for Sentry rotation"
  [[ -n "${SENTRY_ORG:-}" ]]        || err "SENTRY_ORG is required for Sentry rotation"
  [[ -n "${SENTRY_PROJECT:-}" ]]    || err "SENTRY_PROJECT is required for Sentry rotation"

  SENTRY_ORG_SLUG="$SENTRY_ORG"
  SENTRY_PROJECT_SLUG="$SENTRY_PROJECT"

  local all_envs
  all_envs="$(list_env_vars)"

  # Find which DSN env var name is in use and get its value from the first
  # available environment record (DSN is typically shared across all envs)
  local dsn_key_name dsn_env_id dsn_env_id_found
  dsn_env_id_found=""
  for candidate in "NEXT_PUBLIC_SENTRY_DSN" "SENTRY_DSN"; do
    local found_id
    found_id="$(echo "$all_envs" | jq -r \
      --arg k "$candidate" 'first(.envs[] | select(.key == $k) | .id) // empty')"
    if [[ -n "$found_id" ]]; then
      dsn_key_name="$candidate"
      dsn_env_id_found="$found_id"
      break
    fi
  done

  [[ -n "${dsn_env_id_found:-}" ]] \
    || err "Could not find SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in Vercel"

  local current_dsn
  current_dsn="$(get_env_value "$dsn_env_id_found")"
  log "  DSN env var: $dsn_key_name"

  # List Sentry project keys and find the one matching the current DSN
  local current_keys
  current_keys="$(sentry_api "/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/keys/")"

  local dsn_public_key old_key_id
  dsn_public_key="$(echo "$current_dsn" | sed -E 's|https?://([^@]+)@.*|\1|')"
  old_key_id="$(echo "$current_keys" | jq -r \
    --arg pk "$dsn_public_key" \
    'first(.[] | select(.dsn.public | test($pk; "i")) | .id) // empty')"

  if [[ -z "${old_key_id:-}" ]]; then
    warn "Could not match current DSN to a Sentry project key — old key will not be invalidated"
  else
    log "  Current Sentry key ID: $old_key_id"
  fi

  # Create new Sentry project key
  log "  Creating new Sentry project key..."
  local label="rotated-$(date +%Y%m%d)"
  local new_key
  new_key="$(sentry_api \
    "/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/keys/" \
    POST \
    "$(jq -n --arg n "$label" '{name: $n}')")"

  local new_dsn new_key_id
  new_dsn="$(echo "$new_key" | jq -r '.dsn.public')"
  new_key_id="$(echo "$new_key" | jq -r '.id')"
  log "  New Sentry key ID: $new_key_id"

  # Update all target environments with the new DSN
  while IFS= read -r vercel_env; do
    [[ -z "$vercel_env" ]] && continue
    local current_envs
    current_envs="$(list_env_vars)"
    set_env_for_target "$dsn_key_name" "$new_dsn" "$vercel_env" "$current_envs" >/dev/null
  done < <(target_envs)

  OLD_SENTRY_KEY_ID="${old_key_id:-}"
  log "Sentry key rotation complete."
}

# ─── Redeployment ─────────────────────────────────────────────────────────────

trigger_redeployments() {
  log "Triggering redeployments..."

  while IFS= read -r vercel_env; do
    [[ -z "$vercel_env" ]] && continue

    # Find the latest READY deployment for this environment
    local list_url
    list_url="${VERCEL_API}/v6/deployments?projectId=${VERCEL_PROJECT_ID}&target=${vercel_env}&limit=1&state=READY"
    [[ -n "${VERCEL_TEAM_ID:-}" ]] && list_url="${list_url}&teamId=${VERCEL_TEAM_ID}"

    local deployments latest_id latest_url
    deployments="$(curl -sf -H "Authorization: Bearer ${VERCEL_TOKEN}" "$list_url")"
    latest_id="$(echo "$deployments" | jq -r '.deployments[0].uid // empty')"
    latest_url="$(echo "$deployments" | jq -r '.deployments[0].url // empty')"

    if [[ -z "$latest_id" ]]; then
      warn "No existing deployment found for '$vercel_env' — skipping redeployment"
      continue
    fi

    log "  Redeploying $vercel_env ($latest_url)..."
    local new_deployment new_id
    new_deployment="$(vercel_api "/v13/deployments/${latest_id}/redeploy" POST '{}')"
    new_id="$(echo "$new_deployment" | jq -r '.id')"
    DEPLOYMENT_IDS+=("$new_id")
    log "  Queued: $new_id"

  done < <(target_envs)
}

wait_for_deployments() {
  local count="${#DEPLOYMENT_IDS[@]}"
  [[ "$count" -eq 0 ]] && return

  log "Waiting for $count deployment(s) to finish..."

  local i
  for (( i = 0; i < count; i++ )); do
    local deployment_id="${DEPLOYMENT_IDS[$i]}"
    log "  Polling $deployment_id..."

    local attempts=0
    local max_attempts=60  # 10 min at 10s intervals

    while [[ $attempts -lt $max_attempts ]]; do
      local status
      status="$(vercel_api "/v13/deployments/${deployment_id}" | jq -r '.status')"

      case "$status" in
        READY)
          log "  $deployment_id → READY"
          break
          ;;
        ERROR|CANCELED)
          err "Deployment $deployment_id ended with status: $status"
          ;;
        *)
          log "  $deployment_id → $status (retrying in 10s...)"
          sleep 10
          ;;
      esac

      (( attempts++ )) || true
    done

    [[ $attempts -ge $max_attempts ]] \
      && err "Deployment $deployment_id timed out after 10 minutes"
  done

  log "All deployments ready."
}

# ─── Key invalidation ─────────────────────────────────────────────────────────

invalidate_firebase_keys() {
  log "Invalidating old Firebase keys (sweeping all non-active user-managed keys)..."

  # Build the set of key IDs currently active in Vercel across all three
  # standard environments. This is the authoritative "keep" list — anything
  # outside it is a stray key (old rotation remnants, partially leaked keys,
  # etc.) and should be removed.
  local all_envs_fresh
  all_envs_fresh="$(list_env_vars)"

  local active_keys=""
  for check_env in production preview development; do
    local kid
    kid="$(get_firebase_key_id_for_env "$check_env" "$all_envs_fresh")"
    if [[ -n "$kid" ]]; then
      active_keys="${active_keys} ${kid}"
      log "  Active key [$check_env]: $kid"
    fi
  done

  local user_keys
  user_keys="$(list_user_managed_gcp_keys)"

  local deleted=0
  while IFS= read -r key_id; do
    [[ -z "$key_id" ]] && continue

    if echo "$active_keys" | grep -qF "$key_id"; then
      continue  # currently active — keep
    fi

    log "  Deleting stray key: $key_id"
    if gcloud iam service-accounts keys delete "$key_id" \
        --iam-account="$FIREBASE_SA_EMAIL" \
        --project="$FIREBASE_GCP_PROJECT" \
        --quiet 2>/dev/null; then
      log "  Deleted: $key_id"
      (( deleted++ )) || true
    else
      warn "Failed to delete key $key_id — remove manually:"
      warn "  gcloud iam service-accounts keys delete $key_id --iam-account=$FIREBASE_SA_EMAIL"
    fi
  done <<< "$user_keys"

  if [[ $deleted -eq 0 ]]; then
    log "  No stray keys found."
  else
    log "  Deleted $deleted stray key(s)."
  fi
}

invalidate_sentry_key() {
  if [[ -z "${OLD_SENTRY_KEY_ID:-}" ]]; then
    warn "No old Sentry key ID recorded — skipping Sentry invalidation"
    return
  fi

  log "Invalidating old Sentry key: $OLD_SENTRY_KEY_ID"

  if sentry_api \
      "/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/keys/${OLD_SENTRY_KEY_ID}/" \
      DELETE >/dev/null 2>&1; then
    log "  Old Sentry key deleted."
  else
    warn "Failed to delete Sentry key $OLD_SENTRY_KEY_ID — remove it manually in Sentry project settings."
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"
  check_prereqs
  detect_project
  detect_providers

  log "Target: $TARGET_ENV | Invalidate after redeployment: $INVALIDATE_KEYS"

  # Phase 1: generate new keys and push to Vercel
  [[ "$HAS_FIREBASE" == true ]] && rotate_firebase
  [[ "$HAS_SENTRY"   == true ]] && rotate_sentry

  # Phase 2: redeploy so new env vars take effect
  trigger_redeployments
  wait_for_deployments

  # Phase 3: invalidate old keys now that new deployments are live
  if [[ "$INVALIDATE_KEYS" == true ]]; then
    log "Invalidating old keys..."
    [[ "$HAS_FIREBASE" == true ]] && invalidate_firebase_keys
    [[ "$HAS_SENTRY"   == true ]] && invalidate_sentry_key
  else
    log "Skipping key invalidation (--no-invalidate)"

    local i
    local count="${#OLD_FIREBASE_KEYS[@]}"
    for (( i = 0; i < count; i++ )); do
      warn "Old Firebase key to remove: ${OLD_FIREBASE_KEYS[$i]} (${OLD_FIREBASE_ENVS[$i]}, account: $FIREBASE_SA_EMAIL)"
    done
    [[ -n "${OLD_SENTRY_KEY_ID:-}" ]] \
      && warn "Old Sentry key to remove: $OLD_SENTRY_KEY_ID (project: $SENTRY_ORG_SLUG/$SENTRY_PROJECT_SLUG)"
  fi

  log "Key rotation complete."
}

main "$@"
