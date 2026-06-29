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
exports.parseArgs = void 0;
exports.run = run;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const environments_1 = require("./lib/environments");
const auth_1 = require("./lib/auth");
const logger_1 = require("./lib/logger");
const project_1 = require("./lib/project");
const deployments_1 = require("./lib/deployments");
const rotation_1 = require("./lib/rotation");
const vercel_api_1 = require("./lib/vercel-api");
const sync_env_args_1 = require("./lib/sync-env-args");
Object.defineProperty(exports, "parseArgs", { enumerable: true, get: function () { return sync_env_args_1.parseArgs; } });
const sync_env_init_1 = require("./lib/sync-env-init");
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
    // Development always mirrors the staging/preview source for public vars.
    const devSource = (0, sync_env_init_1.findDevSource)(activeEnvs);
    let envList;
    if (opts.targetEnv === "all") {
        envList = activeEnvs;
    }
    else if (opts.targetEnv === "development") {
        if (!devSource)
            (0, logger_1.err)("--env development requires a staging or preview environment in environments.yml");
        envList = [];
    }
    else {
        if (!activeEnvs.includes(opts.targetEnv)) {
            (0, logger_1.err)(`--env '${opts.targetEnv}' not in active environments: ${activeEnvs.join(", ")}`);
        }
        envList = [opts.targetEnv];
    }
    if (opts.init === "auto") {
        opts.init = (0, sync_env_init_1.resolveAutoInit)(opts.deploymentDir, opts.targetEnv, envList, devSource);
    }
    if (opts.init)
        (0, sync_env_init_1.validateInitConfig)(opts, envList, devSource);
    const syncDev = (opts.targetEnv === "all" || opts.targetEnv === "development") &&
        devSource !== undefined;
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
        if (syncDev) {
            (0, logger_1.log)(`Would sync development (from ${devSource}) → development:`);
            const vars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, devSource);
            for (const key of Object.keys(vars)) {
                (0, logger_1.log)(`  Would sync: ${key}`);
            }
        }
        if (opts.rotateKeys)
            (0, logger_1.log)(opts.init
                ? "Would init secrets (skipped in dry-run)"
                : "Would rotate keys (skipped in dry-run)");
        return;
    }
    const client = new vercel_api_1.VercelClient(token, project.projectId, project.teamId);
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
    // Sync development target from the staging/preview source YAML.
    // Development has no dedicated YAML; it mirrors staging's public vars while
    // maintaining its own distinct Firebase key for independent rotation.
    if (syncDev) {
        const devEnvFile = path.join(opts.deploymentDir, `${devSource}.yml`);
        if (!fs.existsSync(devEnvFile)) {
            (0, logger_1.warn)(`No config file for development source '${devSource}': ${devEnvFile} — skipping development sync`);
        }
        else {
            (0, logger_1.log)(`Syncing development (from ${devSource}) → development...`);
            const vars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, devSource);
            const keys = Object.keys(vars);
            if (keys.length === 0) {
                (0, logger_1.warn)(`No variables found in ${devEnvFile} — skipping development sync`);
            }
            else {
                if (envList.length > 0)
                    allEnvs = await client.listEnvVars();
                let created = 0;
                let updated = 0;
                for (const key of keys) {
                    const value = vars[key];
                    const existing = client.findEnvVar(allEnvs.envs, key, "development");
                    if (existing) {
                        await client.updateEnvVar(existing.id, value);
                        (0, logger_1.log)(`  Updated : ${key}`);
                        updated++;
                    }
                    else {
                        await client.createEnvVar(key, value, "development", "plain");
                        (0, logger_1.log)(`  Created : ${key}`);
                        created++;
                    }
                }
                (0, logger_1.log)(`  development (from ${devSource}) — ${created} created, ${updated} updated`);
                totalCreated += created;
                totalUpdated += updated;
            }
        }
    }
    (0, logger_1.log)(`Done — ${totalCreated} created, ${totalUpdated} updated across all target environments.`);
    if (opts.rotateKeys) {
        if (opts.init && opts.targetEnv === "all") {
            // Sentry is project-level (one org/project): init once across all Vercel
            // targets so only one key is created and stored in every environment.
            if (opts.init === "sentry" || opts.init === "all") {
                const sentrySourceEnv = envList.find((e) => e !== "development") ?? envList[0];
                const envVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, sentrySourceEnv);
                await (0, rotation_1.run)({
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
                    const envVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, envName);
                    await (0, rotation_1.run)({
                        targetEnv: (0, environments_1.vercelTarget)(envName),
                        invalidateKeys: opts.invalidateKeys,
                        init: "firebase",
                        firebaseSaEmail: envVars.FIREBASE_SA_EMAIL || undefined,
                        gcpProject: envVars.FIREBASE_PROJECT_ID || undefined,
                    });
                }
                if (devSource) {
                    const devEnvVars = (0, environments_1.parseDeploymentEnv)(opts.deploymentDir, devSource);
                    await (0, rotation_1.run)({
                        targetEnv: "development",
                        invalidateKeys: opts.invalidateKeys,
                        init: "firebase",
                        firebaseSaEmail: devEnvVars.FIREBASE_SA_EMAIL || undefined,
                        gcpProject: devEnvVars.FIREBASE_PROJECT_ID || undefined,
                    });
                }
            }
        }
        else {
            // Single-env or rotation-only: one call.
            // For --env development, read SA/project from devSource (staging YAML).
            // For --env all without init, rotation auto-detects from existing keys.
            const sourceEnv = opts.targetEnv === "development"
                ? devSource
                : opts.targetEnv === "all"
                    ? envList[0]
                    : opts.targetEnv;
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
        if (opts.refreshPreviews === true) {
            await (0, deployments_1.refreshPreviewDeployments)(client);
        }
    }
}
async function main() {
    const opts = (0, sync_env_args_1.parseArgs)(process.argv);
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