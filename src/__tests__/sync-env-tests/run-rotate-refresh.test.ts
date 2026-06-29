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

  // ─── --refresh-previews ───────────────────────────────────────────────────────

  it("--refresh-previews redeploys each READY preview deployment after rotation", async () => {
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
