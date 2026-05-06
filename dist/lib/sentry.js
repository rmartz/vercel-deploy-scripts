"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotateSentry = rotateSentry;
exports.initSentry = initSentry;
exports.invalidateSentryKey = invalidateSentryKey;
const logger_1 = require("./logger");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function targetEnvs(targetEnv) {
    if (targetEnv === "all")
        return ["production", "preview", "development"];
    return [targetEnv];
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
// ─── Sentry rotation ──────────────────────────────────────────────────────────
async function rotateSentry(targetEnv, client, sentryOrgOverride, sentryProjectOverride) {
    (0, logger_1.log)("Rotating Sentry client key...");
    if (!process.env.SENTRY_AUTH_TOKEN)
        (0, logger_1.err)("SENTRY_AUTH_TOKEN is required for Sentry rotation");
    const org = sentryOrgOverride ?? process.env.SENTRY_ORG;
    const project = sentryProjectOverride ?? process.env.SENTRY_PROJECT;
    if (!org)
        (0, logger_1.err)("SENTRY_ORG is required for Sentry rotation");
    if (!project)
        (0, logger_1.err)("SENTRY_PROJECT is required for Sentry rotation");
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
    for (const vercelEnv of targetEnvs(targetEnv)) {
        const currentEnvs = await client.listEnvVars();
        if (targetEnv === "all") {
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
// ─── Sentry init ──────────────────────────────────────────────────────────────
async function initSentry(targetEnv, client, sentryOrgOverride, sentryProjectOverride) {
    (0, logger_1.log)("Initializing Sentry DSN...");
    if (!process.env.SENTRY_AUTH_TOKEN)
        (0, logger_1.err)("SENTRY_AUTH_TOKEN is required for --init sentry");
    const org = sentryOrgOverride ?? process.env.SENTRY_ORG;
    const project = sentryProjectOverride ?? process.env.SENTRY_PROJECT;
    if (!org)
        (0, logger_1.err)("SENTRY_ORG is required for --init sentry");
    if (!project)
        (0, logger_1.err)("SENTRY_PROJECT is required for --init sentry");
    const dsnKeyName = "NEXT_PUBLIC_SENTRY_DSN";
    (0, logger_1.log)("  Creating new Sentry project key...");
    const label = `init-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const newKey = await sentryRequest(`/projects/${org}/${project}/keys/`, "POST", { name: label });
    (0, logger_1.log)(`  New Sentry key ID: ${newKey.id}`);
    const currentEnvs = await client.listEnvVars();
    for (const vercelEnv of targetEnvs(targetEnv)) {
        await client.setEnvForTarget(dsnKeyName, newKey.dsn.public, vercelEnv, currentEnvs.envs);
        (0, logger_1.log)(`  [${vercelEnv}] Pushed ${dsnKeyName}`);
    }
    (0, logger_1.log)("Sentry initialization complete.");
}
// ─── Sentry key invalidation ──────────────────────────────────────────────────
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
//# sourceMappingURL=sentry.js.map