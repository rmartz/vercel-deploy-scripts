import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseArgs, run } from "../sync-env";
import { FatalError } from "../lib/logger";

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("returns defaults when no args given", () => {
    const opts = parseArgs(["node", "sync-env"]);
    expect(opts).toEqual({
      targetEnv: "all",
      deploymentDir: "deployment",
      dryRun: false,
      rotateKeys: false,
      invalidateKeys: true,
      init: null,
    });
  });

  it("--env sets targetEnv", () => {
    const opts = parseArgs(["node", "sync-env", "--env", "staging"]);
    expect(opts.targetEnv).toBe("staging");
  });

  it("--deployment-dir sets deploymentDir", () => {
    const opts = parseArgs([
      "node",
      "sync-env",
      "--deployment-dir",
      "infra/deploy",
    ]);
    expect(opts.deploymentDir).toBe("infra/deploy");
  });

  it("--dry-run sets dryRun", () => {
    const opts = parseArgs(["node", "sync-env", "--dry-run"]);
    expect(opts.dryRun).toBe(true);
  });

  it("--rotate-keys sets rotateKeys", () => {
    const opts = parseArgs(["node", "sync-env", "--rotate-keys"]);
    expect(opts.rotateKeys).toBe(true);
  });

  it("--no-invalidate sets invalidateKeys to false", () => {
    const opts = parseArgs(["node", "sync-env", "--no-invalidate"]);
    expect(opts.invalidateKeys).toBe(false);
  });

  it("returns defaults for rotateKeys and invalidateKeys when not specified", () => {
    const opts = parseArgs(["node", "sync-env"]);
    expect(opts.rotateKeys).toBe(false);
    expect(opts.invalidateKeys).toBe(true);
  });

  it("--init alone sets init to all and implies rotateKeys", () => {
    const opts = parseArgs(["node", "sync-env", "--init"]);
    expect(opts.init).toBe("all");
    expect(opts.rotateKeys).toBe(true);
  });

  it("--init firebase sets init to firebase and implies rotateKeys", () => {
    const opts = parseArgs(["node", "sync-env", "--init", "firebase"]);
    expect(opts.init).toBe("firebase");
    expect(opts.rotateKeys).toBe(true);
  });

  it("--init sentry sets init to sentry and implies rotateKeys", () => {
    const opts = parseArgs(["node", "sync-env", "--init", "sentry"]);
    expect(opts.init).toBe("sentry");
    expect(opts.rotateKeys).toBe(true);
  });

  it("--init followed by a non-service arg treats arg as next flag", () => {
    const opts = parseArgs([
      "node",
      "sync-env",
      "--init",
      "--env",
      "production",
    ]);
    expect(opts.init).toBe("all");
    expect(opts.targetEnv).toBe("production");
  });

  it("throws FatalError on unknown flag", () => {
    expect(() => parseArgs(["node", "sync-env", "--bogus"])).toThrow(
      FatalError,
    );
    expect(() => parseArgs(["node", "sync-env", "--bogus"])).toThrow(
      "Unknown option",
    );
  });

  it("throws FatalError when --env is missing its value", () => {
    expect(() => parseArgs(["node", "sync-env", "--env"])).toThrow(FatalError);
  });

  it("prints usage and exits 0 for --help", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(() => parseArgs(["node", "sync-env", "--help"])).toThrow(
      "process.exit",
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    exit.mockRestore();
    log.mockRestore();
  });

  it("prints usage and exits 0 for -h", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(() => parseArgs(["node", "sync-env", "-h"])).toThrow("process.exit");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
    exit.mockRestore();
    log.mockRestore();
  });
});

// ─── run ──────────────────────────────────────────────────────────────────────

describe("run", () => {
  let tmpDir: string;
  let origEnv: NodeJS.ProcessEnv;
  let origCwd: () => string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-test-"));
    origEnv = { ...process.env };
    origCwd = process.cwd.bind(process);
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

  it("throws FatalError when VERCEL_TOKEN is not set", async () => {
    delete process.env.VERCEL_TOKEN;
    const deployDir = makeDeploymentDir(["production"], {});
    await expect(
      run({ targetEnv: "all", deploymentDir: deployDir, dryRun: false }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when deployment directory does not exist", async () => {
    await expect(
      run({
        targetEnv: "all",
        deploymentDir: "/nonexistent/path",
        dryRun: false,
      }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when environments.yml is missing", async () => {
    const deployDir = path.join(tmpDir, "deployment");
    fs.mkdirSync(deployDir);
    await expect(
      run({ targetEnv: "all", deploymentDir: deployDir, dryRun: false }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when no active environments are defined", async () => {
    const deployDir = path.join(tmpDir, "deployment");
    fs.mkdirSync(deployDir);
    fs.writeFileSync(path.join(deployDir, "environments.yml"), "active: []\n");
    await expect(
      run({ targetEnv: "all", deploymentDir: deployDir, dryRun: false }),
    ).rejects.toThrow(FatalError);
  });

  it("throws FatalError when --env is not in active environments", async () => {
    const deployDir = makeDeploymentDir(["production"], {
      production: { KEY: "val" },
    });
    await expect(
      run({ targetEnv: "staging", deploymentDir: deployDir, dryRun: false }),
    ).rejects.toThrow(FatalError);
  });

  it("dry run logs variables without calling Vercel API", async () => {
    const deployDir = makeDeploymentDir(["staging"], {
      staging: { MY_VAR: "hello" },
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) =>
      logs.push(msg),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: true });

    expect(logs.some((l) => l.includes("Dry run"))).toBe(true);
    expect(logs.some((l) => l.includes("MY_VAR"))).toBe(true);
  });

  it("dry run maps staging → preview in log output", async () => {
    const deployDir = makeDeploymentDir(["staging"], {
      staging: { MY_VAR: "hello" },
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) =>
      logs.push(msg),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: true });

    expect(
      logs.some((l) => l.includes("staging") && l.includes("preview")),
    ).toBe(true);
  });

  it("dry run maps production → production", async () => {
    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_VAR: "hello" },
    });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) =>
      logs.push(msg),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: true });

    expect(
      logs.some((l) => l.includes("production") && l.includes("production")),
    ).toBe(true);
  });

  it("dry run emits a warning when per-env YAML is missing", async () => {
    const deployDir = makeDeploymentDir(["staging"], {});
    const warnings: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation((msg: string) =>
      warnings.push(msg),
    );

    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: true });

    expect(warnings.some((w) => w.includes("No config file"))).toBe(true);
  });

  it("calls Vercel API to create env vars that do not exist", async () => {
    const { VercelClient } = await import("../lib/vercel-api");
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
    const { VercelClient } = await import("../lib/vercel-api");
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

  it("calls rotate-keys run after syncing when rotateKeys is true", async () => {
    const rotateKeys = await import("../rotate-keys");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../lib/vercel-api");
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

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: null,
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "all",
      invalidateKeys: true,
      init: null,
    });
  });

  it("maps staging targetEnv to preview when calling rotate-keys", async () => {
    const rotateKeys = await import("../rotate-keys");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../lib/vercel-api");
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

    const deployDir = makeDeploymentDir(["staging"], {
      staging: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "staging",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: false,
      init: null,
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "preview",
      invalidateKeys: false,
      init: null,
    });
  });

  it("skips key rotation during dry run", async () => {
    const rotateKeys = await import("../rotate-keys");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: true,
      rotateKeys: true,
      invalidateKeys: true,
      init: null,
    });

    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("forwards non-null init value to rotate-keys run", async () => {
    const rotateKeys = await import("../rotate-keys");
    const mockRotate = vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);

    const { VercelClient } = await import("../lib/vercel-api");
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

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "val" },
    });
    await run({
      targetEnv: "all",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: "firebase",
    });

    expect(mockRotate).toHaveBeenCalledWith({
      targetEnv: "all",
      invalidateKeys: true,
      init: "firebase",
    });
  });

  it("dry-run logs 'Would init secrets' when init is non-null", async () => {
    const rotateKeys = await import("../rotate-keys");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    const mockLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["production"], {
      production: { MY_KEY: "val" },
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

  it("skips public var sync for development when rotateKeys is true", async () => {
    const { VercelClient } = await import("../lib/vercel-api");
    const mockListEnvVars = vi
      .fn()
      .mockResolvedValue({ envs: [], pagination: undefined });
    const mockCreateEnvVar = vi.fn();
    vi.spyOn(VercelClient.prototype, "listEnvVars").mockImplementation(
      mockListEnvVars,
    );
    vi.spyOn(VercelClient.prototype, "createEnvVar").mockImplementation(
      mockCreateEnvVar,
    );

    const rotateKeys = await import("../rotate-keys");
    vi.spyOn(rotateKeys, "run").mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: true,
      invalidateKeys: true,
      init: null,
    });

    expect(mockCreateEnvVar).not.toHaveBeenCalled();
  });

  it("does not skip development sync when rotateKeys is false", async () => {
    const { VercelClient } = await import("../lib/vercel-api");
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

    const deployDir = makeDeploymentDir(["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: false,
      rotateKeys: false,
      invalidateKeys: true,
      init: null,
    });

    expect(mockCreateEnvVar).toHaveBeenCalledWith(
      "DEV_KEY",
      "val",
      "development",
      "plain",
    );
  });

  it("dry run logs development skip message when rotateKeys is true", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((msg: string) =>
      logs.push(msg),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const deployDir = makeDeploymentDir(["development"], {
      development: { DEV_KEY: "val" },
    });
    await run({
      targetEnv: "development",
      deploymentDir: deployDir,
      dryRun: true,
      rotateKeys: true,
      invalidateKeys: true,
      init: null,
    });

    expect(
      logs.some((l) => l.includes("development") && l.includes("skip")),
    ).toBe(true);
  });
});
