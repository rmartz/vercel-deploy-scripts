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

  it("--init firebase --env all includes development target using staging SA credentials", async () => {
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

    // Development is not in environments.yml — it mirrors staging automatically.
    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        MY_KEY: "pval",
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
      },
      staging: {
        MY_KEY: "sval",
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

    expect(mockRotate).toHaveBeenCalledTimes(3);
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEnv: "production",
        init: "firebase",
        firebaseSaEmail: "sa@prod.iam.gserviceaccount.com",
        gcpProject: "my-prod",
      }),
    );
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEnv: "preview",
        init: "firebase",
        firebaseSaEmail: "sa@staging.iam.gserviceaccount.com",
        gcpProject: "my-staging",
      }),
    );
    // Development uses staging SA credentials (shares the same Firebase project)
    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEnv: "development",
        init: "firebase",
        firebaseSaEmail: "sa@staging.iam.gserviceaccount.com",
        gcpProject: "my-staging",
      }),
    );
  });

  it("validates Firebase credentials for development target against staging YAML in --init firebase", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Staging YAML is missing Firebase vars — development credential validation
    // reads from staging (the devSource) and must report the error under [development].
    const deployDir = makeDeploymentDir(tmpDir, ["production", "staging"], {
      production: {
        FIREBASE_SA_EMAIL: "sa@prod.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-prod",
      },
      staging: {},
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
    ).rejects.toThrow(/\[development\]/);
  });

  it("--init auto --env development scans devSource (staging) for public vars", async () => {
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

    // Firebase vars are in staging YAML; --init auto with --env development should
    // detect them via devSource (staging) and init the development target.
    const deployDir = makeDeploymentDir(tmpDir, ["staging"], {
      staging: {
        MY_KEY: "sval",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "my-staging",
        FIREBASE_SA_EMAIL: "sa@staging.iam.gserviceaccount.com",
        FIREBASE_PROJECT_ID: "my-staging",
      },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "auto",
    });

    expect(mockRotate).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEnv: "development",
        init: "firebase",
        firebaseSaEmail: "sa@staging.iam.gserviceaccount.com",
        gcpProject: "my-staging",
      }),
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
});
