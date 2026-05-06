import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../../sync-env";
import { makeDeploymentDir } from "../fixtures";

// ─── run — development env sync ───────────────────────────────────────────────

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

  it("syncs public vars for development even when rotateKeys is true", async () => {
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    const mockCreateEnvVar = vi.fn().mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockImplementation(
      mockCreateEnvVar,
    );

    const rotateKeys = await import("../../lib/rotation");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
    });

    expect(mockCreateEnvVar).toHaveBeenCalledWith(
      "DEV_KEY",
      "val",
      "development",
      "plain",
    );
  });

  it("syncs public vars for development when rotateKeys is false", async () => {
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(undefined);
    const mockCreateEnvVar = vi.fn().mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockImplementation(
      mockCreateEnvVar,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: false,
      invalidateKeys: true,
    });

    expect(mockCreateEnvVar).toHaveBeenCalledWith(
      "DEV_KEY",
      "val",
      "development",
      "plain",
    );
  });

  it("dry run includes development vars in sync output", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) =>
      logs.push(msg),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(tmpDir, ["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: true,
      rotateKeys: true,
      invalidateKeys: true,
    });

    expect(logs.some((l) => l.includes("development"))).toBe(true);
    expect(logs.some((l) => l.includes("DEV_KEY"))).toBe(true);
  });
});
