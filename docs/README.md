# docs

Reference knowledge for `vercel-deploy-scripts`, structured as a lightweight
[Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
bundle: one markdown page per source unit, each with YAML frontmatter, linked
together as a traversable graph. This file is the OKF `index.md` for the bundle.

These pages are **retrieval reference** for agents and contributors — pull the
page for a unit before working on it. They are not policy; coding standards and
workflow rules live in [CLAUDE.md](../CLAUDE.md). End-user usage lives in the
repo [README](../README.md).

## Frontmatter

Each page carries:

| Field | Required | Meaning |
| ----- | -------- | ------- |
| `type` | yes | One of `Module`, `CLI`, `Script`. |
| `title` | yes | The unit's name. |
| `description` | yes | One-line summary. |
| `resource` | yes | Repo-relative path to the documented source file. |
| `tags` | no | Free-form keywords. |

The `type` vocabulary maps to the codebase: **Module** = a `src/lib/*.ts`
library, **CLI** = the `src/sync-env.ts` entrypoint, **Script** = a shell helper
under `scripts/`.

## Pages

### CLI

- [sync-env](sync-env.md) — entrypoint; syncs public env vars and orchestrates secret rotation.

### Modules

- [auth](auth.md) — resolves the Vercel API token.
- [deployments](deployments.md) — triggers/waits redeployments; refreshes previews.
- [environments](environments.md) — reads deployment YAML config.
- [firebase](firebase.md) — rotates/initializes/invalidates Firebase keys.
- [gcp](gcp.md) — gcloud service-account key wrappers.
- [logger](logger.md) — prefixed logging and FatalError.
- [project](project.md) — detects the Vercel project/team.
- [rotation](rotation.md) — orchestrates Firebase/Sentry rotation.
- [sentry](sentry.md) — rotates/initializes/invalidates Sentry DSN keys.
- [subprocess](subprocess.md) — spawnSync wrappers.
- [vercel-api](vercel-api.md) — typed Vercel REST client.

### Scripts

- [generate-local-env](generate-local-env.md) — pulls `.env.local` from Vercel.
- [secrets-check](secrets-check.md) — pre-commit gitleaks wrapper.
