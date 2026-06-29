import { parseDeploymentEnv, vercelTarget } from "./environments";
import { err, log } from "./logger";
import type { Options } from "./sync-env-args";

// Returns the first active env whose Vercel target is "preview" (i.e. staging).
// Development always mirrors this source for public vars and Firebase SA credentials.
export function findDevSource(activeEnvs: string[]): string | undefined {
  return activeEnvs.find((e) => vercelTarget(e) === "preview");
}

export function validateInitConfig(
  opts: Options,
  envList: string[],
  devSource: string | undefined,
): void {
  const needsFirebase = opts.init === "firebase" || opts.init === "all";
  const needsSentry = opts.init === "sentry" || opts.init === "all";

  const missing: string[] = [];

  if (needsFirebase) {
    // Validate active envs (not development — it uses devSource credentials)
    const activeTargets =
      opts.targetEnv === "all" || opts.targetEnv === "development"
        ? envList
        : [opts.targetEnv];

    for (const envName of activeTargets) {
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

    // Validate development credentials (sourced from devSource, i.e. staging)
    const includesDev =
      opts.targetEnv === "all" || opts.targetEnv === "development";
    if (includesDev && devSource) {
      const envVars = parseDeploymentEnv(opts.deploymentDir, devSource);
      if (!envVars.FIREBASE_SA_EMAIL && !process.env.FIREBASE_SA_EMAIL)
        missing.push(
          `FIREBASE_SA_EMAIL [development]: add to deployment/${devSource}.yml or export in shell`,
        );
      if (!envVars.FIREBASE_PROJECT_ID && !process.env.GCLOUD_PROJECT)
        missing.push(
          `FIREBASE_PROJECT_ID [development]: add to deployment/${devSource}.yml or export GCLOUD_PROJECT in shell`,
        );
    }
  }

  if (needsSentry) {
    const sentrySourceEnv =
      opts.targetEnv === "all"
        ? (envList.find((e) => e !== "development") ?? envList[0])
        : opts.targetEnv === "development"
          ? devSource
          : opts.targetEnv;

    if (!sentrySourceEnv) {
      missing.push(
        `Sentry configuration: no preview/staging environment found — add staging to environments.yml`,
      );
    } else {
      const envVars = parseDeploymentEnv(opts.deploymentDir, sentrySourceEnv);
      if (!envVars.SENTRY_ORG && !process.env.SENTRY_ORG)
        missing.push(
          `SENTRY_ORG [${sentrySourceEnv}]: add to deployment YAML or export in shell`,
        );
      if (!envVars.SENTRY_PROJECT && !process.env.SENTRY_PROJECT)
        missing.push(
          `SENTRY_PROJECT [${sentrySourceEnv}]: add to deployment YAML or export in shell`,
        );
    }
  }

  if (missing.length > 0)
    err(
      `--init ${opts.init}: missing required configuration:\n${missing.map((m) => `  · ${m}`).join("\n")}`,
    );
}

export function resolveAutoInit(
  deploymentDir: string,
  targetEnv: string,
  envList: string[],
  devSource: string | undefined,
): "all" | "firebase" | "sentry" {
  // For development: scan devSource (staging) YAML — development has no own YAML.
  // For all: scan envList (staging is already included; dev mirrors it).
  // For a specific env: scan just that env.
  const scanEnvs =
    targetEnv === "development"
      ? devSource
        ? [devSource]
        : []
      : targetEnv === "all"
        ? envList
        : [targetEnv];

  const keys = scanEnvs.flatMap((envName) =>
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
