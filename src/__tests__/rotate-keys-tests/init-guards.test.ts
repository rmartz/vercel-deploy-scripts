import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FatalError } from "../../lib/logger";

// ─── run — --init guard checks ────────────────────────────────────────────────

describe("run — --init guard checks", () => {
  let origEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    origEnv = { ...process.env };
    process.env.VERCEL_TOKEN = "test-token";
    process.env.VERCEL_PROJECT_ID = "prj_test";
    delete process.env.VERCEL_TEAM_ID;
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  async function setupMocks() {
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  }

  it("throws FatalError when --init firebase and Firebase keys already exist", async () => {
    await setupMocks();
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [
        {
          id: "e1",
          key: "FIREBASE_SERVICE_ACCOUNT",
          value: "{}",
          target: ["production"],
          type: "encrypted",
        },
      ],
      pagination: undefined,
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow("already exist");
  });

  it("throws FatalError when --init sentry and Sentry keys already exist", async () => {
    await setupMocks();
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [
        {
          id: "e1",
          key: "NEXT_PUBLIC_SENTRY_DSN",
          value: "https://abc@sentry.io/1",
          target: ["production"],
          type: "plain",
        },
      ],
      pagination: undefined,
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow("already exist");
  });

  it("throws FatalError when --init firebase and FIREBASE_SA_EMAIL is not set", async () => {
    await setupMocks();
    delete process.env.FIREBASE_SA_EMAIL;
    process.env.GCLOUD_PROJECT = "my-project";
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow("FIREBASE_SA_EMAIL");
  });

  it("throws FatalError when --init firebase and GCLOUD_PROJECT is not set", async () => {
    await setupMocks();
    process.env.FIREBASE_SA_EMAIL = "sa@project.iam.gserviceaccount.com";
    delete process.env.GCLOUD_PROJECT;
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow("GCLOUD_PROJECT");
  });

  it("throws FatalError when --init sentry and SENTRY_AUTH_TOKEN is not set", async () => {
    await setupMocks();
    delete process.env.SENTRY_AUTH_TOKEN;
    process.env.SENTRY_ORG = "my-org";
    process.env.SENTRY_PROJECT = "my-project";
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow("SENTRY_AUTH_TOKEN");
  });
});
