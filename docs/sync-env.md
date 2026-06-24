---
type: CLI
title: sync-env
description: CLI entrypoint — syncs public env vars from deployment YAML and orchestrates secret rotation.
resource: src/sync-env.ts
tags: [cli, sync, env-vars, entrypoint]
---

# sync-env

The package's primary CLI. Upserts public (non-secret) environment variables to
a Vercel project from `deployment/` YAML, and optionally rotates Firebase/Sentry
secrets in the same pass.

## Flags

| Flag | Effect |
| ---- | ------ |
| `--env <name>` | Target one environment (default: all active + development). |
| `--deployment-dir <path>` | Config directory (default: `deployment/`). |
| `--rotate-keys` | Also rotate Firebase/Sentry secrets and redeploy. |
| `--init [firebase\|sentry]` | Bootstrap secrets for a fresh project (implies `--rotate-keys`); omit the value to auto-detect. |
| `--no-invalidate` | With rotation, keep the old keys after redeploy. |
| `--refresh-previews` | With rotation, redeploy active PR previews afterward. |
| `--dry-run` | Print intended changes without any API calls. |
| `-h`, `--help` | Show usage. |

## Flow

1. `parseArgs` builds the `Options`.
2. `run` checks prerequisites, detects the project ([project](project.md)), and
   reads the active env list and per-env vars ([environments](environments.md)).
3. Public vars are upserted per environment via the
   [vercel-api](vercel-api.md) client. The implicit **development** target
   mirrors the staging/preview source YAML.
4. When `--rotate-keys`/`--init` is set, it delegates to
   [rotation](rotation.md) (Sentry once project-wide; Firebase per-env), then
   optionally refreshes previews ([deployments](deployments.md)).

The entrypoint catches [FatalError](logger.md) to print a clean message and exit
1. See the repo [README](../README.md) for end-to-end usage and the
   `deployment/` layout.
