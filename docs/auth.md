---
type: Module
title: auth
description: Resolves the Vercel API token from VERCEL_TOKEN or the Vercel CLI auth file.
resource: src/lib/auth.ts
tags: [vercel, auth, token]
---

# auth

Resolves the Vercel API token used by every Vercel API call.

## `resolveVercelToken(): string | undefined`

Returns the first available token, in precedence order:

1. The `VERCEL_TOKEN` environment variable (takes precedence when set).
2. The token stored by the Vercel CLI (`vercel login`), read from the
   platform-specific `com.vercel.cli/auth.json`:
   - **macOS**: `~/Library/Application Support/com.vercel.cli/auth.json`
   - **Windows**: `%APPDATA%/com.vercel.cli/auth.json`
   - **Linux/other**: `$XDG_DATA_HOME/com.vercel.cli/auth.json` (falling back to
     `~/.local/share`)

Returns `undefined` when no token is found, the auth file is missing or
malformed, or the CLI token has expired (`expiresAt` in the past). The auth-file
path can be overridden in tests with the `__VERCEL_CLI_AUTH_PATH` env var.

Consumed by [rotation](rotation.md) and [sync-env](sync-env.md), which pass the
resolved token to the [vercel-api](vercel-api.md) client.
