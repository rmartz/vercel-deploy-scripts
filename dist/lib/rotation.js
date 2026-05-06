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
exports.run = run;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const auth_1 = require("./auth");
const logger_1 = require("./logger");
const project_1 = require("./project");
const subprocess_1 = require("./subprocess");
const vercel_api_1 = require("./vercel-api");
const firebase_1 = require("./firebase");
const sentry_1 = require("./sentry");
const deployments_1 = require("./deployments");
// ─── Prerequisites ────────────────────────────────────────────────────────────
function checkPrereqs(needsGcloud, token) {
    const missing = [];
    if (!(0, subprocess_1.commandExists)("vercel"))
        missing.push("vercel");
    if (needsGcloud && !(0, subprocess_1.commandExists)("gcloud"))
        missing.push("gcloud");
    if (missing.length > 0)
        (0, logger_1.err)(`Missing required tools: ${missing.join(" ")}`);
    if (!token)
        (0, logger_1.err)("No Vercel token found. Set VERCEL_TOKEN or run 'vercel login' to authenticate.");
    try {
        (0, subprocess_1.run)("vercel", ["whoami"]);
    }
    catch {
        (0, logger_1.err)("Vercel CLI not authenticated. Run: vercel login");
    }
}
// ─── Main orchestration ───────────────────────────────────────────────────────
async function run(opts) {
    // gcloud is only needed for Firebase-related flows.
    // When opts.init is undefined we don't yet know hasFirebase, so we conservatively
    // require gcloud unless we know this is a Sentry-only init.
    const needsGcloud = opts.init !== "sentry";
    const token = (0, auth_1.resolveVercelToken)();
    checkPrereqs(needsGcloud, token);
    const project = (0, project_1.detectProject)();
    (0, logger_1.log)(`Project: ${project.projectId}${project.teamId ? ` (team: ${project.teamId})` : ""}`);
    const client = new vercel_api_1.VercelClient(token, project.projectId, project.teamId);
    const allEnvs = await client.listEnvVars();
    const envKeys = allEnvs.envs.map((e) => e.key);
    const hasFirebase = envKeys.some((k) => ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PRIVATE_KEY"].includes(k));
    const hasSentry = envKeys.some((k) => ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"].includes(k));
    if (opts.init) {
        if ((opts.init === "all" || opts.init === "firebase") && hasFirebase) {
            (0, logger_1.err)("Firebase keys already exist in this Vercel project — use sync-env --rotate-keys to update them, not --init.");
        }
        if ((opts.init === "all" || opts.init === "sentry") && hasSentry) {
            (0, logger_1.err)("Sentry keys already exist in this Vercel project — use sync-env --rotate-keys to update them, not --init.");
        }
    }
    else if (!hasFirebase && !hasSentry) {
        (0, logger_1.err)("No Firebase or Sentry keys found in this Vercel project — nothing to rotate. To push secrets for the first time, use --init.");
    }
    (0, logger_1.log)(`Target: ${opts.targetEnv} | ${opts.init ? "Initializing" : `Invalidate after redeployment: ${opts.invalidateKeys}`}`);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-keys-"));
    try {
        if (opts.init) {
            if (opts.init === "all" || opts.init === "firebase") {
                await (0, firebase_1.initFirebase)(opts.targetEnv, client, tempDir, opts.firebaseSaEmail, opts.gcpProject);
            }
            if (opts.init === "all" || opts.init === "sentry") {
                await (0, sentry_1.initSentry)(opts.targetEnv, client, opts.sentryOrg, opts.sentryProject);
            }
            await (0, deployments_1.triggerAndWaitRedeployments)(opts.targetEnv, client);
            (0, logger_1.log)("Key initialization complete.");
        }
        else {
            let oldFirebaseKeys = [];
            let fp = null;
            let oldSentryKeyId = "";
            if (hasFirebase) {
                ({ oldKeys: oldFirebaseKeys, fp } = await (0, firebase_1.rotateFirebase)(opts.targetEnv, client, tempDir));
            }
            if (hasSentry) {
                oldSentryKeyId = await (0, sentry_1.rotateSentry)(opts.targetEnv, client, opts.sentryOrg, opts.sentryProject);
            }
            await (0, deployments_1.triggerAndWaitRedeployments)(opts.targetEnv, client);
            if (opts.invalidateKeys) {
                (0, logger_1.log)("Invalidating old keys...");
                if (hasFirebase && fp)
                    await (0, firebase_1.invalidateFirebaseKeys)(client, fp);
                if (hasSentry && oldSentryKeyId) {
                    await (0, sentry_1.invalidateSentryKey)(oldSentryKeyId, opts.sentryOrg ?? process.env.SENTRY_ORG, opts.sentryProject ?? process.env.SENTRY_PROJECT);
                }
            }
            else {
                (0, logger_1.log)("Skipping key invalidation (--no-invalidate)");
                for (const { vercelEnv, keyId, saEmail } of oldFirebaseKeys) {
                    (0, logger_1.warn)(`Old Firebase key to remove: ${keyId} (${vercelEnv}, account: ${saEmail})`);
                }
                if (oldSentryKeyId) {
                    const org = opts.sentryOrg ?? process.env.SENTRY_ORG;
                    const project = opts.sentryProject ?? process.env.SENTRY_PROJECT;
                    (0, logger_1.warn)(`Old Sentry key to remove: ${oldSentryKeyId} (project: ${org}/${project})`);
                }
            }
            (0, logger_1.log)("Key rotation complete.");
        }
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
//# sourceMappingURL=rotation.js.map