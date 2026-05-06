#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

import {
  listActiveEnvs,
  parseDeploymentEnv,
  vercelTarget,
} from "./lib/environments";
import { resolveVercelToken } from "./lib/auth";
import { FatalError, err, log, warn } from "./lib/logger";
import { detectProject } from "./lib/project";
import { run as rotateKeysRun } from "./lib/rotation";
import { VercelClient } from "./lib/vercel-api";

interface Options {
  targetEnv: string;
  deploymentDir: string;
  dryRun: boolean;
  rotateKeys: boolean;
  invalidateKeys: boolean;
  init?: "all" | "auto" | "firebase" | "sentry";
}

const USAGE = `Usage: sync-env [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from
deployment configuration files. Reads the list of active environments from
deployment/environments.yml and per-environment values from
deployment/{env}.yml.

Existing variables are updated in place; missing ones are created as plain-type
records. Variables not present in the config files are left untouched.

Pass --rotate-keys to also rotate Firebase and Sentry secrets in the same pass,
triggering a redeployment for production/preview after both steps complete.
Development is included in all operations but has no remote deployment to
redeploy — after syncing, developers run 'vercel env pull' to update .env.local.

OPTIONS:
  --env <name>             Target a specific environment by name as listed in
                           environments.yml (default: all active environments)
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
  development → development (Vercel target)
  <other>     → passed through as-is

DEPLOYMENT DIRECTORY LAYOUT:
  deployment/
    environments.yml   # active: [production, staging, ...]
    production.yml     # KEY: value pairs for production
    staging.yml        # KEY: value pairs for staging
    ...

EXAMPLES:
  # Sync all active environments
  sync-env

  # Sync only the staging environment
  sync-env --env staging

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
    } else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else {
      err(`Unknown option: ${arg}. Run 'sync-env --help' for usage.`);
    }
  }

  return opts;
}

function validateInitConfig(opts: Options, envList: string[]): void {
  const needsFirebase = opts.init === "firebase" || opts.init === "all";
  const needsSentry = opts.init === "sentry" || opts.init === "all";

  const missing: string[] = [];

  if (needsFirebase) {
    const targets = opts.targetEnv === "all" ? envList : [opts.targetEnv];

    for (const envName of targets) {
      const envVars = parseDeploymentEnv(opts.deploymentDir, envName);
      if (!envVars.FIREBASE_SA_EMAIL && !process.env.FIREBASE_SA_EMAIL)
        missing.push(
          `FIREBASE_SA_EMAIL [${envName}]: add to deployment/${envName}.yml or export in shell`,
        );
      if (!envVars.FIREBASE_PROJECT_ID && !process.env.GCLOUD_PROJECT)
        missing.push(
          `FIREBASE_PROJECT_ID [${envName}]: add to deployment/${envName}.yml or export GCLOUD_PROJECT in shell`,
        );
    }
  }

  if (needsSentry) {
    const sourceEnv =
      opts.targetEnv === "all"
        ? envList.find((e) => e !== "development")
        : opts.targetEnv;
    const envVars = sourceEnv
      ? parseDeploymentEnv(opts.deploymentDir, sourceEnv)
      : {};

    if (!envVars.SENTRY_ORG && !process.env.SENTRY_ORG)
      missing.push(
        `SENTRY_ORG [${sourceEnv ?? envList[0]}]: add to deployment YAML or export in shell`,
      );
    if (!envVars.SENTRY_PROJECT && !process.env.SENTRY_PROJECT)
      missing.push(
        `SENTRY_PROJECT [${sourceEnv ?? envList[0]}]: add to deployment YAML or export in shell`,
      );
  }

  if (missing.length > 0)
    err(
      `--init ${opts.init}: missing required configuration:\n${missing.map((m) => `  · ${m}`).join("\n")}`,
    );
}

function resolveAutoInit(
  deploymentDir: string,
  targetEnv: string,
  envList: string[],
): "all" | "firebase" | "sentry" {
  const targetEnvs = targetEnv === "all" ? envList : [targetEnv];
  const keys = targetEnvs.flatMap((envName) =>
    Object.keys(parseDeploymentEnv(deploymentDir, envName)),
  );

  const hasFirebase = keys.some((k) =>
    [
      "FIREBASE_PROJECT_ID",
      "FIREBASE_SA_EMAIL",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    ].includes(k),
  );
  const hasSentry = keys.some((k) =>
    ["SENTRY_ORG", "SENTRY_PROJECT"].includes(k),
  );

  log("Auto-detecting --init:");
  if (hasFirebase)
    log(
      "  Firebase: initialize (Firebase public vars found in deployment config)",
    );
  else log("  Firebase: skip (no Firebase public vars in deployment config)");

  if (hasSentry)
    log("  Sentry: initialize (Sentry public vars found in deployment config)");
  else log("  Sentry: skip (no Sentry public vars in deployment config)");

  if (!hasFirebase && !hasSentry)
    err(
      "--init: nothing to initialize — no Firebase or Sentry public config vars found in deployment config",
    );

  if (hasFirebase && hasSentry) return "all";
  if (hasFirebase) return "firebase";
  return "sentry";
}

function checkPrereqs(opts: Options, token: string | undefined): void {
  if (!token)
    err(
      "No Vercel token found. Set VERCEL_TOKEN or run 'vercel login' to authenticate.",
    );
  if (!fs.existsSync(opts.deploymentDir))
    err(`Deployment directory not found: ${opts.deploymentDir}`);
  const envsFile = path.join(opts.deploymentDir, "environments.yml");
  if (!fs.existsSync(envsFile)) err(`environments.yml not found: ${envsFile}`);
}

export async function run(opts: Options): Promise<void> {
  const token = resolveVercelToken();
  checkPrereqs(opts, token);

  const project = detectProject();
  log(
    `Project: ${project.projectId}${project.teamId ? ` (team: ${project.teamId})` : ""}`,
  );

  const activeEnvs = listActiveEnvs(opts.deploymentDir);
  if (activeEnvs.length === 0)
    err(
      `No active environments found in ${opts.deploymentDir}/environments.yml`,
    );

  let envList: string[];
  if (opts.targetEnv === "all") {
    envList = activeEnvs;
  } else {
    if (!activeEnvs.includes(opts.targetEnv)) {
      err(
        `--env '${opts.targetEnv}' not in active environments: ${activeEnvs.join(", ")}`,
      );
    }
    envList = [opts.targetEnv];
  }

  if (opts.init === "auto") {
    opts.init = resolveAutoInit(opts.deploymentDir, opts.targetEnv, envList);
  }
  if (opts.init) validateInitConfig(opts, envList);

  if (opts.dryRun) {
    log("Dry run — no changes will be made");
    for (const envName of envList) {
      const envFile = path.join(opts.deploymentDir, `${envName}.yml`);
      if (!fs.existsSync(envFile)) {
        warn(`No config file for '${envName}': ${envFile}`);
        continue;
      }
      const target = vercelTarget(envName);
      log(`Would sync ${envName} → ${target}:`);
      const vars = parseDeploymentEnv(opts.deploymentDir, envName);
      for (const key of Object.keys(vars)) {
        log(`  Would sync: ${key}`);
      }
    }
    if (opts.rotateKeys)
      log(
        opts.init
          ? "Would init secrets (skipped in dry-run)"
          : "Would rotate keys (skipped in dry-run)",
      );
    return;
  }

  const client = new VercelClient(token!, project.projectId, project.teamId);

  let allEnvs = await client.listEnvVars();

  let totalCreated = 0;
  let totalUpdated = 0;

  for (const envName of envList) {
    const envFile = path.join(opts.deploymentDir, `${envName}.yml`);
    if (!fs.existsSync(envFile)) {
      warn(`No config file for '${envName}': ${envFile} — skipping`);
      continue;
    }

    const target = vercelTarget(envName);
    log(`Syncing ${envName} → ${target}...`);

    const vars = parseDeploymentEnv(opts.deploymentDir, envName);
    const keys = Object.keys(vars);
    if (keys.length === 0) {
      warn(`No variables found in ${envFile} — skipping`);
      continue;
    }

    let created = 0;
    let updated = 0;

    for (const key of keys) {
      const value = vars[key];
      const existing = client.findEnvVar(allEnvs.envs, key, target);

      if (existing) {
        await client.updateEnvVar(existing.id, value);
        log(`  Updated : ${key}`);
        updated++;
      } else {
        await client.createEnvVar(key, value, target, "plain");
        log(`  Created : ${key}`);
        created++;
      }
    }

    log(`  ${envName} — ${created} created, ${updated} updated`);
    totalCreated += created;
    totalUpdated += updated;

    if (envList.length > 1) allEnvs = await client.listEnvVars();
  }

  log(
    `Done — ${totalCreated} created, ${totalUpdated} updated across all target environments.`,
  );

  if (opts.rotateKeys) {
    if (opts.init && opts.targetEnv === "all") {
      // Sentry is project-level (one org/project): init once across all Vercel
      // targets so only one key is created and stored in every environment.
      if (opts.init === "sentry" || opts.init === "all") {
        const sentrySourceEnv =
          envList.find((e) => e !== "development") ?? envList[0];
        const envVars = parseDeploymentEnv(opts.deploymentDir, sentrySourceEnv);
        await rotateKeysRun({
          targetEnv: "all",
          invalidateKeys: opts.invalidateKeys,
          init: "sentry",
          sentryOrg: envVars.SENTRY_ORG || undefined,
          sentryProject: envVars.SENTRY_PROJECT || undefined,
        });
      }
      // Firebase is per-env: each environment gets its own distinct GCP service
      // account key (including development) so they can be rotated independently.
      if (opts.init === "firebase" || opts.init === "all") {
        for (const envName of envList) {
          const envVars = parseDeploymentEnv(opts.deploymentDir, envName);
          await rotateKeysRun({
            targetEnv: vercelTarget(envName),
            invalidateKeys: opts.invalidateKeys,
            init: "firebase",
            firebaseSaEmail: envVars.FIREBASE_SA_EMAIL || undefined,
            gcpProject: envVars.FIREBASE_PROJECT_ID || undefined,
          });
        }
      }
    } else {
      // Single-env or rotation-only: one call. For --env all, read YAML values
      // from the first active env (Sentry org/project are the same across envs;
      // Firebase credentials are auto-detected from existing keys during rotation).
      const sourceEnv = opts.targetEnv === "all" ? envList[0] : opts.targetEnv;
      const envVars = sourceEnv
        ? parseDeploymentEnv(opts.deploymentDir, sourceEnv)
        : {};
      const rotateTarget =
        opts.targetEnv === "all" ? "all" : vercelTarget(opts.targetEnv);
      await rotateKeysRun({
        targetEnv: rotateTarget,
        invalidateKeys: opts.invalidateKeys,
        init: opts.init,
        firebaseSaEmail: envVars.FIREBASE_SA_EMAIL || undefined,
        gcpProject: envVars.FIREBASE_PROJECT_ID || undefined,
        sentryOrg: envVars.SENTRY_ORG || undefined,
        sentryProject: envVars.SENTRY_PROJECT || undefined,
      });
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  await run(opts);
}

if (require.main === module) {
  main().catch((e: unknown) => {
    if (e instanceof FatalError) {
      console.error(`[sync-env] ERROR: ${e.message}`);
      process.exit(1);
    }
    throw e;
  });
}
