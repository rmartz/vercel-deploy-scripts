#!/usr/bin/env bash
# Fail if any GitHub Action referenced in .github/workflows/ uses a mutable ref
# (a tag or branch) instead of a full 40-char commit SHA. A tag like @v4 is
# mutable — a compromised maintainer can move it to a hostile commit and every
# workflow picks it up — so we pin to the immutable SHA, keeping the version in
# a same-line `# vX.Y.Z` comment (Dependabot keeps both in sync). See AGENTS.md.
#
# Local actions / reusable workflows in this repo (`./...`) and Docker image
# refs (`docker://...`) are exempt — they have no upstream tag to pin.

set -uo pipefail

shopt -s nullglob
violations=0

for wf in .github/workflows/*.yml .github/workflows/*.yaml; do
  while IFS= read -r ref; do
    case "$ref" in
      ./* | docker://*) continue ;;
    esac
    sha="${ref##*@}"
    if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
      echo "::error file=$wf::unpinned action ref '$ref' — pin to a full commit SHA"
      echo "  $wf: $ref"
      violations=$((violations + 1))
    fi
  done < <(grep -oE "uses:[[:space:]]*[^[:space:]#]+" "$wf" \
    | sed -E "s/^uses:[[:space:]]*//" \
    | tr -d "\"'")
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "$violations unpinned action ref(s). Pin each to the full commit SHA the"
  echo "tag resolves to, keeping the version in a same-line comment, e.g.:"
  echo "  uses: actions/checkout@<40-char-sha> # v7.0.0"
  exit 1
fi

echo "OK — all workflow action refs are pinned to a commit SHA."
