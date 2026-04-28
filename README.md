# vercel-deploy-scripts

Shared deployment and security tooling for Firebase + Next.js projects hosted on Vercel. Consumed as a git dependency — no registry needed.

## Installation

```json
{
  "dependencies": {
    "vercel-deploy-scripts": "github:rmartz/vercel-deploy-scripts#v1.0.0"
  }
}
```

Then run `npm install` (or `pnpm install` / `yarn`).

## What's included

| Script               | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `generate-local-env` | Pulls `.env.local` from your Vercel preview environment                    |
| `secrets-check`      | Pre-commit gitleaks wrapper; skips gracefully if gitleaks is not installed |

A base `.gitleaks.toml` is also provided for consuming repos to extend, and a reusable GitHub Actions workflow for secret scanning in CI.

## Scripts

### `generate-local-env`

Requires the [Vercel CLI](https://vercel.com/docs/cli) to be installed and authenticated. Wire it into your `package.json`:

```json
{
  "scripts": {
    "env:pull": "generate-local-env"
  }
}
```

### `secrets-check`

A pre-commit gitleaks wrapper. If gitleaks is not installed it warns and exits 0 so developers are never blocked; the CI workflow enforces the scan unconditionally.

Wire it into your Husky pre-commit hook (`.husky/pre-commit`):

```sh
#!/usr/bin/env sh
npx lint-staged
secrets-check
```

## Gitleaks config

Extend the base config in your repo's `.gitleaks.toml`:

```toml
[extend]
path = "node_modules/vercel-deploy-scripts/.gitleaks.toml"

# Add project-specific rules or allowlist entries below
```

## CI secret scan

Reference the reusable workflow from your own workflow file:

```yaml
jobs:
  secret-scan:
    uses: rmartz/vercel-deploy-scripts/.github/workflows/secret-scan.yml@v1
```

## Terraform environment variable management

See `templates/terraform/` for Terraform configuration that manages Vercel environment variables from `deployment/{env}.yml` YAML files. Copy the templates into your repo and follow the README in that directory.

## Peer requirements

- Node.js ≥ 18
- [Vercel CLI](https://vercel.com/docs/cli) (for `generate-local-env`)
- [gitleaks](https://github.com/gitleaks/gitleaks) (for `secrets-check`; optional locally, enforced in CI)
