---
type: Module
title: project
description: Detects the Vercel project and team ID from env vars or .vercel/project.json.
resource: src/lib/project.ts
tags: [vercel, project, config]
---

# project

Resolves which Vercel project and team subsequent API calls target.

## `detectProject(): ProjectConfig`

Returns `{ projectId, teamId? }`, resolving each value in precedence order:

1. The `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` environment variables.
2. `.vercel/project.json` in the current working directory (`projectId` and
   `orgId`).

Throws (via [logger](logger.md)'s `err`) when no project id can be determined
and no `.vercel/project.json` exists.

Consumed by [rotation](rotation.md) and [sync-env](sync-env.md) to construct the
[vercel-api](vercel-api.md) client.
