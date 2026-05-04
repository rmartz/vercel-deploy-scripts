import { describe, expect, it, vi } from "vitest";

import { FatalError } from "../../lib/logger";
import { parseArgs } from "../../rotate-keys";

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("returns defaults when no args given", () => {
    const opts = parseArgs(["node", "rotate-keys"]);
    expect(opts).toEqual({
      targetEnv: "all",
      invalidateKeys: true,
      init: undefined,
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
