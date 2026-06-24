---
type: Module
title: logger
description: Prefixed log/warn helpers plus the FatalError type and err() throw helper.
resource: src/lib/logger.ts
tags: [logging, errors]
---

# logger

Console output and fatal-error signalling shared across the codebase. Every
message is prefixed with the script name (derived from `process.argv[1]`).

## Exports

- `log(msg)` — writes `[<script>] <msg>` to stdout.
- `warn(msg)` — writes `[<script>] WARNING: <msg>` to stderr.
- `err(msg): never` — throws a `FatalError`. Its `never` return type lets callers
  write `const x = value ?? err("...")` and have TypeScript narrow `x`.
- `FatalError` — error subclass caught at the [sync-env](sync-env.md) entrypoint
  to print a clean `ERROR:` message and exit 1, distinguishing expected
  user-facing failures from unexpected crashes.
