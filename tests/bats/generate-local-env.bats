#!/usr/bin/env bats

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/generate-local-env.sh"

setup() {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
}

make_vercel_mock() {
  local whoami_exit="${1:-0}"
  cat > "$BATS_TEST_TMPDIR/bin/vercel" <<EOF
#!/usr/bin/env bash
case "\$1" in
  whoami) exit $whoami_exit ;;
  env) touch .env.local; exit 0 ;;
esac
EOF
  chmod +x "$BATS_TEST_TMPDIR/bin/vercel"
}

@test "exits 1 and prints error when vercel CLI not found" {
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *vercel* ]]
}

@test "exits 1 and prints error when not authenticated" {
  make_vercel_mock 1
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"vercel login"* ]]
}

@test "pulls env and exits 0 when authenticated" {
  make_vercel_mock 0
  cd "$BATS_TEST_TMPDIR"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}
