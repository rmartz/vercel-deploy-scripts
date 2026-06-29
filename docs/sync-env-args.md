---
type: Module
title: sync-env-args
description: Defines the Options type, USAGE help text, and parseArgs for the sync-env CLI.
resource: src/lib/sync-env-args.ts
tags: [cli, args, parsing]
---

# sync-env-args

CLI argument parsing for [sync-env](sync-env.md). Contains the `Options`
interface, the `USAGE` help string, and `parseArgs`.

## `Options`

The options object produced by `parseArgs` and consumed by the rest of the
`sync-env` pipeline:

| Field             | Type                                                     | Description                                      |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `targetEnv`       | `string`                                                 | Environment to target (`"all"` by default).      |
| `deploymentDir`   | `string`                                                 | Path to the deployment config directory.         |
| `dryRun`          | `boolean`                                                | Print intended changes without making API calls. |
| `rotateKeys`      | `boolean`                                                | Also rotate Firebase/Sentry secrets.             |
| `invalidateKeys`  | `boolean`                                                | Delete old keys after rotation (default `true`). |
| `refreshPreviews` | `boolean \| undefined`                                   | Redeploy PR preview deployments after rotation.  |
| `init`            | `"all" \| "auto" \| "firebase" \| "sentry" \| undefined` | Bootstrap mode for `--init`.                     |

## `parseArgs(argv): Options`

Parses `process.argv`-style arguments into an `Options` object. Exits with
usage text when `-h`/`--help` is passed; calls `err()` on unknown flags or
missing required values.

Consumed by [sync-env](sync-env.md) (re-exported from there) and
[sync-env-init](sync-env-init.md).
