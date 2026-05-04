import { log, warn } from "./logger";
import { VercelClient } from "./vercel-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function targetEnvs(targetEnv: string): string[] {
  if (targetEnv === "all") return ["production", "preview", "development"];
  return [targetEnv];
}

// ─── Redeployment ─────────────────────────────────────────────────────────────

export async function triggerAndWaitRedeployments(
  targetEnv: string,
  client: VercelClient,
): Promise<void> {
  log("Triggering redeployments...");

  const deploymentIds: string[] = [];

  for (const vercelEnv of targetEnvs(targetEnv)) {
    if (vercelEnv === "development") {
      log(`  [${vercelEnv}] No remote deployment target — skipping`);
      continue;
    }
    const deployTarget = vercelEnv === "production" ? "production" : "staging";
    const latest = await client.getLatestDeployment(
      deployTarget as "production" | "staging",
    );
    if (!latest) {
      warn(
        `No READY deployment found for '${vercelEnv}' — skipping redeployment`,
      );
      continue;
    }
    log(`  Redeploying ${vercelEnv} (${latest.url})...`);
    const newId = await client.triggerRedeployment(
      latest.uid,
      latest.name,
      deployTarget,
    );
    deploymentIds.push(newId);
    log(`  Queued: ${newId}`);
  }

  if (deploymentIds.length === 0) return;
  log(`Waiting for ${deploymentIds.length} deployment(s) to finish...`);

  for (const id of deploymentIds) {
    log(`  Polling ${id}...`);
    await client.pollDeploymentStatus(id, 60, 10_000);
    log(`  ${id} → READY`);
  }

  log("All deployments ready.");
}
