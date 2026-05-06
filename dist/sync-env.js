#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.run = run;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const environments_1 = require("./lib/environments");
const auth_1 = require("./lib/auth");
const logger_1 = require("./lib/logger");
const project_1 = require("./lib/project");
const rotation_1 = require("./lib/rotation");
const vercel_api_1 = require("./lib/vercel-api");
const USAGE = `Usage: sync-env [OPTIONS]

Upsert public (non-secret) environment variables to a Vercel project from
Terraform deployment configuration files. Reads the list of active environments
from deployment/environments.yml and per-environment values from
deployment/{env}.yml, using the same source of truth as Terraform.

Existing variables are updated in place; missing ones are created as plain-type
records. Variables not present in the config files are left untouched.

Pass --rotate-keys to also rotate Firebase and Sentry secrets in the same pass,
triggering a single redeployment after both steps complete.

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
                           exist.
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

ENVIRONMENT MAPPING (matches Terraform target_map):
  production  → production (Vercel target)
  staging     → preview   (Vercel target)
  preview     → preview   (Vercel target)
  development → development (Vercel target)
  <other>     → passed through as-is

DEVELOPMENT EXCEPTION (--rotate-keys only):
  When --rotate-keys is set, the public var sync step is skipped for
  development environments. Development vars are managed locally via
  generate-local-env and development targets have no canonical Vercel
  deployment to redeploy. Key rotation still runs.

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
function parseArgs(argv) {
    const opts = {
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
                args[++i] ?? (0, logger_1.err)('--env requires an environment name or "all"');
            if (!opts.targetEnv)
                (0, logger_1.err)('--env requires an environment name or "all"');
        }
        else if (arg === "--deployment-dir") {
            opts.deploymentDir = args[++i] ?? (0, logger_1.err)("--deployment-dir requires a path");
            if (!opts.deploymentDir)
                (0, logger_1.err)("--deployment-dir requires a path");
        }
        else if (arg === "--dry-run") {
            opts.dryRun = true;
        }
        else if (arg === "--rotate-keys") {
            opts.rotateKeys = true;
        }
        else if (arg === "--init") {
            const next = args[i + 1];
            if (next === "firebase" || next === "sentry") {
                opts.init = next;
                i++;
            }
            else {
                opts.init = "auto";
            }
            opts.rotateKeys = true;
        }
        else if (arg === "--no-invalidate") {
            opts.invalidateKeys = false;
        }
        else if (arg === "-h" || arg === "--help") {
            console.log(USAGE);
            process.exit(0);
        }
        else {
            (0, logger_1.err)(`Unknown option: ${arg}. Run 'sync-env --help' for usage.`);
        }
    }
    return opts;
}
function validateInitConfig(opts, envList) {
    const needsFirebase = opts.init === "firebase" || opts.init === "all";
    const needsSentry = opts.init === "sentry" || opts.init === "all";
    const missing = [];
    if (needsFirebase) {
        const targets = opts.targetEnv === "all"
            ? envList.filter((e) => e !== "development")
            : [opts.targetEnv];
        for (const envName of targets) {
            const envVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, envName);
            if (!envVars.FIREBASE_SA_EMAIL && !process.env.FIREBASE_SA_EMAIL)
                missing.push(`FIREBASE_SA_EMAIL [${envName}]: add to deployment/${envName}.yml or export in shell`);
            if (!envVars.FIREBASE_PROJECT_ID && !process.env.GCLOUD_PROJECT)
                missing.push(`FIREBASE_PROJECT_ID [${envName}]: add to deployment/${envName}.yml or export GCLOUD_PROJECT in shell`);
        }
    }
    if (needsSentry) {
        const sourceEnv = opts.targetEnv === "all"
            ? envList.find((e) => e !== "development")
            : opts.targetEnv;
        const envVars = sourceEnv
            ? (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, sourceEnv)
            : {};
        if (!envVars.SENTRY_ORG && !process.env.SENTRY_ORG)
            missing.push(`SENTRY_ORG [${sourceEnv ?? envList[0]}]: add to deployment YAML or export in shell`);
        if (!envVars.SENTRY_PROJECT && !process.env.SENTRY_PROJECT)
            missing.push(`SENTRY_PROJECT [${sourceEnv ?? envList[0]}]: add to deployment YAML or export in shell`);
    }
    if (missing.length > 0)
        (0, logger_1.err)(`--init ${opts.init}: missing required configuration:\n${missing.map((m) => `  · ${m}`).join("\n")}`);
}
function resolveAutoInit(envVars, targetEnv) {
    const relevantTargets = targetEnv === "all" ? ["production", "preview"] : [(0, environments_1.vercelTarget)(targetEnv)];
    const scoped = envVars.filter((e) => e.target.some((t) => relevantTargets.includes(t)));
    const keys = scoped.map((e) => e.key);
    const hasFirebaseSecrets = keys.some((k) => ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PRIVATE_KEY"].includes(k));
    const hasFirebasePublic = keys.some((k) => [
        "FIREBASE_PROJECT_ID",
        "FIREBASE_SA_EMAIL",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    ].includes(k));
    const hasSentrySecrets = keys.some((k) => ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"].includes(k));
    const hasSentryPublic = keys.some((k) => ["SENTRY_ORG", "SENTRY_PROJECT"].includes(k));
    const initFirebase = !hasFirebaseSecrets && hasFirebasePublic;
    const initSentry = !hasSentrySecrets && hasSentryPublic;
    (0, logger_1.log)("Auto-detecting --init:");
    if (initFirebase)
        (0, logger_1.log)("  Firebase: initialize (no service account found, Firebase public vars present)");
    else if (hasFirebaseSecrets)
        (0, logger_1.log)("  Firebase: skip (service account already configured)");
    else
        (0, logger_1.log)("  Firebase: skip (no Firebase public vars configured)");
    if (initSentry)
        (0, logger_1.log)("  Sentry: initialize (no DSN found, Sentry public vars present)");
    else if (hasSentrySecrets)
        (0, logger_1.log)("  Sentry: skip (DSN already configured)");
    else
        (0, logger_1.log)("  Sentry: skip (no Sentry public vars configured)");
    if (!initFirebase && !initSentry)
        (0, logger_1.err)("--init: nothing to initialize — Firebase and Sentry are either already configured or have no public config vars present in this project");
    if (initFirebase && initSentry)
        return "all";
    if (initFirebase)
        return "firebase";
    return "sentry";
}
function checkPrereqs(opts, token) {
    if (!token)
        (0, logger_1.err)("No Vercel token found. Set VERCEL_TOKEN or run 'vercel login' to authenticate.");
    if (!fs.existsSync(opts.deploymentDir))
        (0, logger_1.err)(`Deployment directory not found: ${opts.deploymentDir}`);
    const envsFile = path.join(opts.deploymentDir, "environments.yml");
    if (!fs.existsSync(envsFile))
        (0, logger_1.err)(`environments.yml not found: ${envsFile}`);
}
async function run(opts) {
    const token = (0, auth_1.resolveVercelToken)();
    checkPrereqs(opts, token);
    const project = (0, project_1.detectProject)();
    (0, logger_1.log)(`Project: ${project.projectId}${project.teamId ? ` (team: ${project.teamId})` : ""}`);
    const activeEnvs = (0, environments_1.listActiveEnvs)(opts.deploymentDir);
    if (activeEnvs.length === 0)
        (0, logger_1.err)(`No active environments found in ${opts.deploymentDir}/environments.yml`);
    let envList;
    if (opts.targetEnv === "all") {
        envList = activeEnvs;
    }
    else {
        if (!activeEnvs.includes(opts.targetEnv)) {
            (0, logger_1.err)(`--env '${opts.targetEnv}' not in active environments: ${activeEnvs.join(", ")}`);
        }
        envList = [opts.targetEnv];
    }
    if (opts.init && opts.init !== "auto")
        validateInitConfig(opts, envList);
    if (opts.dryRun) {
        (0, logger_1.log)("Dry run — no changes will be made");
        for (const envName of envList) {
            if (opts.rotateKeys && envName === "development") {
                (0, logger_1.log)(`  Would skip public var sync for development (vars managed locally via generate-local-env)`);
                continue;
            }
            const envFile = path.join(opts.deploymentDir, `${envName}.yml`);
            if (!fs.existsSync(envFile)) {
                (0, logger_1.warn)(`No config file for '${envName}': ${envFile}`);
                continue;
            }
            const target = (0, environments_1.vercelTarget)(envName);
            (0, logger_1.log)(`Would sync ${envName} → ${target}:`);
            const vars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, envName);
            for (const key of Object.keys(vars)) {
                (0, logger_1.log)(`  Would sync: ${key}`);
            }
        }
        if (opts.rotateKeys)
            (0, logger_1.log)(opts.init === "auto"
                ? "Would auto-detect and initialize missing secrets (skipped in dry-run — requires Vercel API)"
                : opts.init
                    ? "Would init secrets (skipped in dry-run)"
                    : "Would rotate keys (skipped in dry-run)");
        return;
    }
    const client = new vercel_api_1.VercelClient(token, project.projectId, project.teamId);
    let allEnvs = await client.listEnvVars();
    if (opts.init === "auto") {
        opts.init = resolveAutoInit(allEnvs.envs, opts.targetEnv);
        validateInitConfig(opts, envList);
    }
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const envName of envList) {
        if (opts.rotateKeys && envName === "development") {
            (0, logger_1.log)(`Skipping public var sync for development — vars are managed locally via generate-local-env`);
            continue;
        }
        const envFile = path.join(opts.deploymentDir, `${envName}.yml`);
        if (!fs.existsSync(envFile)) {
            (0, logger_1.warn)(`No config file for '${envName}': ${envFile} — skipping`);
            continue;
        }
        const target = (0, environments_1.vercelTarget)(envName);
        (0, logger_1.log)(`Syncing ${envName} → ${target}...`);
        const vars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, envName);
        const keys = Object.keys(vars);
        if (keys.length === 0) {
            (0, logger_1.warn)(`No variables found in ${envFile} — skipping`);
            continue;
        }
        let created = 0;
        let updated = 0;
        for (const key of keys) {
            const value = vars[key];
            const existing = client.findEnvVar(allEnvs.envs, key, target);
            if (existing) {
                await client.updateEnvVar(existing.id, value);
                (0, logger_1.log)(`  Updated : ${key}`);
                updated++;
            }
            else {
                await client.createEnvVar(key, value, target, "plain");
                (0, logger_1.log)(`  Created : ${key}`);
                created++;
            }
        }
        (0, logger_1.log)(`  ${envName} — ${created} created, ${updated} updated`);
        totalCreated += created;
        totalUpdated += updated;
        if (envList.length > 1)
            allEnvs = await client.listEnvVars();
    }
    (0, logger_1.log)(`Done — ${totalCreated} created, ${totalUpdated} updated across all target environments.`);
    if (opts.rotateKeys) {
        if (opts.init && opts.targetEnv === "all") {
            const nonDevEnvs = envList.filter((e) => e !== "development");
            // Sentry is project-level (one org/project): init once across all Vercel
            // targets so only one key is created and stored in every environment.
            if ((opts.init === "sentry" || opts.init === "all") &&
                nonDevEnvs.length > 0) {
                const firstEnv = nonDevEnvs[0];
                const envVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, firstEnv);
                await (0, rotation_1.run)({
                    targetEnv: "all",
                    invalidateKeys: opts.invalidateKeys,
                    init: "sentry",
                    sentryOrg: envVars.SENTRY_ORG || undefined,
                    sentryProject: envVars.SENTRY_PROJECT || undefined,
                });
            }
            // Firebase is per-project: each deployment env has its own Firebase project
            // and SA email, so init once per env with that env's YAML values.
            if (opts.init === "firebase" || opts.init === "all") {
                for (const envName of nonDevEnvs) {
                    const envVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, envName);
                    await (0, rotation_1.run)({
                        targetEnv: (0, environments_1.vercelTarget)(envName),
                        invalidateKeys: opts.invalidateKeys,
                        init: "firebase",
                        firebaseSaEmail: envVars.FIREBASE_SA_EMAIL || undefined,
                        gcpProject: envVars.FIREBASE_PROJECT_ID || undefined,
                    });
                }
            }
        }
        else {
            // Single-env or rotation-only: one call. For --env all, read YAML values
            // from the first active env (Sentry org/project are the same across envs;
            // Firebase credentials are auto-detected from existing keys during rotation).
            const sourceEnv = opts.targetEnv === "all" ? envList[0] : opts.targetEnv;
            const envVars = sourceEnv
                ? (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, sourceEnv)
                : {};
            const rotateTarget = opts.targetEnv === "all" ? "all" : (0, environments_1.vercelTarget)(opts.targetEnv);
            await (0, rotation_1.run)({
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
async function main() {
    const opts = parseArgs(process.argv);
    await run(opts);
}
if (require.main === module) {
    main().catch((e) => {
        if (e instanceof logger_1.FatalError) {
            console.error(`[sync-env] ERROR: ${e.message}`);
            process.exit(1);
        }
        throw e;
    });
}
//# sourceMappingURL=sync-env.js.map