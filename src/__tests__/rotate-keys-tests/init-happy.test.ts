import * as fs from "fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── run — --init happy paths ─────────────────────────────────────────────────

describe("run — --init happy paths", () => {
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
    vi.unstubAllGlobals();
  });

  it("--init firebase creates a GCP key, pushes FIREBASE_SERVICE_ACCOUNT once (not per-iteration), and triggers a redeployment", async () => {
    process.env.FIREBASE_SA_EMAIL = "sa@my-project.iam.gserviceaccount.com";
    process.env.GCLOUD_PROJECT = "my-project";

    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Mock subprocess.run: when gcloud creates a key, write a fake SA key file
    const fakeKey = {
      private_key_id: "key-abc",
      private_key:
        "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
      client_email: "sa@my-project.iam.gserviceaccount.com",
    };
    vi.spyOn(subprocess, "run").mockImplementation((cmd, args) => {
      if (
        cmd === "gcloud" &&
        Array.isArray(args) &&
        args.includes("create") &&
        args.includes("keys")
      ) {
        const outputFile = args[args.indexOf("create") + 1] as string;
        fs.writeFileSync(outputFile, JSON.stringify(fakeKey));
      }
      return "rmartz";
    });

    const { VercelClient } = await import("../../lib/vercel-api");
    const listEnvVarsMock = vi
      .spyOn(VercelClient.prototype, "listEnvVars")
      .mockResolvedValue({ envs: [], pagination: undefined });
    const setEnvMock = vi
      .spyOn(VercelClient.prototype, "setEnvForTarget")
      .mockResolvedValue(undefined);
    vi.spyOn(VercelClient.prototype, "getLatestDeployment").mockResolvedValue({
      uid: "dep_1",
      url: "my-project.vercel.app",
      name: "my-project",
    });
    vi.spyOn(VercelClient.prototype, "triggerRedeployment").mockResolvedValue(
      "dep_2",
    );
    vi.spyOn(VercelClient.prototype, "pollDeploymentStatus").mockResolvedValue(
      undefined,
    );

    const { run } = await import("../../rotate-keys");
    await run({
      targetEnv: "production",
      invalidateKeys: true,
      init: "firebase",
    });

    // listEnvVars should be called exactly twice: once in run() for the guard
    // check, and once in initFirebase before the loop (not once per iteration)
    expect(listEnvVarsMock).toHaveBeenCalledTimes(2);

    // setEnvForTarget should be called once for the single targeted env
    expect(setEnvMock).toHaveBeenCalledOnce();
    expect(setEnvMock).toHaveBeenCalledWith(
      "FIREBASE_SERVICE_ACCOUNT",
      expect.stringContaining("key-abc"),
      "production",
      expect.any(Array),
    );

    // A redeployment should have been triggered
    expect(
      vi.mocked(VercelClient.prototype.triggerRedeployment),
    ).toHaveBeenCalled();
  });

  it("--init sentry creates a Sentry key, pushes NEXT_PUBLIC_SENTRY_DSN once (not per-iteration), and triggers a redeployment", async () => {
    process.env.SENTRY_AUTH_TOKEN = "sntryu_token";
    process.env.SENTRY_ORG = "my-org";
    process.env.SENTRY_PROJECT = "my-project";

    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { VercelClient } = await import("../../lib/vercel-api");
    const listEnvVarsMock = vi
      .spyOn(VercelClient.prototype, "listEnvVars")
      .mockResolvedValue({ envs: [], pagination: undefined });
    const setEnvMock = vi
      .spyOn(VercelClient.prototype, "setEnvForTarget")
      .mockResolvedValue(undefined);
    vi.spyOn(VercelClient.prototype, "getLatestDeployment").mockResolvedValue({
      uid: "dep_1",
      url: "my-project.vercel.app",
      name: "my-project",
    });
    vi.spyOn(VercelClient.prototype, "triggerRedeployment").mockResolvedValue(
      "dep_2",
    );
    vi.spyOn(VercelClient.prototype, "pollDeploymentStatus").mockResolvedValue(
      undefined,
    );

    // Mock global fetch for Sentry API call
    const fakeDsn = "https://abc123@o0.ingest.sentry.io/1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "sentry-key-1", dsn: { public: fakeDsn } }),
        text: async () => "",
      }),
    );

    const { run } = await import("../../rotate-keys");
    await run({
      targetEnv: "production",
      invalidateKeys: true,
      init: "sentry",
    });

    // listEnvVars should be called exactly once (not once per target env)
    // The first call is in run() to check for existing keys; the second is in initSentry
    expect(listEnvVarsMock).toHaveBeenCalledTimes(2);

    // setEnvForTarget should be called once for the single targeted env
    expect(setEnvMock).toHaveBeenCalledOnce();
    expect(setEnvMock).toHaveBeenCalledWith(
      "NEXT_PUBLIC_SENTRY_DSN",
      fakeDsn,
      "production",
      expect.any(Array),
    );

    // A redeployment should have been triggered
    expect(
      vi.mocked(VercelClient.prototype.triggerRedeployment),
    ).toHaveBeenCalled();
  });
});
