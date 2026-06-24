---
type: Module
title: subprocess
description: spawnSync wrappers — run() throws on failure, commandExists() checks availability.
resource: src/lib/subprocess.ts
tags: [subprocess, shell, exec]
---

# subprocess

Small synchronous child-process helpers used to shell out to `vercel` and
`gcloud`.

## Exports

- `run(cmd, args, opts?): string` — runs `cmd` via `spawnSync` (UTF-8 encoded by
  default) and returns stdout. Throws when the process fails to spawn or exits
  non-zero, including the captured stderr in the error message.
- `commandExists(cmd): boolean` — returns whether `cmd` is found on `PATH` (via
  `which`).

Used by [gcp](gcp.md) and [rotation](rotation.md).
