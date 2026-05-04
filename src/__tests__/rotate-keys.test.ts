import * as fs from "fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FatalError } from "../lib/logger";
import { parseArgs } from "../rotate-keys";

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("returns defaults when no args given", () => {
    const opts = parseArgs(["node", "rotate-keys"]);
    expect(opts).toEqual({
      targetEnv: "all",
      invalidateKeys: true,
      init: null,
    });
  });

  it("--env production sets targetEnv", () => {
    const opts = parseArgs(["node", "rotate-keys", "--env", "production"]);
    expect(opts.targetEnv).toBe("production");
  });

  it("--env preview sets targetEnv", () => {
    const opts = parseArgs(["node", "rotate-keys", "--env", "preview"]);
    expect(opts.targetEnv).toBe("preview");
  });

  it("--env staging normalises to preview", () => {
    const opts = parseArgs(["node", "rotate-keys", "--env", "staging"]);
    expect(opts.targetEnv).toBe("preview");
  });

  it("--env development sets targetEnv", () => {
    const opts = parseArgs(["node", "rotate-keys", "--env", "development"]);
    expect(opts.targetEnv).toBe("development");
  });

  it("--env all sets targetEnv", () => {
    const opts = parseArgs(["node", "rotate-keys", "--env", "all"]);
    expect(opts.targetEnv).toBe("all");
  });

  it("--no-invalidate sets invalidateKeys to false", () => {
    const opts = parseArgs(["node", "rotate-keys", "--no-invalidate"]);
    expect(opts.invalidateKeys).toBe(false);
  });

  it("--init alone sets init to all", () => {
    const opts = parseArgs(["node", "rotate-keys", "--init"]);
    expect(opts.init).toBe("all");
  });

  it("--init firebase sets init to firebase", () => {
    const opts = parseArgs(["node", "rotate-keys", "--init", "firebase"]);
    expect(opts.init).toBe("firebase");
  });

  it("--init sentry sets init to sentry", () => {
    const opts = parseArgs(["node", "rotate-keys", "--init", "sentry"]);
    expect(opts.init).toBe("sentry");
  });

  it("--init followed by a non-service arg treats arg as next flag", () => {
    const opts = parseArgs([
      "node",
      "rotate-keys",
      "--init",
      "--env",
      "production",
    ]);
    expect(opts.init).toBe("all");
    expect(opts.targetEnv).toBe("production");
  });

  it("throws FatalError on unknown flag", () => {
    expect(() => parseArgs(["node", "rotate-keys", "--bogus-flag"])).toThrow(
      FatalError,
    );
    expect(() => parseArgs(["node", "rotate-keys", "--bogus-flag"])).toThrow(
      "Unknown option",
    );
  });

  it("throws FatalError on invalid --env value", () => {
    expect(() => parseArgs(["node", "rotate-keys", "--env", "bogus"])).toThrow(
      FatalError,
    );
    expect(() => parseArgs(["node", "rotate-keys", "--env", "bogus"])).toThrow(
      "--env must be one of",
    );
  });

  it('throws FatalError for old "both" alias', () => {
    expect(() => parseArgs(["node", "rotate-keys", "--env", "both"])).toThrow(
      FatalError,
    );
  });

  it("prints usage and exits 0 for --help", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(() => parseArgs(["node", "rotate-keys", "--help"])).toThrow(
      "process.exit",
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("--no-invalidate"),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("--env"));
    exit.mockRestore();
    log.mockRestore();
  });

  it("prints usage and exits 0 for -h", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(() => parseArgs(["node", "rotate-keys", "-h"])).toThrow(
      "process.exit",
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    exit.mockRestore();
    log.mockRestore();
  });
});

// ─── run — prerequisite checks ────────────────────────────────────────────────

describe("run — prerequisite checks", () => {
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

  it("throws FatalError when VERCEL_TOKEN is not set", async () => {
    delete process.env.VERCEL_TOKEN;
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when vercel CLI is missing", async () => {
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockImplementation(
      (cmd) => cmd !== "vercel",
    );

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when gcloud CLI is missing", async () => {
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockImplementation(
      (cmd) => cmd !== "gcloud",
    );

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when vercel CLI is not authenticated", async () => {
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockImplementation((cmd, args) => {
      if (cmd === "vercel" && args.includes("whoami")) {
        throw new Error("not authenticated");
      }
      return "";
    });

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow("authenticated");
  });

  it("throws FatalError when VERCEL_PROJECT_ID is not set and no project.json exists", async () => {
    delete process.env.VERCEL_PROJECT_ID;
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when no Firebase or Sentry keys are found", async () => {
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { VercelClient } = await import("../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow("No Firebase or Sentry");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow("--init");
  });
});

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
    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  }

  it("throws FatalError when --init firebase and Firebase keys already exist", async () => {
    await setupMocks();
    const { VercelClient } = await import("../lib/vercel-api");
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

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: "firebase" }),
    ).rejects.toThrow("already exist");
  });

  it("throws FatalError when --init sentry and Sentry keys already exist", async () => {
    await setupMocks();
    const { VercelClient } = await import("../lib/vercel-api");
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

    const { run } = await import("../rotate-keys");
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
    const { VercelClient } = await import("../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../rotate-keys");
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
    const { VercelClient } = await import("../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../rotate-keys");
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
    const { VercelClient } = await import("../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });

    const { run } = await import("../rotate-keys");
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "production", invalidateKeys: true, init: "sentry" }),
    ).rejects.toThrow("SENTRY_AUTH_TOKEN");
  });
});

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
  });

  it("--init firebase creates a GCP key, pushes FIREBASE_SERVICE_ACCOUNT once (not per-iteration), and triggers a redeployment", async () => {
    process.env.FIREBASE_SA_EMAIL = "sa@my-project.iam.gserviceaccount.com";
    process.env.GCLOUD_PROJECT = "my-project";

    const subprocess = await import("../lib/subprocess");
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

    const { VercelClient } = await import("../lib/vercel-api");
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

    const { run } = await import("../rotate-keys");
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

    const subprocess = await import("../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { VercelClient } = await import("../lib/vercel-api");
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

    const { run } = await import("../rotate-keys");
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
