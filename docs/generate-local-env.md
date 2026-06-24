---
type: Script
title: generate-local-env
description: Pulls .env.local from the Vercel development environment via the Vercel CLI.
resource: scripts/generate-local-env.sh
tags: [script, local-dev, vercel-cli]
---

# generate-local-env

A shell helper for local development. Pulls the development environment's
variables into `.env.local` using the Vercel CLI:

```sh
vercel env pull .env.local --environment=development
```

Preflight checks fail early with a clear message if the `vercel` CLI is not
installed or not authenticated (`vercel login`). Exposed as the
`generate-local-env` bin so consuming repos can wire it into a `package.json`
script (e.g. `"env:pull": "generate-local-env"`).
