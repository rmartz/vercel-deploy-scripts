#!/usr/bin/env bats

SCRIPT="$BATS_TEST_DIRNAME/../check-conflict-markers.sh"

setup() {
  cd "$BATS_TEST_TMPDIR"
  git init -q
  git config user.email test@example.com
  git config user.name "Test"
}

# Build a file containing conflict markers without embedding literal 7-char
# marker runs in this test file — otherwise committing this test would trip the
# very check it exercises.
write_conflicted_file() {
  local open eq close
  open=$(printf '<%.0s' 1 2 3 4 5 6 7)
  eq=$(printf '=%.0s' 1 2 3 4 5 6 7)
  close=$(printf '>%.0s' 1 2 3 4 5 6 7)
  printf 'line a\n%s HEAD\nours\n%s\ntheirs\n%s branch\nline b\n' \
    "$open" "$eq" "$close" > "$1"
}

@test "exits 1 when staged content contains conflict markers" {
  write_conflicted_file file.txt
  git add file.txt
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"conflict markers"* ]]
}

@test "exits 0 when staged content is clean" {
  printf 'clean content\n' > file.txt
  git add file.txt
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "ignores conflict markers that are not staged" {
  write_conflicted_file file.txt
  # deliberately not 'git add'-ed — the check inspects the index only
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}
