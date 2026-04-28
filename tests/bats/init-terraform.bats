#!/usr/bin/env bats

SCRIPT="$BATS_TEST_DIRNAME/../../scripts/init-terraform.sh"

setup() {
  cd "$BATS_TEST_TMPDIR"
}

@test "copies terraform templates into target directory" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [ -d "terraform" ]
  [ -f ".github/workflows/terraform-plan.yml" ]
}

@test "skips terraform/ if it already exists" {
  mkdir -p terraform
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"terraform/"*"already exists"* ]] || [[ "$output" == *"skipping"* ]]
}

@test "skips workflow file if it already exists" {
  mkdir -p .github/workflows
  cp "$(dirname "$SCRIPT")/../templates/workflows/terraform-plan.yml" .github/workflows/terraform-plan.yml
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"terraform-plan.yml"*"already exists"* ]] || [[ "$output" == *"skipping"* ]]
}
