import { err } from "./logger";

export interface Options {
  targetEnv: string;
  deploymentDir: string;
  dryRun: boolean;
  rotateKeys: boolean;
  invalidateKeys: boolean;
  refreshPreviews?: boolean;
  init?: "all" | "auto" | "firebase" | "sentry";
}

const USAGE = `Usage: sync-env [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from
deployment configuration files. Reads the list of active environments from
deployment/environments.yml and per-environment values from
deployment/{env}.yml.

The development Vercel target is always populated automatically from the same
YAML source as the staging/preview environment. It does not appear in
environments.yml and has no dedicated YAML file; its only distinct resource
is its own Firebase service account key (rotated independently of preview).

Existing variables are updated in place; missing ones are created as plain-type
records. Variables not present in the config files are left untouched.

Pass --rotate-keys to also rotate Firebase and Sentry secrets in the same pass,
triggering a redeployment for production/preview after both steps complete.
Development is included in all operations but has no remote deployment to
redeploy — after syncing, developers run 'vercel env pull' to update .env.local.

OPTIONS:
  --env <name>             Target a specific environment by name as listed in
                           environments.yml, or 'development' for the implicit
                           development target (default: all active environments
                           plus development)
  --deployment-dir <path>  Path to deployment config directory (default: deployment/)
  --rotate-keys            Also rotate Firebase/Sentry secrets and redeploy
  --init [firebase|sentry] Bootstrap initial secrets for a fresh project (implies
                           --rotate-keys). Accepts firebase or sentry to target a
                           specific service. Omit to auto-detect: initializes only
                           the services that are missing secrets but have public
                           config vars present. Fails if the target secrets already
                           exist. Each environment (including development) gets its
                           own distinct Firebase key so they can be rotated
                           independently.
  --no-invalidate          (with --rotate-keys) Skip deleting old keys after
                           redeployment
  --refresh-previews       (with --rotate-keys) After rotation completes,
                           redeploy all READY PR preview deployments so their
                           warm Lambda instances pick up the new credentials.
                           Preview deployments are never redeployed automatically
                           when env vars change; this flag forces a refresh.
  --dry-run                Print what would change without making any API calls
  -h, --help               Show this help

AUTHENTICATION (one of):
  VERCEL_TOKEN       Vercel API token (takes precedence when set)
  vercel login       Token is read automatically from the Vercel CLI auth file
                     when VERCEL_TOKEN is not set

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID  Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID     Vercel team/org ID (auto-detected from .vercel/project.json)

ADDITIONAL VARIABLES (required with --rotate-keys):
  SENTRY_AUTH_TOKEN  Sentry API token with project read/write access (required
                     when Sentry DSN is present; must be set in shell environment)

The following are read automatically from the deployment YAML when available
(SENTRY_ORG, SENTRY_PROJECT, FIREBASE_PROJECT_ID, FIREBASE_SA_EMAIL keys).
Shell environment variables are used as a fallback if the YAML key is absent
or empty.

  SENTRY_ORG         Sentry organization slug (SENTRY_ORG in YAML or shell)
  SENTRY_PROJECT     Sentry project slug (SENTRY_PROJECT in YAML or shell)
  GCLOUD_PROJECT     GCP project ID for --init firebase (FIREBASE_PROJECT_ID in
                     YAML or GCLOUD_PROJECT in shell; auto-detected from service
                     account JSON during normal rotation)
  FIREBASE_SA_EMAIL  Firebase service account email for --init firebase
                     (FIREBASE_SA_EMAIL in YAML or shell)

ENVIRONMENT MAPPING:
  production  → production (Vercel target)
  staging     → preview   (Vercel target)
  preview     → preview   (Vercel target)
  development → development (Vercel target, implicit — mirrors staging/preview)
  <other>     → passed through as-is

DEPLOYMENT DIRECTORY LAYOUT:
  deployment/
    environments.yml   # active: [production, staging, ...]
    production.yml     # KEY: value pairs for production
    staging.yml        # KEY: value pairs for staging/preview AND development
    ...

EXAMPLES:
  # Sync all active environments (including development from staging)
  sync-env

  # Sync only the staging environment (not development)
  sync-env --env staging

  # Sync only the development target (sources vars from staging)
  sync-env --env development

  # Sync public vars AND rotate secrets in one pass
  sync-env --rotate-keys --env production

  # Preview what would change without touching Vercel
  sync-env --dry-run`;

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    targetEnv: "all",
    deploymentDir: "deployment",
    dryRun: false,
    rotateKeys: false,
    invalidateKeys: true,
    refreshPreviews: false,
    init: undefined,
  };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--env") {
      opts.targetEnv =
        args[++i] ?? err('--env requires an environment name or "all"');
      if (!opts.targetEnv) err('--env requires an environment name or "all"');
    } else if (arg === "--deployment-dir") {
      opts.deploymentDir = args[++i] ?? err("--deployment-dir requires a path");
      if (!opts.deploymentDir) err("--deployment-dir requires a path");
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--rotate-keys") {
      opts.rotateKeys = true;
    } else if (arg === "--init") {
      const next = args[i + 1];
      if (next === "firebase" || next === "sentry") {
        opts.init = next;
        i++;
      } else {
        opts.init = "auto";
      }
      opts.rotateKeys = true;
    } else if (arg === "--no-invalidate") {
      opts.invalidateKeys = false;
    } else if (arg === "--refresh-previews") {
      opts.refreshPreviews = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else {
      err(`Unknown option: ${arg}. Run 'sync-env --help' for usage.`);
    }
  }

  return opts;
}
