import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Pure function tests (import before mocks)
// ---------------------------------------------------------------------------

import {
  isNpx,
  getUpdateCommand,
  shouldThrottleCheck,
  writeCheckTimestamp,
  detectPackageManager,
  formatReleaseBody,
} from "../self-update.js";

const NODE_BIN = process.argv[0] ?? "node";

describe("isNpx", () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it("returns true when argv[1] contains /_npx/", () => {
    process.argv = [NODE_BIN, "/Users/me/.npm/_npx/abc123/node_modules/.bin/brainkit"];
    expect(isNpx()).toBe(true);
  });

  it("returns false for normal global install path", () => {
    process.argv = [NODE_BIN, "/usr/local/lib/node_modules/@2brain/brainkit/dist/cli/index.js"];
    expect(isNpx()).toBe(false);
  });
});

describe("getUpdateCommand", () => {
  it("returns npm install command for npm", () => {
    expect(getUpdateCommand("npm")).toEqual({
      binary: "npm",
      args: ["install", "-g", "@2brain/brainkit@latest"],
    });
  });

  it("returns pnpm add command for pnpm", () => {
    expect(getUpdateCommand("pnpm")).toEqual({
      binary: "pnpm",
      args: ["add", "-g", "@2brain/brainkit@latest"],
    });
  });

  it("returns yarn global add command for yarn", () => {
    expect(getUpdateCommand("yarn")).toEqual({
      binary: "yarn",
      args: ["global", "add", "@2brain/brainkit@latest"],
    });
  });

  it("returns bun add command for bun", () => {
    expect(getUpdateCommand("bun")).toEqual({
      binary: "bun",
      args: ["add", "-g", "@2brain/brainkit@latest"],
    });
  });
});

describe("shouldThrottleCheck", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns false when timestamp file does not exist", () => {
    expect(shouldThrottleCheck(tempDir)).toBe(false);
  });

  it("returns false when timestamp is older than 24h", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(path.join(tempDir, "last-update-check"), old + "\n", "utf-8");
    expect(shouldThrottleCheck(tempDir)).toBe(false);
  });

  it("returns true when timestamp is less than 24h old", () => {
    const recent = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(path.join(tempDir, "last-update-check"), recent + "\n", "utf-8");
    expect(shouldThrottleCheck(tempDir)).toBe(true);
  });
});

describe("writeCheckTimestamp", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes ISO timestamp to last-update-check file", () => {
    writeCheckTimestamp(tempDir);
    const content = fs.readFileSync(path.join(tempDir, "last-update-check"), "utf-8").trim();
    // Should be a valid ISO date string
    expect(new Date(content).getTime()).not.toBeNaN();
  });

  it("creates parent dirs if needed", () => {
    const nested = path.join(tempDir, "nested", "dir");
    writeCheckTimestamp(nested);
    expect(fs.existsSync(path.join(nested, "last-update-check"))).toBe(true);
  });
});

describe("detectPackageManager", () => {
  const originalArgv = [...process.argv];
  const originalUA = process.env["npm_config_user_agent"];

  afterEach(() => {
    process.argv = [...originalArgv];
    if (originalUA !== undefined) {
      process.env["npm_config_user_agent"] = originalUA;
    } else {
      delete process.env["npm_config_user_agent"];
    }
  });

  it("detects bun from binary path", () => {
    process.argv = [NODE_BIN, "/Users/me/.bun/install/global/brainkit"];
    expect(detectPackageManager()).toBe("bun");
  });

  it("detects pnpm from binary path", () => {
    process.argv = [NODE_BIN, "/Users/me/.pnpm-global/brainkit"];
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("detects yarn from binary path", () => {
    process.argv = [NODE_BIN, "/Users/me/.yarn/bin/brainkit"];
    expect(detectPackageManager()).toBe("yarn");
  });

  it("falls back to npm_config_user_agent", () => {
    process.argv = [NODE_BIN, "/usr/local/bin/brainkit"];
    process.env["npm_config_user_agent"] = "pnpm/8.0.0 node/v20.0.0";
    expect(detectPackageManager()).toBe("pnpm");
  });

  it("defaults to npm when no signals", () => {
    process.argv = [NODE_BIN, "/usr/local/bin/brainkit"];
    delete process.env["npm_config_user_agent"];
    expect(detectPackageManager()).toBe("npm");
  });
});

describe("formatReleaseBody", () => {
  it("converts ### headers to indented plain text", () => {
    const result = formatReleaseBody("### Added\n- Feature one\n- Feature two");
    expect(result).toBe("  Added\n    - Feature one\n    - Feature two");
  });

  it("strips empty lines", () => {
    const result = formatReleaseBody("### Added\n- Feature\n\n### Fixed\n- Bug");
    expect(result).toBe("  Added\n    - Feature\n  Fixed\n    - Bug");
  });

  it("handles body with no headers", () => {
    const result = formatReleaseBody("- Just a bullet");
    expect(result).toBe("    - Just a bullet");
  });
});

// ---------------------------------------------------------------------------
// maybeCheckForSelfUpdate — mocked integration tests
// ---------------------------------------------------------------------------

vi.mock("../../core/index.js", () => ({
  getConfigDir: vi.fn(),
  readGlobalConfig: vi.fn(),
  writeGlobalConfig: vi.fn(),
}));

vi.mock("../version.js", () => ({
  version: "0.6.1",
}));

vi.mock("../version-utils.js", () => ({
  isOlderThan: vi.fn(),
  getLatestNpmVersion: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  note: vi.fn(),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    warn: vi.fn(),
  },
}));

import { getConfigDir, readGlobalConfig, writeGlobalConfig } from "../../core/index.js";
import { isOlderThan, getLatestNpmVersion } from "../version-utils.js";
import * as p from "@clack/prompts";
import { maybeCheckForSelfUpdate, cleanSkipVersions, formatChangelog, fetchChangelog } from "../self-update.js";

const mockGetConfigDir = vi.mocked(getConfigDir);
const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockWriteGlobalConfig = vi.mocked(writeGlobalConfig);
const mockIsOlderThan = vi.mocked(isOlderThan);
const mockGetLatestNpmVersion = vi.mocked(getLatestNpmVersion);
const mockSelect = vi.mocked(p.select);
const mockIsCancel = vi.mocked(p.isCancel);
const mockNote = vi.mocked(p.note);

describe("cleanSkipVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Control isOlderThan to simulate version comparison
    mockIsOlderThan.mockImplementation((a: string, b: string): boolean => {
      // Simple numeric comparison for tests
      const parse = (v: string): number[] => v.split(".").map(Number);
      const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
      const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
      if (a1 !== b1) return a1 < b1;
      if (a2 !== b2) return a2 < b2;
      return a3 < b3;
    });
  });

  it("removes versions older than current", () => {
    expect(cleanSkipVersions(["0.5.0", "0.7.0"], "0.6.1")).toEqual(["0.7.0"]);
  });

  it("removes versions equal to current", () => {
    expect(cleanSkipVersions(["0.6.1", "0.8.0"], "0.6.1")).toEqual(["0.8.0"]);
  });

  it("keeps versions newer than current", () => {
    expect(cleanSkipVersions(["0.7.0", "0.8.0"], "0.6.1")).toEqual(["0.7.0", "0.8.0"]);
  });

  it("returns empty array when all pruned", () => {
    expect(cleanSkipVersions(["0.5.0", "0.6.1"], "0.6.1")).toEqual([]);
  });
});

describe("formatChangelog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOlderThan.mockImplementation((a: string, b: string): boolean => {
      const parse = (v: string): number[] => v.split(".").map(Number);
      const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
      const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
      if (a1 !== b1) return a1 < b1;
      if (a2 !== b2) return a2 < b2;
      return a3 < b3;
    });
  });

  const releases = [
    { tag_name: "v0.7.0", body: "### Added\n- Feature A" },
    { tag_name: "v0.8.0", body: "### Fixed\n- Bug B" },
    { tag_name: "v0.5.0", body: "### Added\n- Old feature" },
  ];

  it("filters releases between current and latest", () => {
    const result = formatChangelog(releases, "0.6.1", "0.8.0");
    expect(result).toContain("v0.7.0");
    expect(result).toContain("v0.8.0");
    expect(result).not.toContain("v0.5.0");
  });

  it("sorts releases newest first", () => {
    const result = formatChangelog(releases, "0.6.1", "0.8.0");
    const v8idx = result.indexOf("v0.8.0");
    const v7idx = result.indexOf("v0.7.0");
    expect(v8idx).toBeLessThan(v7idx);
  });

  it("returns empty string when no releases match", () => {
    expect(formatChangelog(releases, "0.8.0", "0.9.0")).toBe("");
  });

  it("includes the latest version in the range", () => {
    const result = formatChangelog(releases, "0.6.1", "0.7.0");
    expect(result).toContain("v0.7.0");
  });
});

describe("fetchChangelog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOlderThan.mockImplementation((a: string, b: string): boolean => {
      const parse = (v: string): number[] => v.split(".").map(Number);
      const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
      const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
      if (a1 !== b1) return a1 < b1;
      if (a2 !== b2) return a2 < b2;
      return a3 < b3;
    });
  });

  it("returns formatted changelog on success", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve([{ tag_name: "v0.7.0", body: "### Added\n- Feature A" }]),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchChangelog("0.6.1", "0.7.0");
    expect(result).toContain("v0.7.0");
    expect(result).toContain("Feature A");

    vi.unstubAllGlobals();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const result = await fetchChangelog("0.6.1", "0.7.0");
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });

  it("returns null on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await fetchChangelog("0.6.1", "0.7.0");
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });

  it("returns null when no releases match the range", async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve([{ tag_name: "v0.5.0", body: "### Added\n- Old" }]),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const result = await fetchChangelog("0.6.1", "0.7.0");
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("maybeCheckForSelfUpdate", () => {
  let tempDir: string;
  const originalArgv = [...process.argv];

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
    mockGetConfigDir.mockReturnValue(tempDir);
    mockIsCancel.mockReturnValue(false);
    mockReadGlobalConfig.mockReturnValue(null);

    // Default: TTY
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    // Default: not npx
    process.argv = [NODE_BIN, "/usr/local/bin/brainkit"];
  });

  afterEach(() => {
    process.argv = [...originalArgv];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("skips in non-TTY mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    await maybeCheckForSelfUpdate();

    expect(mockGetLatestNpmVersion).not.toHaveBeenCalled();
  });

  it("skips when running via npx", async () => {
    process.argv = [NODE_BIN, "/Users/me/.npm/_npx/abc123/node_modules/.bin/brainkit"];

    await maybeCheckForSelfUpdate();

    expect(mockGetLatestNpmVersion).not.toHaveBeenCalled();
  });

  it("skips when throttled (checked < 24h ago)", async () => {
    // Write a recent timestamp
    const recent = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(path.join(tempDir, "last-update-check"), recent + "\n", "utf-8");

    await maybeCheckForSelfUpdate();

    expect(mockGetLatestNpmVersion).not.toHaveBeenCalled();
  });

  it("skips when npm query fails (and does NOT write timestamp)", async () => {
    mockGetLatestNpmVersion.mockReturnValue(null);

    await maybeCheckForSelfUpdate();

    expect(fs.existsSync(path.join(tempDir, "last-update-check"))).toBe(false);
  });

  it("writes timestamp after successful npm query", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.6.1");
    mockIsOlderThan.mockReturnValue(false);

    await maybeCheckForSelfUpdate();

    expect(fs.existsSync(path.join(tempDir, "last-update-check"))).toBe(true);
  });

  it("skips when current version is up to date", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.6.1");
    mockIsOlderThan.mockReturnValue(false);

    await maybeCheckForSelfUpdate();

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("skips when latest version is in skip_versions", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockImplementation((a, b) => a === "0.6.1" && b === "0.7.0");
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      skip_versions: ["0.7.0"],
    });

    await maybeCheckForSelfUpdate();

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("cleans stale skip_versions entries", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockImplementation((a: string, b: string): boolean => {
      // 0.6.1 < 0.7.0 = true, 0.5.0 < 0.6.1 = true
      const parse = (v: string): number[] => v.split(".").map(Number);
      const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
      const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
      if (a1 !== b1) return a1 < b1;
      if (a2 !== b2) return a2 < b2;
      return a3 < b3;
    });
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      skip_versions: ["0.5.0", "0.7.0"],
    });

    await maybeCheckForSelfUpdate();

    // Should have persisted cleaned list (removed 0.5.0)
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ skip_versions: ["0.7.0"] }));
    // 0.7.0 is still skipped, so no prompt
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("shows select prompt when update available", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("later");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    await maybeCheckForSelfUpdate();

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("0.7.0") as string,
      }),
    );

    vi.unstubAllGlobals();
  });

  it("displays changelog before prompt when available", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockImplementation((a: string, b: string): boolean => {
      const parse = (v: string): number[] => v.split(".").map(Number);
      const [a1 = 0, a2 = 0, a3 = 0] = parse(a);
      const [b1 = 0, b2 = 0, b3 = 0] = parse(b);
      if (a1 !== b1) return a1 < b1;
      if (a2 !== b2) return a2 < b2;
      return a3 < b3;
    });
    mockSelect.mockResolvedValue("later");

    const mockResponse = {
      ok: true,
      json: () => Promise.resolve([{ tag_name: "v0.7.0", body: "### Added\n- Cool feature" }]),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    await maybeCheckForSelfUpdate();

    expect(mockNote).toHaveBeenCalledWith(expect.stringContaining("Cool feature"), "What's new");

    vi.unstubAllGlobals();
  });

  it("shows prompt without changelog when fetch fails", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("later");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    await maybeCheckForSelfUpdate();

    expect(mockNote).not.toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("skip this version adds to skip_versions in config", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("skip");
    // First call in main flow returns null (no skip_versions)
    // Second call in skip handler returns fresh config
    mockReadGlobalConfig.mockReturnValueOnce(null).mockReturnValueOnce({ version: 1, brain_path: "/brain" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    await maybeCheckForSelfUpdate();

    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ skip_versions: ["0.7.0"] }));

    vi.unstubAllGlobals();
  });

  it("remind me later continues normally", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("later");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    // Should not throw
    await maybeCheckForSelfUpdate();

    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("cancel continues normally", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    // Should not throw
    await maybeCheckForSelfUpdate();

    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("update path: blocks parent until relaunched child exits (regression: duplicate prompts)", async () => {
    // Regression test for the bug where the parent process kept running
    // (showing harness selection prompts) while the relaunched child was
    // also running, racing for stdin.
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("update");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    const { execFileSync, spawn } = await import("node:child_process");
    const mockExecFileSync = vi.mocked(execFileSync);
    const mockSpawnFn = vi.mocked(spawn);

    // npm update succeeds
    mockExecFileSync.mockReturnValue(Buffer.from(""));

    // Spawn returns a fake child whose exit handler we'll trigger manually
    let exitHandler: ((code: number | null) => void) | undefined;
    const fakeChild = {
      on: vi.fn((event: string, handler: (code: number | null) => void) => {
        if (event === "exit") exitHandler = handler;
      }),
    };
    mockSpawnFn.mockReturnValue(fakeChild as unknown as ReturnType<typeof spawn>);

    // process.exit must be intercepted so the test doesn't kill vitest.
    // Track the exit code instead of throwing.
    let exitCode: number | string | null | undefined;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
      exitCode = code;
      // Don't throw — just record. Caller proceeds normally.
      return undefined as never;
    });

    // Track whether maybeCheckForSelfUpdate has resolved before the child exits
    let resolved = false;
    const promise = maybeCheckForSelfUpdate().then(() => {
      resolved = true;
    });

    // Yield several times so any sync work after the await runs and
    // microtasks/setImmediates settle.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // The function MUST NOT have resolved yet — it should be waiting for the child
    expect(resolved).toBe(false);
    expect(mockSpawnFn).toHaveBeenCalled();
    expect(exitHandler).toBeDefined();

    // Now simulate the child exiting — the parent should call process.exit(0)
    // and then the inner Promise resolves.
    exitHandler?.(0);
    await promise;
    expect(resolved).toBe(true);
    expect(exitCode).toBe(0);

    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("update path: returns silently on update failure (no relaunch, no exit)", async () => {
    mockGetLatestNpmVersion.mockReturnValue("0.7.0");
    mockIsOlderThan.mockReturnValue(true);
    mockSelect.mockResolvedValue("update");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network")));

    const { execFileSync, spawn } = await import("node:child_process");
    const mockExecFileSync = vi.mocked(execFileSync);
    const mockSpawnFn = vi.mocked(spawn);

    // npm update fails
    mockExecFileSync.mockImplementation(() => {
      throw new Error("npm install failed");
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number | string | null) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    // Should not throw, should not spawn relaunch, should not exit
    await maybeCheckForSelfUpdate();

    expect(mockSpawnFn).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining("Update failed"));

    exitSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
