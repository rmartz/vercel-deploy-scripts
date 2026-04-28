#!/usr/bin/env bats

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/secrets-check.sh"

setup() {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
}

make_gitleaks_mock() {
  local exit_code="${1:-0}"
  cat > "$BATS_TEST_TMPDIR/bin/gitleaks" <<EOF
#!/usr/bin/env bash
exit $exit_code
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/gitleaks"
}

make_gitleaks_recording_mock() {
  cat > "$BATS_TEST_TMPDIR/bin/gitleaks" <<EOF
#!/usr/bin/env bash
echo "\$@" > "$BATS_TEST_TMPDIR/gitleaks-args"
exit 0
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/gitleaks"
}

@test "exits 0 and prints warning when gitleaks is not installed" {
  run env PATH="$BATS_TEST_TMPDIR/bin:/usr/bin:/bin" bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"gitleaks not installed"* ]]
}

@test "exits 0 when gitleaks is installed and finds no secrets" {
  make_gitleaks_mock 0
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "exits 1 when gitleaks is installed and finds secrets" {
  make_gitleaks_mock 1
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
}

@test "passes --config flag through to gitleaks" {
  make_gitleaks_recording_mock
  run bash "$SCRIPT" --config /tmp/custom.toml
  [ "$status" -eq 0 ]
  grep -q "/tmp/custom.toml" "$BATS_TEST_TMPDIR/gitleaks-args"
}
