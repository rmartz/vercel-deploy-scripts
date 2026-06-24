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
import { refreshPreviewDeployments } from "./lib/deployments";
import { run as rotateKeysRun } from "./lib/rotation";
import { VercelClient } from "./lib/vercel-api";
import { parseArgs, type Options } from "./lib/sync-env-args";
import {
  findDevSource,
  resolveAutoInit,
  validateInitConfig,
} from "./lib/sync-env-init";

export { parseArgs };
export type { Options };

function checkPrereqs(
  opts: Options,
  token: string | undefined,
): asserts token is string {
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

  // Development always mirrors the staging/preview source for public vars.
  const devSource = findDevSource(activeEnvs);

  let envList: string[];
  if (opts.targetEnv === "all") {
    envList = activeEnvs;
  } else if (opts.targetEnv === "development") {
    if (!devSource)
      err(
        "--env development requires a staging or preview environment in environments.yml",
      );
    envList = [];
  } else {
    if (!activeEnvs.includes(opts.targetEnv)) {
      err(
        `--env '${opts.targetEnv}' not in active environments: ${activeEnvs.join(", ")}`,
      );
    }
    envList = [opts.targetEnv];
  }

  if (opts.init === "auto") {
    opts.init = resolveAutoInit(
      opts.deploymentDir,
      opts.targetEnv,
      envList,
      devSource,
    );
  }
  if (opts.init) validateInitConfig(opts, envList, devSource);

  const syncDev =
    (opts.targetEnv === "all" || opts.targetEnv === "development") &&
    devSource !== undefined;

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
    if (syncDev) {
      log(`Would sync development (from ${devSource}) → development:`);
      const vars = parseDeploymentEnv(opts.deploymentDir, devSource);
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

  const client = new VercelClient(token, project.projectId, project.teamId);

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

  // Sync development target from the staging/preview source YAML.
  // Development has no dedicated YAML; it mirrors staging's public vars while
  // maintaining its own distinct Firebase key for independent rotation.
  if (syncDev) {
    const devEnvFile = path.join(opts.deploymentDir, `${devSource}.yml`);
    if (!fs.existsSync(devEnvFile)) {
      warn(
        `No config file for development source '${devSource}': ${devEnvFile} — skipping development sync`,
      );
    } else {
      log(`Syncing development (from ${devSource}) → development...`);
      const vars = parseDeploymentEnv(opts.deploymentDir, devSource);
      const keys = Object.keys(vars);
      if (keys.length === 0) {
        warn(`No variables found in ${devEnvFile} — skipping development sync`);
      } else {
        if (envList.length > 0) allEnvs = await client.listEnvVars();
        let created = 0;
        let updated = 0;
        for (const key of keys) {
          const value = vars[key];
          const existing = client.findEnvVar(allEnvs.envs, key, "development");
          if (existing) {
            await client.updateEnvVar(existing.id, value);
            log(`  Updated : ${key}`);
            updated++;
          } else {
            await client.createEnvVar(key, value, "development", "plain");
            log(`  Created : ${key}`);
            created++;
          }
        }
        log(
          `  development (from ${devSource}) — ${created} created, ${updated} updated`,
        );
        totalCreated += created;
        totalUpdated += updated;
      }
    }
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
      // Firebase is per-env: each Vercel target (production, preview, development)
      // gets its own distinct GCP service account key for independent rotation.
      // Development uses the staging SA credentials since it shares the same
      // Firebase project as staging/preview.
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
        if (devSource) {
          const devEnvVars = parseDeploymentEnv(opts.deploymentDir, devSource);
          await rotateKeysRun({
            targetEnv: "development",
            invalidateKeys: opts.invalidateKeys,
            init: "firebase",
            firebaseSaEmail: devEnvVars.FIREBASE_SA_EMAIL || undefined,
            gcpProject: devEnvVars.FIREBASE_PROJECT_ID || undefined,
          });
        }
      }
    } else {
      // Single-env or rotation-only: one call.
      // For --env development, read SA/project from devSource (staging YAML).
      // For --env all without init, rotation auto-detects from existing keys.
      const sourceEnv =
        opts.targetEnv === "development"
          ? devSource
          : opts.targetEnv === "all"
            ? envList[0]
            : opts.targetEnv;
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

    if (opts.refreshPreviews === true) {
      await refreshPreviewDeployments(client);
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
