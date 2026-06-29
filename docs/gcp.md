---
type: Module
title: gcp
description: Thin gcloud CLI wrappers for creating, listing, and deleting service account keys.
resource: src/lib/gcp.ts
tags: [gcp, gcloud, service-account]
---

# gcp

Thin wrappers over the `gcloud iam service-accounts keys` CLI, executed through
[subprocess](subprocess.md). Each throws if `gcloud` is missing or returns a
non-zero exit code.

## Exports

- `createGcpKey(outputFile, saEmail, gcpProject)` — creates a new key for the
  service account and writes the JSON to `outputFile`.
- `listUserManagedGcpKeys(saEmail, gcpProject): string[]` — returns the key ids
  (basenames) of all **user-managed** keys for the service account.
- `deleteGcpKey(keyId, saEmail, gcpProject)` — deletes a single key.

Used by [firebase](firebase.md) for key rotation and invalidation.
