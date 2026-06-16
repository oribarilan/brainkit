import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock core module
// ---------------------------------------------------------------------------

vi.mock("../../core/index.js", () => ({
  readGlobalConfig: vi.fn(),
  writeGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
  readVaultConfigSimple: vi.fn(),
  readVaultFile: vi.fn(),
  writeVaultFile: vi.fn(),
  searchVaultFiles: vi.fn(),
  getConfigDir: vi.fn(() => "/tmp/brainkit-test-config"),
}));

import { readGlobalConfig, writeGlobalConfig } from "../../core/index.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockWriteGlobalConfig = vi.mocked(writeGlobalConfig);

// ---------------------------------------------------------------------------
// Mock child_process to control `which` results
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(() => ({ on: vi.fn() })),
}));

import { execFileSync } from "node:child_process";

const mockExecFileSync = vi.mocked(execFileSync);

// ---------------------------------------------------------------------------
// Mock harness-version to avoid side effects during harness detection tests
// ---------------------------------------------------------------------------

vi.mock("../harness-version.js", () => ({
  maybeCheckHarnessVersion: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock copilot launcher to avoid filesystem side effects
// ---------------------------------------------------------------------------

vi.mock("../copilot.js", () => ({
  launchCopilot: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock claude launcher to avoid filesystem side effects
// ---------------------------------------------------------------------------

vi.mock("../claude.js", () => ({
  launchClaude: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @clack/prompts
// ---------------------------------------------------------------------------

vi.mock("@clack/prompts", () => ({
  cancel: vi.fn(),
  outro: vi.fn(),
  intro: vi.fn(),
  note: vi.fn(),
  log: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
  },
  select: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { detectAndLaunch } from "../launch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Configure which binaries are "installed" */
function setInstalled(binaries: string[]): void {
  mockExecFileSync.mockImplementation((cmd, args) => {
    const lookupCmd = process.platform === "win32" ? "where" : "which";
    if (cmd === lookupCmd && args && binaries.includes(args[0] as string)) {
      return Buffer.from(`/usr/local/bin/${String(args[0])}`);
    }
    throw new Error("not found");
  });
}

// ---------------------------------------------------------------------------
// detectAndLaunch — harness auto-detection
// ---------------------------------------------------------------------------

describe("detectAndLaunch", () => {
  beforeEach(() => {
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("launches directly when only one harness is detected", async () => {
    setInstalled(["opencode"]);

    // Should not throw (launches the harness via spawn)
    await detectAndLaunch([], { mode: "onboarding" });
  });

  it("exits with error when no harnesses are detected", async () => {
    setInstalled([]);

    await expect(detectAndLaunch([], { mode: "onboarding" })).rejects.toThrow("process.exit");
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("No supported"));
  });

  it("launches saved default when it is installed", async () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "opencode",
    });

    // Should launch without prompting — no throw, no exit
    await detectAndLaunch([], { mode: "onboarding" });
    // Should NOT have written config (already saved)
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it("ignores saved default when it is not installed and falls through", async () => {
    setInstalled(["copilot"]);
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "opencode",
    });

    // With only one other harness available after ignoring default,
    // it should auto-launch copilot (falls through to single-harness case)
    await detectAndLaunch([], { mode: "onboarding" });
  });

  it("errors in non-TTY when multiple harnesses detected and no default", async () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

    // Simulate non-TTY
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(detectAndLaunch([], { mode: "onboarding" })).rejects.toThrow("process.exit");
      expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("Multiple harnesses"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("shows actionable message in non-TTY when multiple harnesses detected", async () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

    // Non-TTY so it prints and exits instead of prompting
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(detectAndLaunch([], { mode: "onboarding" })).rejects.toThrow("process.exit");
      expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("brainkit oc"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("auto-detects claude when only it is installed", async () => {
    setInstalled(["claude"]);

    // Should not throw — should auto-launch Claude
    await detectAndLaunch([], { mode: "onboarding" });
  });

  it("includes claude as an option when all three harnesses are installed (non-TTY error)", async () => {
    setInstalled(["opencode", "copilot", "claude"]);
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(detectAndLaunch([], { mode: "onboarding" })).rejects.toThrow("process.exit");
      expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("brainkit claude"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("respects saved default of claude when multiple harnesses installed", async () => {
    setInstalled(["opencode", "claude"]);
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "claude",
    });

    await detectAndLaunch([], { mode: "onboarding" });
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it("error message lists all three harnesses when none are installed", async () => {
    setInstalled([]);

    await expect(detectAndLaunch([], { mode: "onboarding" })).rejects.toThrow("process.exit");
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("Claude Code"));
  });
});
