#!/usr/bin/env bats

setup() {
  SCRIPT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$SCRIPT_DIR/scripts/rotate-keys.sh"

  # Isolated temp workspace so each test gets a clean PATH and working dir.
  # BIN_DIR is prepended to PATH so stubs shadow everything — including any
  # system-installed vercel. Tools that ARE at system paths (/usr/bin/jq,
  # /usr/bin/curl, /opt/homebrew/bin/gcloud) keep their stubs throughout the
  # suite; we don't test "missing gcloud/jq/curl" because removing a BIN_DIR
  # stub still leaves the system binary visible.
  WORK_DIR="$(mktemp -d)"
  BIN_DIR="$WORK_DIR/bin"
  mkdir -p "$BIN_DIR"
  export PATH="$BIN_DIR:$PATH"

  export VERCEL_TOKEN="test-token"

  # Default no-op stubs for all required tools
  _stub vercel   'echo "rmartz"'
  _stub gcloud   'exit 0'
  _stub jq       'exit 0'
  _stub curl     'exit 0'
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
  [[ "$output" == *"--no-invalidate"* ]]
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

@test "--env staging is accepted (alias for preview)" {
  run "$SCRIPT" --env staging --help
  [ "$status" -eq 0 ]
}

@test "--env preview is accepted" {
  run "$SCRIPT" --env preview --help
  [ "$status" -eq 0 ]
}

@test "--env production is accepted" {
  run "$SCRIPT" --env production --help
  [ "$status" -eq 0 ]
}

@test "--env development is accepted" {
  run "$SCRIPT" --env development --help
  [ "$status" -eq 0 ]
}

@test "--env all is accepted" {
  run "$SCRIPT" --env all --help
  [ "$status" -eq 0 ]
}

@test "--env with invalid value exits 1" {
  run "$SCRIPT" --env bogus
  [ "$status" -eq 1 ]
  [[ "$output" == *"--env must be one of"* ]]
}

@test "--env both is rejected (old alias no longer valid)" {
  run "$SCRIPT" --env both
  [ "$status" -eq 1 ]
  [[ "$output" == *"--env must be one of"* ]]
}

# ─── Prerequisite checks ──────────────────────────────────────────────────────

@test "exits 1 when VERCEL_TOKEN is not set" {
  unset VERCEL_TOKEN
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"VERCEL_TOKEN"* ]]
}

@test "exits 1 when vercel CLI is missing" {
  rm -f "$BIN_DIR/vercel"
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"vercel"* ]]
}

@test "exits 1 when vercel CLI is not authenticated" {
  _stub vercel 'exit 1'  # whoami fails
  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"authenticated"* ]]
}

# ─── Project detection ────────────────────────────────────────────────────────

@test "exits 1 when no project ID and no .vercel/project.json" {
  unset VERCEL_PROJECT_ID

  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"project ID"* ]]
}

@test "reads project ID from .vercel/project.json" {
  mkdir -p "$WORK_DIR/.vercel"
  printf '{"projectId":"prj_test","orgId":"team_test"}' > "$WORK_DIR/.vercel/project.json"

  # Use real jq (available system-wide) for JSON parsing; curl returns no env vars
  rm -f "$BIN_DIR/jq"
  _stub curl 'echo "{\"envs\":[]}"'

  cd "$WORK_DIR" && run "$SCRIPT"
  # Should fail at "No Firebase or Sentry keys found" — meaning it passed project detection
  [[ "$output" == *"No Firebase or Sentry"* ]] || [[ "$output" == *"prj_test"* ]]
}

@test "VERCEL_PROJECT_ID env var overrides project.json" {
  export VERCEL_PROJECT_ID="prj_from_env"

  rm -f "$BIN_DIR/jq"
  _stub curl 'echo "{\"envs\":[]}"'

  run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"prj_from_env"* ]] || [[ "$output" == *"No Firebase or Sentry"* ]]
}

# ─── --no-invalidate flag ─────────────────────────────────────────────────────

@test "--no-invalidate is accepted without error" {
  run "$SCRIPT" --no-invalidate --help
  [ "$status" -eq 0 ]
}
