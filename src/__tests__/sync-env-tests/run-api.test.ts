import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../../sync-env";

// ─── run — Vercel API create / update ─────────────────────────────────────────

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

  function makeDeploymentDir(
    active: string[],
    envVars: Record<string, Record<string, string>>,
  ): string {
    const deployDir = path.join(tmpDir, "deployment");
    fs.mkdirSync(deployDir);
    fs.writeFileSync(
      path.join(deployDir, "environments.yml"),
      `active:\n${active.map((e) => `  - ${e}`).join("\n")}\n`,
    );
    for (const [envName, vars] of Object.entries(envVars)) {
      const lines = Object.entries(vars)
        .map(([k, v]) => `${k}: "${v}"`)
        .join("\n");
      fs.writeFileSync(path.join(deployDir, `${envName}.yml`), lines + "\n");
    }
    return deployDir;
  }

  it("calls Vercel API to create env vars that do not exist", async () => {
    const { VercelClient } = await import("../../lib/vercel-api");
    const mockListEnvVars = vi
      .fn()
      .mockResolvedValue({ envs: [], pagination: undefined });
    const mockCreateEnvVar = vi.fn().mockResolvedValue({ id: "env_new" });
    const mockUpdateEnvVar = vi.fn();
    const mockFindEnvVar = vi.fn().mockReturnValue(undefined);
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockImplementation(
      mockListEnvVars,
    );
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockImplementation(
      mockCreateEnvVar,
    );
    vi.spyOn(VercelClient.prototype, "updateEnvVar").mockImplementation(
      mockUpdateEnvVar,
    );
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockImplementation(
      mockFindEnvVar,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "my_value" },
    });
    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: false });

    expect(mockCreateEnvVar).toHaveBeenCalledWith(
      "MY_KEY",
      "my_value",
      "production",
      "plain",
    );
    expect(mockUpdateEnvVar).not.toHaveBeenCalled();
  });

  it("calls Vercel API to update env vars that already exist", async () => {
    const existing = {
      id: "env_existing",
      key: "MY_KEY",
      target: ["production"],
      value: "old",
      type: "plain" as const,
    };
    const { VercelClient } = await import("../../lib/vercel-api");
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockResolvedValue({
      envs: [existing],
      pagination: undefined,
    });
    vi.spyOn(VercelClient.prototype, "findEnvVar").mockReturnValue(existing);
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(VercelClient.prototype, "updateEnvVar").mockImplementation(
      mockUpdate,
    );
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockResolvedValue({
      id: "x",
      key: "k",
      value: "v",
      target: [],
      type: "plain",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "new_value" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: false,
      invalidateKeys: true,
      init: null,
    });

    expect(mockUpdate).toHaveBeenCalledWith("env_existing", "new_value");
  });
});
