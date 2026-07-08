#!/usr/bin/env bash
# Fail if any GitHub Action in .github/workflows/ is not pinned to a full 40-char
# commit SHA *with a same-line version comment* (e.g. `# v7.0.0`).
#
# - The SHA is the security boundary: a tag like @v4 is mutable, so a compromised
#   maintainer can move it to a hostile commit; a SHA cannot be moved.
# - The version comment is REQUIRED because Dependabot reads it to keep the pin
#   updated — on a new release it bumps both the SHA and the comment. Without a
#   comment Dependabot cannot determine the current version, so the pin silently
#   freezes.
#
# Local actions / reusable workflows in this repo (`./...`) and Docker image refs
# (`docker://...`) are exempt — they have no upstream release to pin or track.

set -uo pipefail
shopt -s nullglob

violations=0

for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  while IFS= read -r line; do
    # Everything after `uses:`; the ref is the first whitespace-delimited token,
    # the rest is the trailing `# comment` (empty when there is none).
    value="${line#*uses:}"
    read -r ref rest <<<"$value"
    ref="${ref//[\"\']/}"
    case "$ref" in
      ./* | docker://*) continue ;;
    esac
    sha="${ref##*@}"
    if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
      echo "::error file=$wf::'$ref' is not pinned to a commit SHA"
      echo "  $wf: $ref  — pin to a full 40-char commit SHA"
      violations=$((violations + 1))
    elif [[ ! "$rest" =~ (v[0-9]|[0-9]+\.[0-9]+) ]]; then
      echo "::error file=$wf::'$ref' is SHA-pinned but has no version comment"
      echo "  $wf: $ref  — add a same-line '# vX.Y.Z' comment so Dependabot can track it"
      violations=$((violations + 1))
    fi
  done < <(grep -E "^[[:space:]]*-?[[:space:]]*uses:" "$wf")
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "$violations problem(s). Every third-party action must be pinned as:"
  echo "  uses: owner/repo@<40-char-sha> # vX.Y.Z"
  echo "The SHA is immutable (tag-attack hardening); the version comment lets"
  echo "Dependabot keep the pin up to date."
  exit 1
fi

echo "OK — all workflow action refs are SHA-pinned with a version comment."
