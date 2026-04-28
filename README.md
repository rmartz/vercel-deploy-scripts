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

`templates/terraform/` contains a ready-to-use Terraform configuration that manages Vercel environment variables from `deployment/environments.yml` and per-environment `deployment/{env}.yml` YAML files (the same layout used by `firebase-nextjs-template`). It creates `vercel_project_environment_variable` resources for every non-empty value and maps `staging → preview` for the Vercel target.

`templates/workflows/terraform-plan.yml` is a companion GitHub Actions workflow that runs `terraform validate` on every PR and `terraform plan` when secrets are present.

### Initializing a consuming repo

Run the `init-terraform` script once in the root of the consuming repo after installing this package:

```sh
npx init-terraform
```

This copies:

- `node_modules/vercel-deploy-scripts/templates/terraform/` → `terraform/`
- `node_modules/vercel-deploy-scripts/templates/workflows/terraform-plan.yml` → `.github/workflows/terraform-plan.yml`

The script is idempotent — it will warn and skip any destination that already exists.

After running it:

1. Copy `terraform/terraform.tfvars.example` → `terraform/terraform.tfvars` and fill in `vercel_project_id` (and optionally `vercel_team_id`).
2. Add `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (if applicable), and `VERCEL_API_TOKEN` to your GitHub Actions secrets.
3. Run `cd terraform && terraform init`.

## Peer requirements

- Node.js ≥ 18
- [Vercel CLI](https://vercel.com/docs/cli) (for `generate-local-env`)
- [gitleaks](https://github.com/gitleaks/gitleaks) (for `secrets-check`; optional locally, enforced in CI)
