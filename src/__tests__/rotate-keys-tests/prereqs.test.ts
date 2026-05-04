import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FatalError } from "../../lib/logger";

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
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when vercel CLI is missing", async () => {
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockImplementation(
      (cmd) => cmd !== "vercel",
    );

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when gcloud CLI is missing", async () => {
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockImplementation(
      (cmd) => cmd !== "gcloud",
    );

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when vercel CLI is not authenticated", async () => {
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockImplementation((cmd, args) => {
      if (cmd === "vercel" && args.includes("whoami")) {
        throw new Error("not authenticated");
      }
      return "";
    });

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow("authenticated");
  });

  it("throws FatalError when VERCEL_PROJECT_ID is not set and no project.json exists", async () => {
    delete process.env.VERCEL_PROJECT_ID;
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { run } = await import("../../rotate-keys");
    await expect(
      run({ targetEnv: "all", invalidateKeys: true, init: null }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when no Firebase or Sentry keys are found", async () => {
    const subprocess = await import("../../lib/subprocess");
    vi.spyOn(subprocess, "commandExists").mockReturnValue(true);
    vi.spyOn(subprocess, "run").mockReturnValue("rmartz");

    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { run } = await import("../../rotate-keys");
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
