import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { run } from "../../sync-env";
import { FatalError } from "../../lib/logger";
import { makeDeploymentDir } from "../fixtures";

// ─── run — dry-run behaviour ──────────────────────────────────────────────────

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

  it("throws FatalError when VERCEL_TOKEN is not set", async () => {
    delete process.env.VERCEL_TOKEN;
    const deployDir = makeDeploymentDir(tmpDir, ["production"], {});
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
    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
      production: { KEY: "val" },
    });
    await expect(
      run({ targetEnv: "staging", deploymentDir: deployDir, dryRun: false }),
    ).rejects.toThrow(FatalError);
  });

  it("dry run logs variables without calling Vercel API", async () => {
    const deployDir = makeDeploymentDir(tmpDir, ["staging"], {
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
    const deployDir = makeDeploymentDir(tmpDir, ["staging"], {
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
    const deployDir = makeDeploymentDir(tmpDir, ["production"], {
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
    const deployDir = makeDeploymentDir(tmpDir, ["staging"], {});
    const warnings: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation((msg: string) =>
      warnings.push(msg),
    );

    await run({ targetEnv: "all", deploymentDir: deployDir, dryRun: true });

    expect(warnings.some((w) => w.includes("No config file"))).toBe(true);
  });
});
