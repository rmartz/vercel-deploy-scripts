#!/usr/bin/env bats

setup() {
  SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$SCRIPT_DIR/scripts/sync-env.sh"

  # Isolated temp workspace so each test gets a clean PATH and working dir.
  # BIN_DIR is prepended to PATH so stubs shadow real tools as needed.
  WORK_DIR="$(mktemp -d)"
  BIN_DIR="$WORK_DIR/bin"
  mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  export VERCEL_TOKEN="test-token"
  export VERCEL_PROJECT_ID="prj_testproject"

  # Create a minimal deployment/ directory with environments.yml and per-env YAMLs
  mkdir -p "$WORK_DIR/deployment"
  printf 'active:\n  - staging\n  - production\n' > "$WORK_DIR/deployment/environments.yml"
  printf 'APP_ENV: staging\nPORT: 3000\n' > "$WORK_DIR/deployment/staging.yml"
  printf 'APP_ENV: production\nDEBUG: false\n' > "$WORK_DIR/deployment/production.yml"

  # Default no-op stubs for curl and jq (real system binaries still available
  # at their system paths; these stubs shadow only the PATH lookup for tests
  # that want to control the response).
  _stub curl 'echo "{\"envs\":[]}"'
  # Use real jq for JSON work — remove stub to fall through to system binary
}

teardown() {
  rm -rf "$WORK_DIR"
}

# Creates a stub executable in BIN_DIR
_stub() {
  local name="$1"
  local body="$2"
  local file="$BIN_DIR/$name"
  printf '#!/usr/bin/env bash\n%s\n' "$body" > "$file"
  chmod +x "$file"
}

# ─── Help ─────────────────────────────────────────────────────────────────────

@test "--help exits 0 and prints usage" {
  run "$SCRIPT" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
  [[ "$output" == *"--env"* ]]
  [[ "$output" == *"--deployment-dir"* ]]
  [[ "$output" == *"--dry-run"* ]]
}

@test "-h exits 0 and prints usage" {
  run "$SCRIPT" -h
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
}

# ─── Argument validation ──────────────────────────────────────────────────────

@test "unknown flag exits 1 with helpful message" {
  run "$SCRIPT" --bogus-flag
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown option"* ]]
}

@test "--env with invalid value exits 1" {
  cd "$WORK_DIR"
  run "$SCRIPT" --env bogus
  [ "$status" -eq 1 ]
  [[ "$output" == *"bogus"* ]]
}

@test "--env with valid value from environments.yml is accepted" {
  cd "$WORK_DIR"
  run "$SCRIPT" --env staging --dry-run
  [ "$status" -eq 0 ]
}

# ─── Prerequisite checks ──────────────────────────────────────────────────────

@test "exits 1 when VERCEL_TOKEN is not set" {
  unset VERCEL_TOKEN
  cd "$WORK_DIR"
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"VERCEL_TOKEN"* ]]
}

@test "exits 1 when deployment directory is missing" {
  run "$SCRIPT" --deployment-dir "$WORK_DIR/nonexistent"
  [ "$status" -eq 1 ]
  [[ "$output" == *"nonexistent"* ]]
}

@test "exits 1 when environments.yml is missing" {
  rm "$WORK_DIR/deployment/environments.yml"
  cd "$WORK_DIR"
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"environments.yml"* ]]
}

# ─── Project detection ────────────────────────────────────────────────────────

@test "exits 1 when no project ID and no .vercel/project.json" {
  unset VERCEL_PROJECT_ID
  cd "$WORK_DIR"
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"project ID"* ]]
}

@test "reads project ID from .vercel/project.json when env var unset" {
  unset VERCEL_PROJECT_ID
  mkdir -p "$WORK_DIR/.vercel"
  printf '{"projectId":"prj_fromfile","orgId":""}' > "$WORK_DIR/.vercel/project.json"
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"prj_fromfile"* ]]
}

# ─── Dry-run output ───────────────────────────────────────────────────────────

@test "--dry-run prints 'Would sync' for each environment without calling curl" {
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"Would sync"* ]]
  [[ "$output" == *"staging"* ]]
  [[ "$output" == *"production"* ]]
}

@test "--dry-run lists variable keys for each environment" {
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"APP_ENV"* ]]
  [[ "$output" == *"PORT"* ]]
}

@test "--dry-run with --env targets only that environment" {
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run --env staging
  [ "$status" -eq 0 ]
  [[ "$output" == *"staging"* ]]
  [[ "$output" != *"production"* ]]
}

# ─── --deployment-dir flag ────────────────────────────────────────────────────

@test "--deployment-dir uses the specified directory instead of default" {
  local alt_dir="$WORK_DIR/alt-deploy"
  mkdir -p "$alt_dir"
  printf 'active:\n  - development\n' > "$alt_dir/environments.yml"
  printf 'API_URL: http://localhost\n' > "$alt_dir/development.yml"

  _stub curl 'echo "curl should not be called" >&2; exit 1'
  run "$SCRIPT" --deployment-dir "$alt_dir" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"development"* ]]
  [[ "$output" == *"API_URL"* ]]
}

# ─── Target mapping ───────────────────────────────────────────────────────────

@test "--dry-run shows staging maps to preview target" {
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run --env staging
  [ "$status" -eq 0 ]
  [[ "$output" == *"staging → preview"* ]]
}

@test "--dry-run shows production maps to production target" {
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run --env production
  [ "$status" -eq 0 ]
  [[ "$output" == *"production → production"* ]]
}

# ─── Missing per-environment config file ──────────────────────────────────────

@test "warns and continues when per-env yml is missing in dry-run" {
  rm "$WORK_DIR/deployment/production.yml"
  _stub curl 'echo "curl should not be called" >&2; exit 1'
  cd "$WORK_DIR"
  run "$SCRIPT" --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARNING"* ]]
  [[ "$output" == *"production"* ]]
  # staging should still have been processed
  [[ "$output" == *"staging"* ]]
}
