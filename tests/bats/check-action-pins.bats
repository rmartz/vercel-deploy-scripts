#!/usr/bin/env bats

SCRIPT="$BATS_TEST_DIRNAME/../check-action-pins.sh"
SHA="0123456789abcdef0123456789abcdef01234567" # 40-char placeholder

setup() {
  cd "$BATS_TEST_TMPDIR"
  mkdir -p .github/workflows
}

write_workflow() {
  cat > ".github/workflows/wf.yml" <<EOF
name: WF
on: [push]
jobs:
  j:
    runs-on: ubuntu-latest
    steps:
$1
EOF
}

@test "passes when every action is pinned to a SHA" {
  write_workflow "      - uses: actions/checkout@$SHA # v7.0.0"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "fails on a bare tag ref" {
  write_workflow "      - uses: actions/checkout@v7"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"actions/checkout@v7"* ]]
}

@test "fails on a SHA pin with no version comment" {
  write_workflow "      - uses: actions/checkout@$SHA"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"version comment"* ]]
}

@test "fails on a SHA pin whose comment has no version" {
  write_workflow "      - uses: actions/checkout@$SHA # pinned"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"version comment"* ]]
}

@test "fails on a major.minor.patch tag ref" {
  write_workflow "      - uses: actions/setup-node@v6.4.0"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
}

@test "exempts local (./) actions and reusable workflows" {
  write_workflow "      - uses: ./.github/actions/local"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "exempts docker:// image refs" {
  write_workflow "      - uses: docker://alpine:3.18"
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "flags one unpinned ref among several pinned ones" {
  write_workflow "      - uses: actions/checkout@$SHA # v7.0.0
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@$SHA # v6.4.0"
  run bash "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"pnpm/action-setup@v6"* ]]
}
