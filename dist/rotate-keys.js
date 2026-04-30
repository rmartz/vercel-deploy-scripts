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
exports.createGcpKey = createGcpKey;
exports.listUserManagedGcpKeys = listUserManagedGcpKeys;
exports.deleteGcpKey = deleteGcpKey;
exports.detectFirebasePattern = detectFirebasePattern;
exports.run = run;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_1 = require("./lib/logger");
const project_1 = require("./lib/project");
const subprocess_1 = require("./lib/subprocess");
const vercel_api_1 = require("./lib/vercel-api");
const USAGE = `Usage: rotate-keys [OPTIONS]

Rotate Firebase service account keys and Sentry DSN keys in a Vercel project.
Each Vercel environment (production, preview, development) is rotated
independently and receives its own GCP service account key.

For each configured provider the script:
  1. Creates a new key (GCP service account key / Sentry project key)
  2. Updates the Vercel environment variable for each targeted environment
  3. Triggers a redeployment and waits for it to finish
  4. Deletes the old key (skippable with --no-invalidate)

Providers are auto-detected from existing Vercel env var names:
  Firebase  FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY
  Sentry    SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN

OPTIONS:
  --env <env>           Which Vercel environment to rotate. One of:
                          production   Vercel production environment
                          preview      Vercel preview environment (alias: staging)
                          development  Vercel development environment
                          all          All environments that already have the key
                                       configured; unconfigured environments are
                                       skipped (use --env <env> to explicitly add)
  --no-invalidate       Skip deleting old keys after redeployment
  -h, --help            Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN          Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID     Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID        Vercel team/org ID (auto-detected from .vercel/project.json)
  SENTRY_AUTH_TOKEN     Sentry API token (required when Sentry DSN is present)
  SENTRY_ORG            Sentry organization slug (required with Sentry rotation)
  SENTRY_PROJECT        Sentry project slug (required with Sentry rotation)
  SENTRY_URL            Sentry base URL (default: https://sentry.io)
  GCLOUD_PROJECT        GCP project ID (auto-detected from service account JSON)`;
function parseArgs(argv) {
    const opts = { targetEnv: "all", invalidateKeys: true };
    const args = argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--env") {
            const val = args[++i];
            if (!val)
                (0, logger_1.err)("--env requires a value");
            const valid = ["production", "preview", "staging", "development", "all"];
            if (!valid.includes(val))
                (0, logger_1.err)(`--env must be one of: ${valid.join(", ")}`);
            opts.targetEnv = val === "staging" ? "preview" : val;
        }
        else if (arg === "--no-invalidate") {
            opts.invalidateKeys = false;
        }
        else if (arg === "-h" || arg === "--help") {
            console.log(USAGE);
            process.exit(0);
        }
        else {
            (0, logger_1.err)(`Unknown option: ${arg}. Run 'rotate-keys --help' for usage.`);
        }
    }
    return opts;
}
function targetEnvs(targetEnv) {
    if (targetEnv === "all")
        return ["production", "preview", "development"];
    return [targetEnv];
}
// ─── Prerequisites ────────────────────────────────────────────────────────────
function checkPrereqs() {
    const missing = [];
    if (!(0, subprocess_1.commandExists)("vercel"))
        missing.push("vercel");
    if (!(0, subprocess_1.commandExists)("gcloud"))
        missing.push("gcloud");
    if (missing.length > 0)
        (0, logger_1.err)(`Missing required tools: ${missing.join(" ")}`);
    if (!process.env.VERCEL_TOKEN)
        (0, logger_1.err)("VERCEL_TOKEN environment variable is required");
    try {
        (0, subprocess_1.run)("vercel", ["whoami"]);
    }
    catch {
        (0, logger_1.err)("Vercel CLI not authenticated. Run: vercel login");
    }
}
// ─── GCP helpers ──────────────────────────────────────────────────────────────
function createGcpKey(outputFile, saEmail, gcpProject) {
    (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "create",
        outputFile,
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--quiet",
    ]);
}
function listUserManagedGcpKeys(saEmail, gcpProject) {
    const output = (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "list",
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--managed-by",
        "user",
        "--format",
        "value(name.basename())",
    ]);
    return output.trim().split("\n").filter(Boolean);
}
function deleteGcpKey(keyId, saEmail, gcpProject) {
    (0, subprocess_1.run)("gcloud", [
        "iam",
        "service-accounts",
        "keys",
        "delete",
        keyId,
        "--iam-account",
        saEmail,
        "--project",
        gcpProject,
        "--quiet",
    ]);
}
function detectFirebasePattern(envs, client) {
    return _detectFirebasePattern(envs, client);
}
async function _detectFirebasePattern(envs, client) {
    const saJsonRecords = envs.filter((e) => e.key === "FIREBASE_SERVICE_ACCOUNT");
    const privateKeyRecords = envs.filter((e) => e.key === "FIREBASE_PRIVATE_KEY");
    if (saJsonRecords.length > 0) {
        const saJson = JSON.parse(await client.getEnvVarValue(saJsonRecords[0].id));
        return {
            pattern: "json",
            saEmail: saJson.client_email,
            gcpProject: process.env.GCLOUD_PROJECT ?? saJson.project_id,
        };
    }
    if (privateKeyRecords.length > 0) {
        const ceRecords = envs.filter((e) => e.key === "FIREBASE_CLIENT_EMAIL");
        if (ceRecords.length === 0)
            (0, logger_1.err)("FIREBASE_CLIENT_EMAIL not found in Vercel (required alongside FIREBASE_PRIVATE_KEY)");
        const saEmail = await client.getEnvVarValue(ceRecords[0].id);
        let gcpProject = process.env.GCLOUD_PROJECT ?? "";
        if (!gcpProject) {
            const pidRecords = envs.filter((e) => e.key === "FIREBASE_PROJECT_ID");
            if (pidRecords.length > 0)
                gcpProject = await client.getEnvVarValue(pidRecords[0].id);
        }
        return { pattern: "split", saEmail, gcpProject };
    }
    return (0, logger_1.err)("No Firebase service account keys found in Vercel");
}
async function getFirebaseSaForEnv(vercelEnv, envs, pattern, client) {
    if (pattern === "json") {
        const record = envs.find((e) => e.key === "FIREBASE_SERVICE_ACCOUNT" && e.target.includes(vercelEnv));
        if (!record)
            return null;
        const saJson = JSON.parse(await client.getEnvVarValue(record.id));
        return { email: saJson.client_email, gcpProject: saJson.project_id };
    }
    const ceRecord = envs.find((e) => e.key === "FIREBASE_CLIENT_EMAIL" && e.target.includes(vercelEnv));
    if (!ceRecord)
        return null;
    const email = await client.getEnvVarValue(ceRecord.id);
    let gcpProject = "";
    const pidRecord = envs.find((e) => e.key === "FIREBASE_PROJECT_ID" && e.target.includes(vercelEnv));
    if (pidRecord)
        gcpProject = await client.getEnvVarValue(pidRecord.id);
    return { email, gcpProject };
}
async function getFirebaseKeyIdForEnv(vercelEnv, envs, pattern, client) {
    if (pattern === "json") {
        const record = envs.find((e) => e.key === "FIREBASE_SERVICE_ACCOUNT" && e.target.includes(vercelEnv));
        if (!record)
            return "";
        const saJson = JSON.parse(await client.getEnvVarValue(record.id));
        return saJson.private_key_id ?? "";
    }
    const record = envs.find((e) => e.key === "FIREBASE_PRIVATE_KEY_ID" && e.target.includes(vercelEnv));
    if (!record)
        return "";
    return client.getEnvVarValue(record.id);
}
async function rotateFirebase(opts, client, tempDir) {
    (0, logger_1.log)("Rotating Firebase service account keys...");
    let allEnvs = await client.listEnvVars();
    const fp = await _detectFirebasePattern(allEnvs.envs, client);
    (0, logger_1.log)(`  Key pattern: ${fp.pattern}`);
    (0, logger_1.log)(`  Service account : ${fp.saEmail}`);
    (0, logger_1.log)(`  GCP project     : ${fp.gcpProject}`);
    const oldKeys = [];
    let rotatedAny = false;
    const firebaseKeyName = fp.pattern === "json" ? "FIREBASE_SERVICE_ACCOUNT" : "FIREBASE_PRIVATE_KEY";
    for (const vercelEnv of targetEnvs(opts.targetEnv)) {
        if (opts.targetEnv === "all") {
            const hasKey = allEnvs.envs.some((e) => e.key === firebaseKeyName && e.target.includes(vercelEnv));
            if (!hasKey) {
                (0, logger_1.log)(`  [${vercelEnv}] No existing key — skipping (use --env ${vercelEnv} to explicitly add)`);
                continue;
            }
        }
        const oldKeyId = await getFirebaseKeyIdForEnv(vercelEnv, allEnvs.envs, fp.pattern, client);
        if (oldKeyId) {
            (0, logger_1.log)(`  [${vercelEnv}] Current key ID: ${oldKeyId}`);
        }
        else {
            (0, logger_1.log)(`  [${vercelEnv}] No key ID tracked — old key will be swept after redeployment`);
        }
        let envSa = await getFirebaseSaForEnv(vercelEnv, allEnvs.envs, fp.pattern, client);
        if (!envSa) {
            if (vercelEnv !== "production") {
                envSa =
                    (await getFirebaseSaForEnv("preview", allEnvs.envs, fp.pattern, client)) ??
                        (await getFirebaseSaForEnv("development", allEnvs.envs, fp.pattern, client));
            }
            if (!envSa)
                envSa = { email: fp.saEmail, gcpProject: fp.gcpProject };
        }
        (0, logger_1.log)(`  [${vercelEnv}] Rotating... (SA: ${envSa.email})`);
        const keyFile = path.join(tempDir, `key-${vercelEnv}.json`);
        createGcpKey(keyFile, envSa.email, envSa.gcpProject);
        const newSaJson = JSON.parse(fs.readFileSync(keyFile, "utf-8"));
        (0, logger_1.log)(`  [${vercelEnv}] New key ID: ${newSaJson.private_key_id}`);
        const currentEnvs = await client.listEnvVars();
        if (fp.pattern === "json") {
            await client.setEnvForTarget("FIREBASE_SERVICE_ACCOUNT", JSON.stringify(newSaJson), vercelEnv, currentEnvs.envs);
        }
        else {
            await client.setEnvForTarget("FIREBASE_PRIVATE_KEY", newSaJson.private_key, vercelEnv, currentEnvs.envs);
            await client.setEnvForTarget("FIREBASE_PRIVATE_KEY_ID", newSaJson.private_key_id, vercelEnv, currentEnvs.envs);
        }
        if (oldKeyId) {
            oldKeys.push({
                vercelEnv,
                keyId: oldKeyId,
                saEmail: envSa.email,
                gcpProject: envSa.gcpProject,
            });
        }
        allEnvs = await client.listEnvVars();
        rotatedAny = true;
    }
    if (!rotatedAny)
        (0, logger_1.err)("No Firebase keys rotated — check --env and project configuration");
    (0, logger_1.log)("Firebase key rotation complete.");
    return oldKeys;
}
async function sentryRequest(path, method = "GET", body) {
    const token = process.env.SENTRY_AUTH_TOKEN;
    if (!token)
        (0, logger_1.err)("SENTRY_AUTH_TOKEN is required for Sentry key rotation");
    const base = process.env.SENTRY_URL ?? "https://sentry.io";
    const res = await fetch(`${base}/api/0${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sentry API ${method} ${path} failed (${res.status}): ${text}`);
    }
    if (method === "DELETE")
        return undefined;
    return res.json();
}
async function rotateSentry(opts, client) {
    (0, logger_1.log)("Rotating Sentry client key...");
    if (!process.env.SENTRY_AUTH_TOKEN)
        (0, logger_1.err)("SENTRY_AUTH_TOKEN is required for Sentry rotation");
    if (!process.env.SENTRY_ORG)
        (0, logger_1.err)("SENTRY_ORG is required for Sentry rotation");
    if (!process.env.SENTRY_PROJECT)
        (0, logger_1.err)("SENTRY_PROJECT is required for Sentry rotation");
    const org = process.env.SENTRY_ORG;
    const project = process.env.SENTRY_PROJECT;
    const allEnvs = await client.listEnvVars();
    let dsnKeyName = "";
    let currentDsnId = "";
    for (const candidate of ["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN"]) {
        const found = allEnvs.envs.find((e) => e.key === candidate);
        if (found) {
            dsnKeyName = candidate;
            currentDsnId = found.id;
            break;
        }
    }
    if (!dsnKeyName)
        (0, logger_1.err)("Could not find SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in Vercel");
    (0, logger_1.log)(`  DSN env var: ${dsnKeyName}`);
    const currentDsn = await client.getEnvVarValue(currentDsnId);
    const currentKeys = await sentryRequest(`/projects/${org}/${project}/keys/`);
    const dsnPublicKey = currentDsn.replace(/https?:\/\/([^@]+)@.*/, "$1");
    const oldKey = currentKeys.find((k) => new RegExp(dsnPublicKey, "i").test(k.dsn.public));
    if (!oldKey) {
        (0, logger_1.warn)("Could not match current DSN to a Sentry project key — old key will not be invalidated");
    }
    else {
        (0, logger_1.log)(`  Current Sentry key ID: ${oldKey.id}`);
    }
    (0, logger_1.log)("  Creating new Sentry project key...");
    const label = `rotated-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const newKey = await sentryRequest(`/projects/${org}/${project}/keys/`, "POST", {
        name: label,
    });
    (0, logger_1.log)(`  New Sentry key ID: ${newKey.id}`);
    for (const vercelEnv of targetEnvs(opts.targetEnv)) {
        const currentEnvs = await client.listEnvVars();
        if (opts.targetEnv === "all") {
            const existing = currentEnvs.envs.find((e) => e.key === dsnKeyName && e.target.includes(vercelEnv));
            if (!existing) {
                (0, logger_1.log)(`  [${vercelEnv}] No existing ${dsnKeyName} — skipping (use --env ${vercelEnv} to explicitly add)`);
                continue;
            }
        }
        await client.setEnvForTarget(dsnKeyName, newKey.dsn.public, vercelEnv, currentEnvs.envs);
    }
    (0, logger_1.log)("Sentry key rotation complete.");
    return oldKey?.id ?? "";
}
// ─── Redeployment ─────────────────────────────────────────────────────────────
async function triggerAndWaitRedeployments(opts, client) {
    (0, logger_1.log)("Triggering redeployments...");
    const deploymentIds = [];
    for (const vercelEnv of targetEnvs(opts.targetEnv)) {
        if (vercelEnv === "development") {
            (0, logger_1.log)(`  [${vercelEnv}] No remote deployment target — skipping`);
            continue;
        }
        const deployTarget = vercelEnv === "production" ? "production" : "staging";
        const latest = await client.getLatestDeployment(deployTarget);
        if (!latest) {
            (0, logger_1.warn)(`No READY deployment found for '${vercelEnv}' — skipping redeployment`);
            continue;
        }
        (0, logger_1.log)(`  Redeploying ${vercelEnv} (${latest.url})...`);
        const newId = await client.triggerRedeployment(latest.uid, latest.name, deployTarget);
        deploymentIds.push(newId);
        (0, logger_1.log)(`  Queued: ${newId}`);
    }
    if (deploymentIds.length === 0)
        return;
    (0, logger_1.log)(`Waiting for ${deploymentIds.length} deployment(s) to finish...`);
    for (const id of deploymentIds) {
        (0, logger_1.log)(`  Polling ${id}...`);
        await client.pollDeploymentStatus(id, 60, 10_000);
        (0, logger_1.log)(`  ${id} → READY`);
    }
    (0, logger_1.log)("All deployments ready.");
}
// ─── Key invalidation ─────────────────────────────────────────────────────────
async function invalidateFirebaseKeys(client, fp) {
    (0, logger_1.log)("Invalidating old Firebase keys (sweeping all non-active user-managed keys)...");
    const allEnvs = await client.listEnvVars();
    const activeKeys = new Set();
    const saPairs = new Map(); // email → gcpProject
    const unsweepable = new Set();
    for (const checkEnv of ["production", "preview", "development"]) {
        const kid = await getFirebaseKeyIdForEnv(checkEnv, allEnvs.envs, fp.pattern, client);
        const saInfo = await getFirebaseSaForEnv(checkEnv, allEnvs.envs, fp.pattern, client);
        if (kid) {
            activeKeys.add(kid);
            (0, logger_1.log)(`  Active key [${checkEnv}]: ${kid}`);
        }
        if (saInfo) {
            saPairs.set(saInfo.email, saInfo.gcpProject);
            if (!kid)
                unsweepable.add(saInfo.email);
        }
    }
    for (const [saEmail, gcpProject] of saPairs) {
        if (unsweepable.has(saEmail)) {
            (0, logger_1.warn)(`Skipping stray-key sweep for ${saEmail} — not all environments have FIREBASE_PRIVATE_KEY_ID tracked.`);
            (0, logger_1.warn)("  Rotate all environments first, then re-run to sweep old keys.");
            continue;
        }
        (0, logger_1.log)(`  Sweeping SA: ${saEmail}`);
        const allKeys = listUserManagedGcpKeys(saEmail, gcpProject);
        let deleted = 0;
        for (const keyId of allKeys) {
            if (activeKeys.has(keyId))
                continue;
            (0, logger_1.log)(`  Deleting stray key: ${keyId}`);
            try {
                deleteGcpKey(keyId, saEmail, gcpProject);
                (0, logger_1.log)(`  Deleted: ${keyId}`);
                deleted++;
            }
            catch {
                (0, logger_1.warn)(`Failed to delete key ${keyId} — remove manually:`);
                (0, logger_1.warn)(`  gcloud iam service-accounts keys delete ${keyId} --iam-account=${saEmail}`);
            }
        }
        if (deleted === 0)
            (0, logger_1.log)(`  No stray keys for ${saEmail}.`);
        else
            (0, logger_1.log)(`  Deleted ${deleted} stray key(s) for ${saEmail}.`);
    }
}
async function invalidateSentryKey(oldKeyId, org, project) {
    if (!oldKeyId) {
        (0, logger_1.warn)("No old Sentry key ID recorded — skipping Sentry invalidation");
        return;
    }
    (0, logger_1.log)(`Invalidating old Sentry key: ${oldKeyId}`);
    try {
        await sentryRequest(`/projects/${org}/${project}/keys/${oldKeyId}/`, "DELETE");
        (0, logger_1.log)("  Old Sentry key deleted.");
    }
    catch {
        (0, logger_1.warn)(`Failed to delete Sentry key ${oldKeyId} — remove it manually in Sentry project settings.`);
    }
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function run(opts) {
    checkPrereqs();
    const project = (0, project_1.detectProject)();
    (0, logger_1.log)(`Project: ${project.projectId}${project.teamId ? ` (team: ${project.teamId})` : ""}`);
    const client = new vercel_api_1.VercelClient(process.env.VERCEL_TOKEN, project.projectId, project.teamId);
    const allEnvs = await client.listEnvVars();
    const envKeys = allEnvs.envs.map((e) => e.key);
    const hasFirebase = envKeys.some((k) => ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PRIVATE_KEY"].includes(k));
    const hasSentry = envKeys.some((k) => ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"].includes(k));
    if (!hasFirebase && !hasSentry) {
        (0, logger_1.err)("No Firebase or Sentry keys found in this Vercel project — nothing to rotate.");
    }
    (0, logger_1.log)(`Target: ${opts.targetEnv} | Invalidate after redeployment: ${opts.invalidateKeys}`);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-keys-"));
    try {
        let oldFirebaseKeys = [];
        let fp = null;
        let oldSentryKeyId = "";
        if (hasFirebase) {
            fp = await _detectFirebasePattern(allEnvs.envs, client);
            oldFirebaseKeys = await rotateFirebase(opts, client, tempDir);
        }
        if (hasSentry) {
            oldSentryKeyId = await rotateSentry(opts, client);
        }
        await triggerAndWaitRedeployments(opts, client);
        if (opts.invalidateKeys) {
            (0, logger_1.log)("Invalidating old keys...");
            if (hasFirebase && fp)
                await invalidateFirebaseKeys(client, fp);
            if (hasSentry && oldSentryKeyId) {
                await invalidateSentryKey(oldSentryKeyId, process.env.SENTRY_ORG, process.env.SENTRY_PROJECT);
            }
        }
        else {
            (0, logger_1.log)("Skipping key invalidation (--no-invalidate)");
            for (const { vercelEnv, keyId, saEmail } of oldFirebaseKeys) {
                (0, logger_1.warn)(`Old Firebase key to remove: ${keyId} (${vercelEnv}, account: ${saEmail})`);
            }
            if (oldSentryKeyId) {
                (0, logger_1.warn)(`Old Sentry key to remove: ${oldSentryKeyId} (project: ${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT})`);
            }
        }
        (0, logger_1.log)("Key rotation complete.");
    }
    finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
async function main() {
    const opts = parseArgs(process.argv);
    await run(opts);
}
if (require.main === module) {
    main().catch((e) => {
        if (e instanceof logger_1.FatalError) {
            console.error(`[rotate-keys] ERROR: ${e.message}`);
            process.exit(1);
        }
        throw e;
    });
}
//# sourceMappingURL=rotate-keys.js.map