---
type: Module
title: environments
description: Reads deployment YAML — the active env list, per-env variables, and env-to-Vercel target mapping.
resource: src/lib/environments.ts
tags: [config, yaml, environments]
---

# environments

Parses the consuming repo's `deployment/` YAML configuration. Pure file/YAML
reading with no network access.

## `listActiveEnvs(deploymentDir): string[]`

Reads `deployment/environments.yml` and returns its `active:` array (or `[]`
when absent).

## `parseDeploymentEnv(deploymentDir, envName): Record<string, string>`

Reads `deployment/{envName}.yml` and returns its key/value pairs as strings.
Supports both the flat format (`KEY: value`) and the nested format
(`{ environment: ..., variables: { KEY: value } }`). Null and empty values are
skipped; booleans are lowercased to `"true"` / `"false"`. Returns `{}` when the
file is missing, empty, or its root is a scalar/array.

## `vercelTarget(envName): string`

Maps a deployment environment name to its Vercel target: `production` →
`production`, `staging`/`preview` → `preview`, `development` → `development`. Any
other name is passed through unchanged.

Consumed by [sync-env](sync-env.md), which uses these to decide which variables
to upsert to which Vercel target.
