---
type: Module
title: sync-env-init
description: Implements --init detection, prerequisite validation, and auto-detection logic for sync-env.
resource: src/lib/sync-env-init.ts
tags: [init, firebase, sentry]
---

# sync-env-init

Implements the `--init` bootstrap flow for [sync-env](sync-env.md): finding the
development source environment, validating prerequisite configuration, and
auto-detecting which services need initialization.

## `findDevSource(activeEnvs): string | undefined`

Returns the first active environment whose Vercel target is `"preview"` (i.e.
staging). Development always mirrors this environment for public variables and
Firebase SA credentials.

## `validateInitConfig(opts, envList, devSource): void`

Checks that the deployment YAML and shell environment contain the required
credentials for the requested `--init` mode (Firebase, Sentry, or both). Calls
`err()` with a list of missing items when any required configuration is absent.

For `firebase` init: validates `FIREBASE_SA_EMAIL` and `FIREBASE_PROJECT_ID`
(or `GCLOUD_PROJECT`) for each targeted active environment and for development
(via `devSource`).

For `sentry` init: validates `SENTRY_ORG` and `SENTRY_PROJECT` from the
preview/staging environment YAML or shell.

## `resolveAutoInit(deploymentDir, targetEnv, envList, devSource): "all" | "firebase" | "sentry"`

Auto-detects which services to initialize when `--init` is passed without a
value. Scans the deployment YAML for known Firebase and Sentry keys and returns
`"all"`, `"firebase"`, or `"sentry"` accordingly. Calls `err()` when neither
service's keys are present.

Consumed by [sync-env](sync-env.md) during `--init` processing.
