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
// Mock copilot launcher to avoid filesystem side effects
// ---------------------------------------------------------------------------

vi.mock("../copilot.js", () => ({
  launchCopilot: vi.fn(),
}));

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
    if (cmd === "which" && args && binaries.includes(args[0] as string)) {
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

  it("launches directly when only one harness is detected", () => {
    setInstalled(["opencode"]);

    // Should not throw (launches the harness via spawn)
    expect(() => {
      detectAndLaunch([]);
    }).not.toThrow();
  });

  it("exits with error when no harnesses are detected", () => {
    setInstalled([]);

    expect(() => {
      detectAndLaunch([]);
    }).toThrow("process.exit");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("No supported"));
  });

  it("launches saved default when it is installed", () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "opencode",
    });

    // Should launch without prompting — no throw, no exit
    expect(() => {
      detectAndLaunch([]);
    }).not.toThrow();
    // Should NOT have written config (already saved)
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it("ignores saved default when it is not installed and falls through", () => {
    setInstalled(["copilot"]);
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "opencode",
    });

    // With only one other harness available after ignoring default,
    // it should auto-launch copilot (falls through to single-harness case)
    expect(() => {
      detectAndLaunch([]);
    }).not.toThrow();
  });

  it("errors in non-TTY when multiple harnesses detected and no default", () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

    // Simulate non-TTY
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      expect(() => {
        detectAndLaunch([]);
      }).toThrow("process.exit");
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Multiple harnesses"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("shows all harnesses with detection status in prompt output", () => {
    setInstalled(["opencode", "copilot"]);
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

    // Non-TTY so it prints and exits instead of prompting
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      expect(() => {
        detectAndLaunch([]);
      }).toThrow("process.exit");
      // Should show detection status for all harnesses
      const allOutput = (console.error as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]).join("\n");
      expect(allOutput).toContain("detected");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
});
