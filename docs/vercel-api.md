---
type: Module
title: vercel-api
description: VercelClient — a typed wrapper over the Vercel REST API for env vars and deployments.
resource: src/lib/vercel-api.ts
tags: [vercel, api, client, http]
---

# vercel-api

`VercelClient` is the single typed gateway to the Vercel REST API. Constructed
with a token, project id, and optional team id (the team id is appended as a
`teamId` query param on every request).

## Environment variables

- `listEnvVars()` — lists all project env vars, transparently following
  pagination.
- `getEnvVarValue(envId)` — fetches the decrypted value of one env var.
- `createEnvVar` / `updateEnvVar` / `deleteEnvVar` — CRUD on env vars.
- `findEnvVar(envs, key, target)` — finds an env var matching a key and target.
- `setEnvForTarget(key, value, target, allEnvs, type?)` — delete-then-create
  upsert for a target, re-fetching to confirm the write landed.

## Deployments

- `getLatestDeployment(target)` — the most recent `READY` deployment for a
  target (strips control characters before parsing the response).
- `triggerRedeployment(deploymentId, name, target?)` — queues a redeploy and
  returns the new deployment id.
- `listPreviewDeployments()` — `READY` PR preview deployments (those with
  `target === null`).
- `pollDeploymentStatus(id, maxAttempts?, intervalMs?)` — polls until `READY`,
  throwing on `ERROR`/`CANCELED` or timeout.

Failed requests throw a [FatalError](logger.md). Consumed by
[deployments](deployments.md), [firebase](firebase.md), [sentry](sentry.md),
[rotation](rotation.md), and [sync-env](sync-env.md).
