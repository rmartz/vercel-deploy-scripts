# vercel-deploy-scripts

Shared deployment and security tooling for Firebase + Next.js projects hosted on Vercel. Consumed as a git dependency — no registry needed.

## Installation

```json
{
  "dependencies": {
    "vercel-deploy-scripts": "github:rmartz/vercel-deploy-scripts#v2.3.3"
  }
}
```

Then run `pnpm install` (or `npm install` / `yarn`).

## What's included

| Tool / Asset                             | Purpose                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `sync-env` CLI                           | Sync public env vars and rotate Firebase/Sentry secrets to Vercel          |
| `generate-local-env`                     | Pull `.env.local` from your Vercel preview environment                     |
| `secrets-check`                          | Pre-commit gitleaks wrapper; skips gracefully if gitleaks is not installed |
| `init-terraform`                         | Copy the bundled Terraform template into a consuming repo                  |
| `.gitleaks.toml`                         | Base gitleaks config for consuming repos to extend                         |
| `.github/workflows/secret-scan.yml`      | Reusable GitHub Actions workflow for CI secret scanning                    |
| `templates/terraform/`                   | Terraform config for managing Vercel env vars from YAML files              |
| `templates/workflows/terraform-plan.yml` | Companion GitHub Actions workflow for Terraform validate/plan              |

---

## `sync-env`

The primary tool. It reads environment variable definitions from a `deployment/` directory in the consuming repo and syncs them to the Vercel project API. It can also rotate Firebase service account keys and Sentry auth tokens in a single coordinated pass.

### Deployment directory layout

```
deployment/
  environments.yml      # active: [production, staging, ...]
  production.yml        # KEY: value pairs for the production environment
  staging.yml           # KEY: value pairs for staging
  development.yml       # KEY: value pairs for development (local use)
  ...
```

`environments.yml` must use the `active:` key (not `environments:` or any other):

```yaml
active:
  - production
  - staging
  - development
```

### Environment → Vercel target mapping

| Name in `environments.yml` | Vercel target  |
| -------------------------- | -------------- |
| `production`               | `production`   |
| `staging`                  | `preview`      |
| `preview`                  | `preview`      |
| `development`              | `development`  |
| anything else              | passed through |

### Authentication

One of the following is required:

- `VERCEL_TOKEN` environment variable (takes precedence)
- Vercel CLI auth file (`vercel login`) — read automatically when `VERCEL_TOKEN` is not set

Project and team IDs are auto-detected from `.vercel/project.json` and can be overridden with `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID`.

> **Note**: `sync-env` reads `VERCEL_TOKEN`. The bundled Terraform workflow reads `VERCEL_API_TOKEN`. Both hold a Vercel API token — set the right name for each tool.

### Usage

```
sync-env [OPTIONS]
```

| Option                        | Description                                                             |
| ----------------------------- | ----------------------------------------------------------------------- |
| `--env <name>`                | Target one environment by name (default: all active environments)       |
| `--deployment-dir <path>`     | Path to deployment config directory (default: `deployment/`)            |
| `--rotate-keys`               | Also rotate Firebase/Sentry secrets and trigger redeployment            |
| `--init [firebase or sentry]` | Bootstrap initial secrets for a fresh project (implies `--rotate-keys`) |
| `--no-invalidate`             | With `--rotate-keys`: skip deleting the old keys after redeployment     |
| `--dry-run`                   | Print what would change without making any API calls                    |
| `-h`, `--help`                | Show help                                                               |

### Common workflows

**Sync public variables for all environments:**

```sh
sync-env
```

**Sync a single environment:**

```sh
sync-env --env staging
```

**Rotate Firebase and Sentry secrets and redeploy:**

```sh
sync-env --rotate-keys --env production
```

`--rotate-keys` creates new service account keys / Sentry tokens, writes them to Vercel as encrypted env vars, triggers a redeployment, waits for it to reach `READY`, then deletes the old keys. Pass `--no-invalidate` to skip the deletion step.

**Bootstrap secrets for a new project:**

```sh
sync-env --init              # auto-detect which services are missing
sync-env --init firebase     # Firebase only
sync-env --init sentry       # Sentry only
```

`--init` checks that the target secrets do not already exist, then runs the same rotation flow as `--rotate-keys`. It fails loudly if secrets are already present to prevent accidental overwrites.

**Preview changes without touching Vercel:**

```sh
sync-env --dry-run
```

### Required credentials for `--rotate-keys`

| Variable            | Source                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `SENTRY_AUTH_TOKEN` | Shell environment (required if a Sentry DSN is configured)        |
| `SENTRY_ORG`        | `SENTRY_ORG` key in the deployment YAML, or shell environment     |
| `SENTRY_PROJECT`    | `SENTRY_PROJECT` key in the deployment YAML, or shell environment |

Firebase project and service account details are read from the deployment YAML (`FIREBASE_PROJECT_ID` and `FIREBASE_SA_EMAIL` keys). For `--init firebase`, where no YAML exists yet, set `GCLOUD_PROJECT` (the GCP project ID) and `FIREBASE_SA_EMAIL` in the shell — these are the shell-side equivalents of the YAML keys.

### Development environment exception

When `--rotate-keys` is active, the public var sync step is **skipped** for `development` environments. Development vars are managed locally via `generate-local-env`, and there is no canonical Vercel deployment to redeploy. Key rotation still runs — only the public-var sync and redeployment are skipped.

---

## `generate-local-env`

Pulls `.env.local` from your Vercel preview environment using the Vercel CLI. Requires the [Vercel CLI](https://vercel.com/docs/cli) to be installed and authenticated.

Wire it into your `package.json`:

```json
{
  "scripts": {
    "env:pull": "generate-local-env"
  }
}
```

---

## `secrets-check`

A pre-commit gitleaks wrapper. If gitleaks is not installed it warns and exits 0 so developers are never blocked; the CI secret-scan workflow enforces the scan unconditionally.

Wire it into your Husky pre-commit hook (`.husky/pre-commit`):

```sh
#!/usr/bin/env sh
npx lint-staged
secrets-check
```

---

## Gitleaks config

Extend the base config in your repo's `.gitleaks.toml`:

```toml
[extend]
path = "node_modules/vercel-deploy-scripts/.gitleaks.toml"

# Add project-specific rules or allowlist entries below
```

---

## CI secret scan

Reference the reusable workflow from your own workflow file:

```yaml
jobs:
  secret-scan:
    uses: rmartz/vercel-deploy-scripts/.github/workflows/secret-scan.yml@v2.3.3
```

The workflow checks out your repo with full history and runs gitleaks. If a `.gitleaks.toml` exists in your repo root it is picked up automatically. To supply a custom config path:

```yaml
jobs:
  secret-scan:
    uses: rmartz/vercel-deploy-scripts/.github/workflows/secret-scan.yml@v2.3.3
    with:
      config-path: .github/gitleaks.toml
```

---

## Terraform environment variable management

`templates/terraform/` contains a ready-to-use Terraform configuration that manages Vercel environment variables from the same `deployment/` YAML files that `sync-env` reads. It creates `vercel_project_environment_variable` resources for every non-empty value and maps `staging → preview` for the Vercel target.

### Initialize a consuming repo

Run once after installing this package:

```sh
npx init-terraform
```

This copies:

- `node_modules/vercel-deploy-scripts/templates/terraform/` → `terraform/`
- `node_modules/vercel-deploy-scripts/templates/workflows/terraform-plan.yml` → `.github/workflows/terraform-plan.yml`

The script is idempotent — it warns and skips any destination that already exists.

After running it:

1. Copy `terraform/terraform.tfvars.example` → `terraform/terraform.tfvars` and fill in `vercel_project_id` (and optionally `vercel_team_id`).
2. Add `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (if applicable), and `VERCEL_API_TOKEN` to your GitHub Actions secrets. Note: the Terraform workflow uses `VERCEL_API_TOKEN`, while `sync-env` uses `VERCEL_TOKEN` — both hold a Vercel API token but must be set under the correct name for each tool.
3. Run `cd terraform && terraform init`.

### CI workflow

`init-terraform` copies `terraform-plan.yml` to `.github/workflows/terraform-plan.yml`. It triggers on pull requests to the default branch:

- Every PR: `terraform validate` runs unconditionally to catch syntax errors.
- `terraform plan` runs only when `VERCEL_API_TOKEN` is present, so forks are not blocked.

### State management

By default Terraform stores state locally in `terraform/terraform.tfstate`. For team use, uncomment one of the remote backend blocks in the copied `main.tf` and run `terraform init -migrate-state`.

---

## Peer requirements

- Node.js ≥ 18
- [Vercel CLI](https://vercel.com/docs/cli) (for `generate-local-env`)
- [gitleaks](https://github.com/gitleaks/gitleaks) (for `secrets-check`; optional locally, enforced in CI)
- [Terraform CLI](https://developer.hashicorp.com/terraform/install) ≥ 1.0 (for the Terraform template; not required for `sync-env`)
