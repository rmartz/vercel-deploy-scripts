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
exports.detectFirebasePattern = detectFirebasePattern;
exports.rotateFirebase = rotateFirebase;
exports.initFirebase = initFirebase;
exports.invalidateFirebaseKeys = invalidateFirebaseKeys;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("./logger");
const gcp_1 = require("./gcp");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function targetEnvs(targetEnv) {
    if (targetEnv === "all")
        return ["production", "preview", "development"];
    return [targetEnv];
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
    if (!gcpProject)
        gcpProject = process.env.GCLOUD_PROJECT ?? "";
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
// ─── Firebase pattern detection ───────────────────────────────────────────────
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
        if (!gcpProject)
            (0, logger_1.err)("Could not determine GCP project: set GCLOUD_PROJECT or ensure FIREBASE_PROJECT_ID is present in Vercel");
        return { pattern: "split", saEmail, gcpProject };
    }
    return (0, logger_1.err)("No Firebase service account keys found in Vercel");
}
// ─── Firebase rotation ────────────────────────────────────────────────────────
async function rotateFirebase(targetEnv, client, tempDir) {
    (0, logger_1.log)("Rotating Firebase service account keys...");
    let allEnvs = await client.listEnvVars();
    const fp = await _detectFirebasePattern(allEnvs.envs, client);
    (0, logger_1.log)(`  Key pattern: ${fp.pattern}`);
    (0, logger_1.log)(`  Service account : ${fp.saEmail}`);
    (0, logger_1.log)(`  GCP project     : ${fp.gcpProject}`);
    const oldKeys = [];
    let rotatedAny = false;
    const firebaseKeyName = fp.pattern === "json" ? "FIREBASE_SERVICE_ACCOUNT" : "FIREBASE_PRIVATE_KEY";
    for (const vercelEnv of targetEnvs(targetEnv)) {
        if (targetEnv === "all") {
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
        (0, gcp_1.createGcpKey)(keyFile, envSa.email, envSa.gcpProject);
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
    return { oldKeys, fp };
}
// ─── Firebase init ────────────────────────────────────────────────────────────
async function initFirebase(targetEnv, client, tempDir, saEmailOverride, gcpProjectOverride) {
    (0, logger_1.log)("Initializing Firebase service account keys...");
    const saEmail = saEmailOverride ?? process.env.FIREBASE_SA_EMAIL;
    if (!saEmail)
        (0, logger_1.err)(`FIREBASE_SA_EMAIL is required for --init firebase (target: ${targetEnv}). Set FIREBASE_SA_EMAIL in your deployment YAML or shell environment.`);
    const gcpProject = gcpProjectOverride ?? process.env.GCLOUD_PROJECT;
    if (!gcpProject)
        (0, logger_1.err)(`GCLOUD_PROJECT is required for --init firebase (target: ${targetEnv}). Set FIREBASE_PROJECT_ID in your deployment YAML or GCLOUD_PROJECT in your shell environment.`);
    const currentEnvs = await client.listEnvVars();
    for (const vercelEnv of targetEnvs(targetEnv)) {
        const keyFile = path.join(tempDir, `key-${vercelEnv}.json`);
        (0, gcp_1.createGcpKey)(keyFile, saEmail, gcpProject);
        const newSaJson = JSON.parse(fs.readFileSync(keyFile, "utf-8"));
        (0, logger_1.log)(`  [${vercelEnv}] Created key ID: ${newSaJson.private_key_id}`);
        await client.setEnvForTarget("FIREBASE_SERVICE_ACCOUNT", JSON.stringify(newSaJson), vercelEnv, currentEnvs.envs);
        (0, logger_1.log)(`  [${vercelEnv}] Pushed FIREBASE_SERVICE_ACCOUNT`);
    }
    (0, logger_1.log)("Firebase initialization complete.");
}
// ─── Firebase key invalidation ────────────────────────────────────────────────
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
        const allKeys = (0, gcp_1.listUserManagedGcpKeys)(saEmail, gcpProject);
        let deleted = 0;
        for (const keyId of allKeys) {
            if (activeKeys.has(keyId))
                continue;
            (0, logger_1.log)(`  Deleting stray key: ${keyId}`);
            try {
                (0, gcp_1.deleteGcpKey)(keyId, saEmail, gcpProject);
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
//# sourceMappingURL=firebase.js.map