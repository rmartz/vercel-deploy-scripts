#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FatalError, err, log, warn } from "./lib/logger";
import { detectProject } from "./lib/project";
import { commandExists, run as runCmd } from "./lib/subprocess";
import { VercelClient, VercelEnvVar } from "./lib/vercel-api";

interface Options {
  targetEnv: string;
  invalidateKeys: boolean;
  init?: "all" | "firebase" | "sentry";
}

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

Use --init to push secrets into a fresh Vercel project that has none yet.
--init fails if the target secrets already exist (use the normal rotation flow
to update existing keys).

OPTIONS:
  --env <env>                Which Vercel environment to target. One of:
                               production   Vercel production environment
                               preview      Vercel preview environment (alias: staging)
                               development  Vercel development environment
                               all          All environments (rotation: only envs that
                                            already have the key; init: all three)
  --init [firebase|sentry]   Bootstrap secrets into a project that has none yet.
                               Omit the service name to init both Firebase and Sentry.
                               Fails if the specified secrets already exist.
  --no-invalidate            Skip deleting old keys after redeployment
  -h, --help                 Show this help

REQUIRED ENVIRONMENT VARIABLES:
  VERCEL_TOKEN          Vercel API token with project read/write access

OPTIONAL ENVIRONMENT VARIABLES:
  VERCEL_PROJECT_ID     Vercel project ID (auto-detected from .vercel/project.json)
  VERCEL_TEAM_ID        Vercel team/org ID (auto-detected from .vercel/project.json)
  SENTRY_AUTH_TOKEN     Sentry API token (required when Sentry DSN is present)
  SENTRY_ORG            Sentry organization slug (required with Sentry rotation)
  SENTRY_PROJECT        Sentry project slug (required with Sentry rotation)
  SENTRY_URL            Sentry base URL (default: https://sentry.io)
  GCLOUD_PROJECT        GCP project ID (required for --init firebase; auto-detected
                        from service account JSON during normal rotation)

ADDITIONAL VARIABLES (required with --init firebase):
  GCLOUD_PROJECT        GCP project ID (required for --init firebase; auto-detected
                        from service account JSON during normal rotation)
  FIREBASE_SA_EMAIL     Service account email for which the initial GCP key will be
                        created (e.g. my-sa@my-project.iam.gserviceaccount.com)`;

export function parseArgs(argv: string[]): Options {
  const opts: Options = { targetEnv: "all", invalidateKeys: true };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--env") {
      const val = args[++i];
      if (!val) err("--env requires a value");
      const valid = ["production", "preview", "staging", "development", "all"];
      if (!valid.includes(val))
        err(`--env must be one of: ${valid.join(", ")}`);
      opts.targetEnv = val === "staging" ? "preview" : val;
    } else if (arg === "--init") {
      const next = args[i + 1];
      if (next === "firebase" || next === "sentry") {
        opts.init = next;
        i++;
      } else {
        opts.init = "all";
      }
    } else if (arg === "--no-invalidate") {
      opts.invalidateKeys = false;
    } else if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else {
      err(`Unknown option: ${arg}. Run 'rotate-keys --help' for usage.`);
    }
  }

  return opts;
}

function targetEnvs(targetEnv: string): string[] {
  if (targetEnv === "all") return ["production", "preview", "development"];
  return [targetEnv];
}

// ─── Prerequisites ────────────────────────────────────────────────────────────

function checkPrereqs(needsGcloud: boolean): void {
  const missing: string[] = [];
  if (!commandExists("vercel")) missing.push("vercel");
  if (needsGcloud && !commandExists("gcloud")) missing.push("gcloud");
  if (missing.length > 0) err(`Missing required tools: ${missing.join(" ")}`);

  if (!process.env.VERCEL_TOKEN)
    err("VERCEL_TOKEN environment variable is required");

  try {
    runCmd("vercel", ["whoami"]);
  } catch {
    err("Vercel CLI not authenticated. Run: vercel login");
  }
}

// ─── GCP helpers ──────────────────────────────────────────────────────────────

export function createGcpKey(
  outputFile: string,
  saEmail: string,
  gcpProject: string,
): void {
  runCmd("gcloud", [
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

export function listUserManagedGcpKeys(
  saEmail: string,
  gcpProject: string,
): string[] {
  const output = runCmd("gcloud", [
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

export function deleteGcpKey(
  keyId: string,
  saEmail: string,
  gcpProject: string,
): void {
  runCmd("gcloud", [
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

// ─── Firebase rotation ────────────────────────────────────────────────────────

interface FirebasePattern {
  pattern: "json" | "split";
  saEmail: string;
  gcpProject: string;
}

interface FirebaseSaInfo {
  email: string;
  gcpProject: string;
}

interface OldFirebaseKey {
  vercelEnv: string;
  keyId: string;
  saEmail: string;
  gcpProject: string;
}

export async function detectFirebasePattern(
  envs: VercelEnvVar[],
  client: VercelClient,
): Promise<FirebasePattern> {
  const saJsonRecords = envs.filter(
    (e) => e.key === "FIREBASE_SERVICE_ACCOUNT",
  );
  const privateKeyRecords = envs.filter(
    (e) => e.key === "FIREBASE_PRIVATE_KEY",
  );

  if (saJsonRecords.length > 0) {
    const saJson = JSON.parse(
      await client.getEnvVarValue(saJsonRecords[0].id),
    ) as {
      client_email: string;
      project_id: string;
    };
    return {
      pattern: "json",
      saEmail: saJson.client_email,
      gcpProject: process.env.GCLOUD_PROJECT ?? saJson.project_id,
    };
  }

  if (privateKeyRecords.length > 0) {
    const ceRecords = envs.filter((e) => e.key === "FIREBASE_CLIENT_EMAIL");
    if (ceRecords.length === 0)
      err(
        "FIREBASE_CLIENT_EMAIL not found in Vercel (required alongside FIREBASE_PRIVATE_KEY)",
      );

    const saEmail = await client.getEnvVarValue(ceRecords[0].id);
    let gcpProject = process.env.GCLOUD_PROJECT ?? "";
    if (!gcpProject) {
      const pidRecords = envs.filter((e) => e.key === "FIREBASE_PROJECT_ID");
      if (pidRecords.length > 0)
        gcpProject = await client.getEnvVarValue(pidRecords[0].id);
    }
    return { pattern: "split", saEmail, gcpProject };
  }

  return err("No Firebase service account keys found in Vercel");
}

async function getFirebaseSaForEnv(
  vercelEnv: string,
  envs: VercelEnvVar[],
  pattern: "json" | "split",
  client: VercelClient,
): Promise<FirebaseSaInfo | undefined> {
  if (pattern === "json") {
    const record = envs.find(
      (e) =>
        e.key === "FIREBASE_SERVICE_ACCOUNT" && e.target.includes(vercelEnv),
    );
    if (!record) return undefined;
    const saJson = JSON.parse(await client.getEnvVarValue(record.id)) as {
      client_email: string;
      project_id: string;
    };
    return { email: saJson.client_email, gcpProject: saJson.project_id };
  }

  const ceRecord = envs.find(
    (e) => e.key === "FIREBASE_CLIENT_EMAIL" && e.target.includes(vercelEnv),
  );
  if (!ceRecord) return undefined;
  const email = await client.getEnvVarValue(ceRecord.id);

  let gcpProject = "";
  const pidRecord = envs.find(
    (e) => e.key === "FIREBASE_PROJECT_ID" && e.target.includes(vercelEnv),
  );
  if (pidRecord) gcpProject = await client.getEnvVarValue(pidRecord.id);

  return { email, gcpProject };
}

async function getFirebaseKeyIdForEnv(
  vercelEnv: string,
  envs: VercelEnvVar[],
  pattern: "json" | "split",
  client: VercelClient,
): Promise<string> {
  if (pattern === "json") {
    const record = envs.find(
      (e) =>
        e.key === "FIREBASE_SERVICE_ACCOUNT" && e.target.includes(vercelEnv),
    );
    if (!record) return "";
    const saJson = JSON.parse(await client.getEnvVarValue(record.id)) as {
      private_key_id: string;
    };
    return saJson.private_key_id ?? "";
  }

  const record = envs.find(
    (e) => e.key === "FIREBASE_PRIVATE_KEY_ID" && e.target.includes(vercelEnv),
  );
  if (!record) return "";
  return client.getEnvVarValue(record.id);
}

async function rotateFirebase(
  opts: Options,
  client: VercelClient,
  tempDir: string,
): Promise<{ oldKeys: OldFirebaseKey[]; fp: FirebasePattern }> {
  log("Rotating Firebase service account keys...");

  let allEnvs = await client.listEnvVars();
  const fp = await detectFirebasePattern(allEnvs.envs, client);
  log(`  Key pattern: ${fp.pattern}`);
  log(`  Service account : ${fp.saEmail}`);
  log(`  GCP project     : ${fp.gcpProject}`);

  const oldKeys: OldFirebaseKey[] = [];
  let rotatedAny = false;
  const firebaseKeyName =
    fp.pattern === "json" ? "FIREBASE_SERVICE_ACCOUNT" : "FIREBASE_PRIVATE_KEY";

  for (const vercelEnv of targetEnvs(opts.targetEnv)) {
    if (opts.targetEnv === "all") {
      const hasKey = allEnvs.envs.some(
        (e) => e.key === firebaseKeyName && e.target.includes(vercelEnv),
      );
      if (!hasKey) {
        log(
          `  [${vercelEnv}] No existing key — skipping (use --env ${vercelEnv} to explicitly add)`,
        );
        continue;
      }
    }

    const oldKeyId = await getFirebaseKeyIdForEnv(
      vercelEnv,
      allEnvs.envs,
      fp.pattern,
      client,
    );
    if (oldKeyId) {
      log(`  [${vercelEnv}] Current key ID: ${oldKeyId}`);
    } else {
      log(
        `  [${vercelEnv}] No key ID tracked — old key will be swept after redeployment`,
      );
    }

    let envSa = await getFirebaseSaForEnv(
      vercelEnv,
      allEnvs.envs,
      fp.pattern,
      client,
    );
    if (!envSa) {
      if (vercelEnv !== "production") {
        envSa =
          (await getFirebaseSaForEnv(
            "preview",
            allEnvs.envs,
            fp.pattern,
            client,
          )) ??
          (await getFirebaseSaForEnv(
            "development",
            allEnvs.envs,
            fp.pattern,
            client,
          ));
      }
      if (!envSa) envSa = { email: fp.saEmail, gcpProject: fp.gcpProject };
    }

    log(`  [${vercelEnv}] Rotating... (SA: ${envSa.email})`);

    const keyFile = path.join(tempDir, `key-${vercelEnv}.json`);
    createGcpKey(keyFile, envSa.email, envSa.gcpProject);

    const newSaJson = JSON.parse(fs.readFileSync(keyFile, "utf-8")) as {
      private_key_id: string;
      private_key: string;
      [key: string]: unknown;
    };
    log(`  [${vercelEnv}] New key ID: ${newSaJson.private_key_id}`);

    const currentEnvs = await client.listEnvVars();
    if (fp.pattern === "json") {
      await client.setEnvForTarget(
        "FIREBASE_SERVICE_ACCOUNT",
        JSON.stringify(newSaJson),
        vercelEnv,
        currentEnvs.envs,
      );
    } else {
      await client.setEnvForTarget(
        "FIREBASE_PRIVATE_KEY",
        newSaJson.private_key,
        vercelEnv,
        currentEnvs.envs,
      );
      await client.setEnvForTarget(
        "FIREBASE_PRIVATE_KEY_ID",
        newSaJson.private_key_id,
        vercelEnv,
        currentEnvs.envs,
      );
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
    err("No Firebase keys rotated — check --env and project configuration");
  log("Firebase key rotation complete.");
  return { oldKeys, fp };
}

// ─── Sentry rotation ──────────────────────────────────────────────────────────

interface SentryKey {
  id: string;
  dsn: { public: string };
}

async function sentryRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) err("SENTRY_AUTH_TOKEN is required for Sentry key rotation");

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
    throw new Error(
      `Sentry API ${method} ${path} failed (${res.status}): ${text}`,
    );
  }
  if (method === "DELETE") return undefined as T;
  return res.json() as Promise<T>;
}

async function rotateSentry(
  opts: Options,
  client: VercelClient,
): Promise<string> {
  log("Rotating Sentry client key...");

  if (!process.env.SENTRY_AUTH_TOKEN)
    err("SENTRY_AUTH_TOKEN is required for Sentry rotation");
  if (!process.env.SENTRY_ORG)
    err("SENTRY_ORG is required for Sentry rotation");
  if (!process.env.SENTRY_PROJECT)
    err("SENTRY_PROJECT is required for Sentry rotation");

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
    err("Could not find SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN in Vercel");
  log(`  DSN env var: ${dsnKeyName}`);

  const currentDsn = await client.getEnvVarValue(currentDsnId);
  const currentKeys = await sentryRequest<SentryKey[]>(
    `/projects/${org}/${project}/keys/`,
  );
  const dsnPublicKey = currentDsn.replace(/https?:\/\/([^@]+)@.*/, "$1");
  const oldKey = currentKeys.find((k) =>
    new RegExp(dsnPublicKey, "i").test(k.dsn.public),
  );
  if (!oldKey) {
    warn(
      "Could not match current DSN to a Sentry project key — old key will not be invalidated",
    );
  } else {
    log(`  Current Sentry key ID: ${oldKey.id}`);
  }

  log("  Creating new Sentry project key...");
  const label = `rotated-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const newKey = await sentryRequest<SentryKey>(
    `/projects/${org}/${project}/keys/`,
    "POST",
    {
      name: label,
    },
  );
  log(`  New Sentry key ID: ${newKey.id}`);

  for (const vercelEnv of targetEnvs(opts.targetEnv)) {
    const currentEnvs = await client.listEnvVars();
    if (opts.targetEnv === "all") {
      const existing = currentEnvs.envs.find(
        (e) => e.key === dsnKeyName && e.target.includes(vercelEnv),
      );
      if (!existing) {
        log(
          `  [${vercelEnv}] No existing ${dsnKeyName} — skipping (use --env ${vercelEnv} to explicitly add)`,
        );
        continue;
      }
    }
    await client.setEnvForTarget(
      dsnKeyName,
      newKey.dsn.public,
      vercelEnv,
      currentEnvs.envs,
    );
  }

  log("Sentry key rotation complete.");
  return oldKey?.id ?? "";
}

// ─── Redeployment ─────────────────────────────────────────────────────────────

async function triggerAndWaitRedeployments(
  opts: Options,
  client: VercelClient,
): Promise<void> {
  log("Triggering redeployments...");

  const deploymentIds: string[] = [];

  for (const vercelEnv of targetEnvs(opts.targetEnv)) {
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

// ─── Key invalidation ─────────────────────────────────────────────────────────

async function invalidateFirebaseKeys(
  client: VercelClient,
  fp: FirebasePattern,
): Promise<void> {
  log(
    "Invalidating old Firebase keys (sweeping all non-active user-managed keys)...",
  );

  const allEnvs = await client.listEnvVars();
  const activeKeys = new Set<string>();
  const saPairs = new Map<string, string>(); // email → gcpProject
  const unsweepable = new Set<string>();

  for (const checkEnv of ["production", "preview", "development"]) {
    const kid = await getFirebaseKeyIdForEnv(
      checkEnv,
      allEnvs.envs,
      fp.pattern,
      client,
    );
    const saInfo = await getFirebaseSaForEnv(
      checkEnv,
      allEnvs.envs,
      fp.pattern,
      client,
    );

    if (kid) {
      activeKeys.add(kid);
      log(`  Active key [${checkEnv}]: ${kid}`);
    }
    if (saInfo) {
      saPairs.set(saInfo.email, saInfo.gcpProject);
      if (!kid) unsweepable.add(saInfo.email);
    }
  }

  for (const [saEmail, gcpProject] of saPairs) {
    if (unsweepable.has(saEmail)) {
      warn(
        `Skipping stray-key sweep for ${saEmail} — not all environments have FIREBASE_PRIVATE_KEY_ID tracked.`,
      );
      warn("  Rotate all environments first, then re-run to sweep old keys.");
      continue;
    }
    log(`  Sweeping SA: ${saEmail}`);
    const allKeys = listUserManagedGcpKeys(saEmail, gcpProject);
    let deleted = 0;
    for (const keyId of allKeys) {
      if (activeKeys.has(keyId)) continue;
      log(`  Deleting stray key: ${keyId}`);
      try {
        deleteGcpKey(keyId, saEmail, gcpProject);
        log(`  Deleted: ${keyId}`);
        deleted++;
      } catch {
        warn(`Failed to delete key ${keyId} — remove manually:`);
        warn(
          `  gcloud iam service-accounts keys delete ${keyId} --iam-account=${saEmail}`,
        );
      }
    }
    if (deleted === 0) log(`  No stray keys for ${saEmail}.`);
    else log(`  Deleted ${deleted} stray key(s) for ${saEmail}.`);
  }
}

async function invalidateSentryKey(
  oldKeyId: string,
  org: string,
  project: string,
): Promise<void> {
  if (!oldKeyId) {
    warn("No old Sentry key ID recorded — skipping Sentry invalidation");
    return;
  }
  log(`Invalidating old Sentry key: ${oldKeyId}`);
  try {
    await sentryRequest(
      `/projects/${org}/${project}/keys/${oldKeyId}/`,
      "DELETE",
    );
    log("  Old Sentry key deleted.");
  } catch {
    warn(
      `Failed to delete Sentry key ${oldKeyId} — remove it manually in Sentry project settings.`,
    );
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// ─── Init (bootstrap secrets into a project that has none yet) ───────────────

async function initFirebase(
  opts: Options,
  client: VercelClient,
  tempDir: string,
): Promise<void> {
  log("Initializing Firebase service account keys...");

  const saEmail = process.env.FIREBASE_SA_EMAIL;
  if (!saEmail) err("FIREBASE_SA_EMAIL is required for --init firebase");
  const gcpProject = process.env.GCLOUD_PROJECT;
  if (!gcpProject) err("GCLOUD_PROJECT is required for --init firebase");

  const currentEnvs = await client.listEnvVars();
  for (const vercelEnv of targetEnvs(opts.targetEnv)) {
    const keyFile = path.join(tempDir, `key-${vercelEnv}.json`);
    createGcpKey(keyFile, saEmail!, gcpProject!);

    const newSaJson = JSON.parse(fs.readFileSync(keyFile, "utf-8")) as {
      private_key_id: string;
      [key: string]: unknown;
    };
    log(`  [${vercelEnv}] Created key ID: ${newSaJson.private_key_id}`);
    await client.setEnvForTarget(
      "FIREBASE_SERVICE_ACCOUNT",
      JSON.stringify(newSaJson),
      vercelEnv,
      currentEnvs.envs,
    );
    log(`  [${vercelEnv}] Pushed FIREBASE_SERVICE_ACCOUNT`);
  }

  log("Firebase initialization complete.");
}

async function initSentry(opts: Options, client: VercelClient): Promise<void> {
  log("Initializing Sentry DSN...");

  if (!process.env.SENTRY_AUTH_TOKEN)
    err("SENTRY_AUTH_TOKEN is required for --init sentry");
  if (!process.env.SENTRY_ORG) err("SENTRY_ORG is required for --init sentry");
  if (!process.env.SENTRY_PROJECT)
    err("SENTRY_PROJECT is required for --init sentry");

  const org = process.env.SENTRY_ORG;
  const project = process.env.SENTRY_PROJECT;
  const dsnKeyName = "NEXT_PUBLIC_SENTRY_DSN";

  log("  Creating new Sentry project key...");
  const label = `init-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const newKey = await sentryRequest<SentryKey>(
    `/projects/${org}/${project}/keys/`,
    "POST",
    { name: label },
  );
  log(`  New Sentry key ID: ${newKey.id}`);

  const currentEnvs = await client.listEnvVars();
  for (const vercelEnv of targetEnvs(opts.targetEnv)) {
    await client.setEnvForTarget(
      dsnKeyName,
      newKey.dsn.public,
      vercelEnv,
      currentEnvs.envs,
    );
    log(`  [${vercelEnv}] Pushed ${dsnKeyName}`);
  }

  log("Sentry initialization complete.");
}

export async function run(opts: Options): Promise<void> {
  // gcloud is only needed for Firebase-related flows.
  // When opts.init is undefined we don't yet know hasFirebase, so we conservatively
  // require gcloud unless we know this is a Sentry-only init.
  const needsGcloud = opts.init !== "sentry";
  checkPrereqs(needsGcloud);

  const project = detectProject();
  log(
    `Project: ${project.projectId}${project.teamId ? ` (team: ${project.teamId})` : ""}`,
  );

  const client = new VercelClient(
    process.env.VERCEL_TOKEN!,
    project.projectId,
    project.teamId,
  );

  const allEnvs = await client.listEnvVars();
  const envKeys = allEnvs.envs.map((e) => e.key);

  const hasFirebase = envKeys.some((k) =>
    ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_PRIVATE_KEY"].includes(k),
  );
  const hasSentry = envKeys.some((k) =>
    ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"].includes(k),
  );

  if (opts.init) {
    if ((opts.init === "all" || opts.init === "firebase") && hasFirebase) {
      err(
        "Firebase keys already exist in this Vercel project — use sync-env --rotate-keys to update them, not --init.",
      );
    }
    if ((opts.init === "all" || opts.init === "sentry") && hasSentry) {
      err(
        "Sentry keys already exist in this Vercel project — use sync-env --rotate-keys to update them, not --init.",
      );
    }
  } else if (!hasFirebase && !hasSentry) {
    err(
      "No Firebase or Sentry keys found in this Vercel project — nothing to rotate. To push secrets for the first time, use --init.",
    );
  }

  log(
    `Target: ${opts.targetEnv} | ${opts.init ? "Initializing" : `Invalidate after redeployment: ${opts.invalidateKeys}`}`,
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rotate-keys-"));
  try {
    if (opts.init) {
      if (opts.init === "all" || opts.init === "firebase") {
        await initFirebase(opts, client, tempDir);
      }
      if (opts.init === "all" || opts.init === "sentry") {
        await initSentry(opts, client);
      }
      await triggerAndWaitRedeployments(opts, client);
      log("Key initialization complete.");
    } else {
      let oldFirebaseKeys: OldFirebaseKey[] = [];
      let fp: FirebasePattern | undefined;
      let oldSentryKeyId = "";

      if (hasFirebase) {
        ({ oldKeys: oldFirebaseKeys, fp } = await rotateFirebase(
          opts,
          client,
          tempDir,
        ));
      }
      if (hasSentry) {
        oldSentryKeyId = await rotateSentry(opts, client);
      }

      await triggerAndWaitRedeployments(opts, client);

      if (opts.invalidateKeys) {
        log("Invalidating old keys...");
        if (hasFirebase && fp) await invalidateFirebaseKeys(client, fp);
        if (hasSentry && oldSentryKeyId) {
          await invalidateSentryKey(
            oldSentryKeyId,
            process.env.SENTRY_ORG!,
            process.env.SENTRY_PROJECT!,
          );
        }
      } else {
        log("Skipping key invalidation (--no-invalidate)");
        for (const { vercelEnv, keyId, saEmail } of oldFirebaseKeys) {
          warn(
            `Old Firebase key to remove: ${keyId} (${vercelEnv}, account: ${saEmail})`,
          );
        }
        if (oldSentryKeyId) {
          warn(
            `Old Sentry key to remove: ${oldSentryKeyId} (project: ${process.env.SENTRY_ORG}/${process.env.SENTRY_PROJECT})`,
          );
        }
      }

      log("Key rotation complete.");
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  await run(opts);
}

if (require.main === module) {
  main().catch((e: unknown) => {
    if (e instanceof FatalError) {
      console.error(`[rotate-keys] ERROR: ${e.message}`);
      process.exit(1);
    }
    throw e;
  });
}
