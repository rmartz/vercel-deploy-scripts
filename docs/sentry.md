---
type: Module
title: sentry
description: Rotates, initializes, and invalidates Sentry project client keys (DSNs) via the Sentry API.
resource: src/lib/sentry.ts
tags: [sentry, secrets, rotation, dsn]
---

# sentry

Manages the Sentry client key (DSN) stored in Vercel. Talks directly to the
Sentry REST API (`SENTRY_AUTH_TOKEN` required; `SENTRY_URL` overrides the
default `https://sentry.io`).

## Exports

- `rotateSentry(targetEnv, client, org?, project?): string` — finds the current
  DSN env var (`NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN`), creates a new Sentry
  project key, writes its public DSN to each target via the
  [vercel-api](vercel-api.md) client, and returns the **old** key id for later
  invalidation.
- `initSentry(targetEnv, client, org?, project?)` — creates a fresh project key
  and pushes `NEXT_PUBLIC_SENTRY_DSN` to each target for a new project.
- `invalidateSentryKey(oldKeyId, org, project)` — deletes the old project key;
  warns rather than throwing if deletion fails.

`org` / `project` come from args, falling back to the `SENTRY_ORG` /
`SENTRY_PROJECT` env vars. Orchestrated by [rotation](rotation.md).
