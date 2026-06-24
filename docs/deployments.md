---
type: Module
title: deployments
description: Triggers and waits for Vercel redeployments, and refreshes PR preview deployments.
resource: src/lib/deployments.ts
tags: [vercel, deployments, redeploy]
---

# deployments

Drives Vercel redeployments after secrets change so running deployments pick up
the new credentials. Built on the [vercel-api](vercel-api.md) client.

## `triggerAndWaitRedeployments(targetEnv, client)`

For each Vercel target implied by `targetEnv` (`all` expands to production,
preview, development):

- Skips `development` — it has no remote deployment target.
- Finds the latest `READY` deployment for the target (production →
  `production`, everything else → `staging`), redeploys it, and collects the new
  deployment id.
- After queueing all redeployments, polls each to `READY` (60 attempts, 10s
  interval) before returning.

Environments with no `READY` deployment are warned about and skipped.

## `refreshPreviewDeployments(client)`

Redeploys every active PR preview deployment (those with `target === null`) so
their warm Lambda instances pick up rotated credentials. Preview deployments are
never redeployed automatically on env-var change; this is the explicit refresh
behind `sync-env --refresh-previews`. Polls each to `READY` before returning.

Consumed by [rotation](rotation.md) and [sync-env](sync-env.md).
