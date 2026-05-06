"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerAndWaitRedeployments = triggerAndWaitRedeployments;
const logger_1 = require("./logger");
// ─── Helpers ──────────────────────────────────────────────────────────────────
function targetEnvs(targetEnv) {
    if (targetEnv === "all")
        return ["production", "preview", "development"];
    return [targetEnv];
}
// ─── Redeployment ─────────────────────────────────────────────────────────────
async function triggerAndWaitRedeployments(targetEnv, client) {
    (0, logger_1.log)("Triggering redeployments...");
    const deploymentIds = [];
    for (const vercelEnv of targetEnvs(targetEnv)) {
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
//# sourceMappingURL=deployments.js.map