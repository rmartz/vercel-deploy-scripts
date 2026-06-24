---
type: Module
title: rotation
description: Orchestrates secret rotation and initialization across Firebase and Sentry, then redeploys.
resource: src/lib/rotation.ts
tags: [secrets, rotation, orchestration, firebase, sentry]
---

# rotation

The top-level secret-rotation orchestrator behind `sync-env --rotate-keys` and
`--init`. Coordinates [firebase](firebase.md), [sentry](sentry.md), and
[deployments](deployments.md).

## `run(opts: RotationOptions)`

Steps:

1. **Prerequisites** — verifies `vercel` (and `gcloud` for Firebase flows) are
   installed and that a Vercel token authenticates (via [auth](auth.md) and
   [subprocess](subprocess.md)).
2. **Project + client** — detects the project via [project](project.md) and
   builds a [vercel-api](vercel-api.md) client.
3. **Detect what exists** — scans existing Vercel env vars (scoped to the target)
   for Firebase and Sentry keys. Guards against `--init` over existing secrets
   and against rotating when nothing is present.
4. **Init or rotate** — for `--init`, bootstraps the missing services; otherwise
   rotates Firebase and/or Sentry keys.
5. **Redeploy** — triggers and waits for redeployments.
6. **Invalidate** — unless `--no-invalidate`, deletes the old keys after the
   redeployment is `READY`; otherwise prints the old key ids for manual cleanup.

`RotationOptions` carries the target env, the init mode, and optional Firebase
(`firebaseSaEmail`, `gcpProject`) and Sentry (`sentryOrg`, `sentryProject`)
overrides that fall back to environment variables.
