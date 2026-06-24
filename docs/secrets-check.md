---
type: Script
title: secrets-check
description: Pre-commit gitleaks wrapper that skips gracefully when gitleaks is not installed.
resource: scripts/secrets-check.sh
tags: [script, secrets, gitleaks, pre-commit]
---

# secrets-check

A pre-commit gitleaks wrapper, exposed as the `secrets-check` bin. Runs:

```sh
gitleaks protect --staged --config <config>
```

The config defaults to the repo-root `.gitleaks.toml` and can be overridden with
`--config <path>`. If `gitleaks` is not installed it prints a notice and exits 0,
so developers are never blocked locally — the CI secret-scan workflow enforces
the scan unconditionally.

Wire it into a Husky `.husky/pre-commit` hook alongside `lint-staged`. See the
repo [README](../README.md) for the gitleaks config and CI workflow details.
