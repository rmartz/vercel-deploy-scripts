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
const logger_1 = require("./lib/logger");
const project_1 = require("./lib/project");
const vercel_api_1 = require("./lib/vercel-api");
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
function parseArgs(argv) {
    const opts = {
        targetEnv: "all",
        deploymentDir: "deployment",
        dryRun: false,
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
function checkPrereqs(opts) {
    if (!process.env.VERCEL_TOKEN)
        (0, logger_1.err)("VERCEL_TOKEN environment variable is required");
    if (!fs.existsSync(opts.deploymentDir))
        (0, logger_1.err)(`Deployment directory not found: ${opts.deploymentDir}`);
    const envsFile = path.join(opts.deploymentDir, "environments.yml");
    if (!fs.existsSync(envsFile))
        (0, logger_1.err)(`environments.yml not found: ${envsFile}`);
}
async function run(opts) {
    checkPrereqs(opts);
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
    if (opts.dryRun) {
        (0, logger_1.log)("Dry run — no changes will be made");
        for (const envName of envList) {
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
        return;
    }
    const client = new vercel_api_1.VercelClient(process.env.VERCEL_TOKEN, project.projectId, project.teamId);
    let allEnvs = await client.listEnvVars();
    let totalCreated = 0;
    let totalUpdated = 0;
    for (const envName of envList) {
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