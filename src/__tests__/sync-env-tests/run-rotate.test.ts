import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../../sync-env";
import { makeDeploymentDir } from "../fixtures";

// ─── run — --rotate-keys / --init forwarding ──────────────────────────────────

describe("run", () => {
  let tmpDir: string;
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-test-"));
    origEnv = { ...process.env };
    process.env.VERCEL_TOKEN = "test-token";
    process.env.VERCEL_PROJECT_ID = "prj_test";
    delete process.env.VERCEL_TEAM_ID;
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("calls rotate-keys run after syncing when rotateKeys is true", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "all",
      invalidateKeys: true,
    });
  });

  it("maps staging targetEnv to preview when calling rotate-keys", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["staging"], {
      staging: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "staging",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: false,
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "preview",
      invalidateKeys: false,
    });
  });

  it("skips key rotation during dry run", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: true,
      rotateKeys: true,
      invalidateKeys: true,
    });

    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("forwards non-null init value to rotate-keys run for a specific env", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: {
        MY_KEY: "val",
        FIREBASE_SA_EMAIL: "sa@my-project.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-project",
      },
    });
    await run({
      targetEnv: "production",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "firebase",
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "production",
      invalidateKeys: true,
      init: "firebase",
      firebaseSaEmail: "sa@my-project.iam.gserviceaccount.com",
      gcpProject: "my-project",
    });
  });

  it("--init --env all iterates once per deployment env with per-env YAML values", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "prod-val",
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
      },
      staging: {
        MY_KEY: "staging-val",
        FIREBASE_SA_EMAIL: "sa@staging.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-staging",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "firebase",
    });

    expect(mockRotate).toHaveBeenCalledTimes(2);
    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "production",
      invalidateKeys: true,
      init: "firebase",
      firebaseSaEmail: "sa@prod.iam.gserviceaccount.com",
      gcpProject: "my-prod",
    });
    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "preview",
      invalidateKeys: true,
      init: "firebase",
      firebaseSaEmail: "sa@staging.iam.gserviceaccount.com",
      gcpProject: "my-staging",
    });
  });

  it("--init sentry --env all calls rotate once with targetEnv all", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "pval",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
      staging: {
        MY_KEY: "sval",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "sentry",
    });

    expect(mockRotate).toHaveBeenCalledTimes(1);
    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "all",
      invalidateKeys: true,
      init: "sentry",
      sentryOrg: "my-org",
      sentryProject: "my-proj",
    });
  });

  it("--init all --env all calls Sentry once and Firebase per deployment env", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "pval",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
      },
      staging: {
        MY_KEY: "sval",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
        FIREBASE_SA_EMAIL: "sa@staging.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-staging",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "all",
    });

    expect(mockRotate).toHaveBeenCalledTimes(3);
    expect(mockRotate).toHaveBeenNthCalledWith(1, {
      targetEnv: "all",
      invalidateKeys: true,
      init: "sentry",
      sentryOrg: "my-org",
      sentryProject: "my-proj",
    });
    expect(mockRotate).toHaveBeenNthCalledWith(2, {
      targetEnv: "production",
      invalidateKeys: true,
      init: "firebase",
      firebaseSaEmail: "sa@prod.iam.gserviceaccount.com",
      gcpProject: "my-prod",
    });
    expect(mockRotate).toHaveBeenNthCalledWith(3, {
      targetEnv: "preview",
      invalidateKeys: true,
      init: "firebase",
      firebaseSaEmail: "sa@staging.iam.gserviceaccount.com",
      gcpProject: "my-staging",
    });
  });

  it("dry-run logs 'Would init secrets' when init is non-null", async () => {
    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    const mockLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: {
        MY_KEY: "val",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: true,
      rotateKeys: true,
      invalidateKeys: true,
      init: "sentry",
    });

    const logMessages = mockLog.mock.calls.map((c) => c[0] as string);
    expect(logMessages.some((m) => m.includes("Would init secrets"))).toBe(
      true,
    );
    expect(logMessages.some((m) => m.includes("Would rotate keys"))).toBe(
      false,
    );
  });

  it("reports all missing firebase vars across all envs before any API call", async () => {
    delete process.env.FIREBASE_SA_EMAIL;
    delete process.env.GCLOUD_PROJECT;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: { MY_KEY: "val", FIREBASE_PROJECT_ID: "proj-prod" },
      staging: { MY_KEY: "val" },
    });

    await expect(
      run({
        targetEnv: "all",
        deploymentDir: deployDir,
        dryRun: false,
        rotateKeys: true,
        invalidateKeys: true,
        init: "firebase",
      }),
    ).rejects.toThrow(
      /FIREBASE_SA_EMAIL \[production\].*FIREBASE_SA_EMAIL \[staging\].*FIREBASE_PROJECT_ID \[staging\]/s,
    );
  });

  // ─── --init auto detection ────────────────────────────────────────────────────

  it("--init auto detects Firebase when YAML has Firebase public vars", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: {
        MY_KEY: "val",
        FIREBASE_SA_EMAIL: "sa@my-proj.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "auto",
    });

    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "firebase" }),
    );
    expect(mockRotate).not.toHaveBeenCalledWith(
      expect.objectContaining({ init: "sentry" }),
    );
  });

  it("--init auto detects Sentry when YAML has Sentry public vars", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: {
        MY_KEY: "val",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "auto",
    });

    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "sentry" }),
    );
    expect(mockRotate).not.toHaveBeenCalledWith(
      expect.objectContaining({ init: "firebase" }),
    );
  });

  it("--init auto detects both when YAML has both Firebase and Sentry public vars", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: {
        MY_KEY: "val",
        FIREBASE_SA_EMAIL: "sa@my-proj.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-proj",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-sentry-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "auto",
    });

    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "sentry" }),
    );
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "firebase" }),
    );
  });

  it("--init auto errors when YAML has no Firebase or Sentry public vars", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });

    await expect(
      run({
        targetEnv: "all",
        deploymentDir: deployDir,
        dryRun: false,
        rotateKeys: true,
        invalidateKeys: true,
        init: "auto",
      }),
    ).rejects.toThrow(/nothing to initialize/);
  });

  it("--init auto --env staging reads only staging YAML, not other envs", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "pval",
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
      },
      staging: { MY_KEY: "sval" },
    });

    await expect(
      run({
        targetEnv: "staging",
        deploymentDir: deployDir,
        dryRun: false,
        rotateKeys: true,
        invalidateKeys: true,
        init: "auto",
      }),
    ).rejects.toThrow(/nothing to initialize/);
  });

  it("--init auto --env all aggregates detection across all non-dev envs", async () => {
    const rotateKeys = await import("../../lib/rotation");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "pval",
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
      staging: {
        MY_KEY: "sval",
        FIREBASE_SA_EMAIL: "sa@staging.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-staging",
        SENTRY_ORG: "my-org",
        SENTRY_PROJECT: "my-proj",
      },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "auto",
    });

    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "firebase" }),
    );
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({ init: "sentry" }),
    );
  });

  it("accepts shell env as fallback for missing YAML firebase vars", async () => {
    process.env.FIREBASE_SA_EMAIL = "sa@fallback.iam.gserviceaccount.com";
    process.env.GCLOUD_PROJECT = "fallback-project";
    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });

    // Should not throw — shell env vars satisfy the validation
    await expect(
      run({
        targetEnv: "all",
        deploymentDir: deployDir,
        dryRun: false,
        rotateKeys: true,
        invalidateKeys: true,
        init: "firebase",
      }),
    ).resolves.toBeUndefined();
  });

  // ─── --refresh-previews ───────────────────────────────────────────────────────

  it("--refresh-previews redeплoys each READY preview deployment after rotation", async () => {
    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    const listPreviewMock = vi
      .spyOn(VercelClient.prototype, "listPreviewDeployments")
      .mockResolvedValue([
        { uid: "dpl_preview1", url: "pr-1.vercel.app", name: "my-project" },
        { uid: "dpl_preview2", url: "pr-2.vercel.app", name: "my-project" },
      ]);
    const triggerMock = vi
      .spyOn(VercelClient.prototype, "triggerRedeployment")
      .mockResolvedValue("dpl_new");
    vi.spyOn(VercelClient.prototype, "pollDeploymentStatus").mockResolvedValue(
      undefined,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      refreshPreviews: true,
    });

    expect(listPreviewMock).toHaveBeenCalledOnce();
    expect(triggerMock).toHaveBeenCalledTimes(2);
    expect(triggerMock).toHaveBeenCalledWith("dpl_preview1", "my-project");
    expect(triggerMock).toHaveBeenCalledWith("dpl_preview2", "my-project");
  });

  it("--refresh-previews is a no-op when no preview deployments exist", async () => {
    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(
      VercelClient.prototype,
      "listPreviewDeployments",
    ).mockResolvedValue([]);
    const triggerMock = vi.spyOn(VercelClient.prototype, "triggerRedeployment");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      refreshPreviews: true,
    });

    expect(triggerMock).not.toHaveBeenCalled();
  });

  it("does not call listPreviewDeployments when --refresh-previews is absent", async () => {
    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    const listPreviewMock = vi.spyOn(
      VercelClient.prototype,
      "listPreviewDeployments",
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
    });

    expect(listPreviewMock).not.toHaveBeenCalled();
  });
});
