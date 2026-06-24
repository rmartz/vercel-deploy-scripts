---
type: Module
title: firebase
description: Rotates, initializes, and invalidates Firebase service account keys across Vercel environments.
resource: src/lib/firebase.ts
tags: [firebase, secrets, rotation, gcp]
---

# firebase

Manages Firebase service account credentials stored in Vercel. Creates new GCP
keys via [gcp](gcp.md) and writes them through the [vercel-api](vercel-api.md)
client.

## Key patterns

Two storage layouts are auto-detected by `detectFirebasePattern`:

- **`json`** — a single `FIREBASE_SERVICE_ACCOUNT` env var holding the full
  service-account JSON.
- **`split`** — separate `FIREBASE_PRIVATE_KEY` / `FIREBASE_PRIVATE_KEY_ID` /
  `FIREBASE_CLIENT_EMAIL` (and optionally `FIREBASE_PROJECT_ID`) vars.

The service-account email and GCP project are derived from those vars, falling
back to the `GCLOUD_PROJECT` env var.

## Exports

- `rotateFirebase(targetEnv, client, tempDir)` — mints a fresh GCP key per Vercel
  environment, writes it to Vercel, and returns the old key ids plus the detected
  pattern for later invalidation. Each environment (production, preview,
  development) keeps its own distinct key so they rotate independently.
- `initFirebase(targetEnv, client, tempDir, saEmail?, gcpProject?)` — bootstraps
  `FIREBASE_SERVICE_ACCOUNT` for a fresh project; requires `FIREBASE_SA_EMAIL`
  and `GCLOUD_PROJECT` (via args or env).
- `invalidateFirebaseKeys(client, pattern)` — sweeps all non-active user-managed
  GCP keys for the service accounts in use, skipping accounts whose key ids are
  not fully tracked across environments.

Orchestrated by [rotation](rotation.md).
