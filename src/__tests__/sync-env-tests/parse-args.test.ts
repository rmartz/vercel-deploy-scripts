import { describe, expect, it, vi } from "vitest";

import { FatalError } from "../../lib/logger";
import { parseArgs } from "../../sync-env";

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
      init: undefined,
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
