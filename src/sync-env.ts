#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

import {
  listActiveEnvs,
  parseDeploymentEnv,
  vercelTarget,
} from "./lib/environments";
import { FatalError, err, log, warn } from "./lib/logger";
import { detectProject } from "./lib/project";
import { VercelClient } from "./lib/vercel-api";

interface Options {
  targetEnv: string;
  deploymentDir: string;
  dryRun: boolean;
}

const USAGE = `Usage: sync-env [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from
Terraform deployment configuration files. Reads the list of active environments
from deployment/environments.yml and per-environment values from
deployment/{env}.yml, using the same source of truth as Terraform.

Existing variables are updated in place; missing ones are created as plain-type
records. Variables not present in the config files are left untouched.

OPTIONS:
  --env <name>             Target a specific environment by name as listed in
                           environments.yml (default: all active environments)
  --deployment-dir <path>  Path to deployment config directory (default: deployment/)
  --dry-run                Print what would change without making any API calls
  -h, --help               Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN       Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID  Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID     Vercel team/org ID (auto-detected from .vercel/project.json)

ENVIRONMENT MAPPING (matches Terraform target_map):
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

  # Preview what would change without touching Vercel
  sync-env --dry-run`;

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    targetEnv: "all",
    deploymentDir: "deployment",
    dryRun: false,
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
    } else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else {
      err(`Unknown option: ${arg}. Run 'sync-env --help' for usage.`);
    }
  }

  return opts;
}

function checkPrereqs(opts: Options): void {
  if (!process.env.VERCEL_TOKEN)
    err("VERCEL_TOKEN environment variable is required");
  if (!fs.existsSync(opts.deploymentDir))
    err(`Deployment directory not found: ${opts.deploymentDir}`);
  const envsFile = path.join(opts.deploymentDir, "environments.yml");
  if (!fs.existsSync(envsFile)) err(`environments.yml not found: ${envsFile}`);
}

export async function run(opts: Options): Promise<void> {
  checkPrereqs(opts);

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
    return;
  }

  const client = new VercelClient(
    process.env.VERCEL_TOKEN!,
    project.projectId,
    project.teamId,
  );

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
