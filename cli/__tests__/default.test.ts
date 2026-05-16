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
// Mock harness-version to avoid side effects
// ---------------------------------------------------------------------------

vi.mock("../harness-version.js", () => ({
  maybeCheckHarnessVersion: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock copilot launcher
// ---------------------------------------------------------------------------

vi.mock("../copilot.js", () => ({
  launchCopilot: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock claude launcher
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
    warn: vi.fn(),
    message: vi.fn(),
  },
  select: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { handleDefaultCommand } from "../launch.js";

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
// Tests
// ---------------------------------------------------------------------------

describe("handleDefaultCommand — set alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    setInstalled(["opencode", "copilot", "claude"]);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets default_harness to canonical alias and confirms", async () => {
    await handleDefaultCommand(["cc"]);

    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ default_harness: "claude" }));
    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining("Claude Code"));
  });

  it("normalizes alias to canonical first alias", async () => {
    await handleDefaultCommand(["opencode"]);
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ default_harness: "oc" }));

    mockWriteGlobalConfig.mockClear();

    await handleDefaultCommand(["cp"]);
    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ default_harness: "copilot" }));
  });

  it("prints already-default when harness matches current default", async () => {
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "claude",
    });

    await handleDefaultCommand(["claude"]);

    expect(p.log.info).toHaveBeenCalledWith(expect.stringMatching(/already.*Claude Code/i));
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it("treats cross-alias as already-default", async () => {
    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "oc",
    });

    await handleDefaultCommand(["opencode"]);

    expect(p.log.info).toHaveBeenCalledWith(expect.stringMatching(/already.*OpenCode/i));
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();

    vi.mocked(p.log.info).mockClear();

    mockReadGlobalConfig.mockReturnValue({
      version: 1,
      brain_path: "/brain",
      default_harness: "claude",
    });

    await handleDefaultCommand(["cc"]);

    expect(p.log.info).toHaveBeenCalledWith(expect.stringMatching(/already.*Claude Code/i));
    expect(mockWriteGlobalConfig).not.toHaveBeenCalled();
  });

  it("warns when harness binary is not on PATH", async () => {
    setInstalled(["opencode"]);

    await handleDefaultCommand(["claude"]);

    expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ default_harness: "claude" }));
    expect(p.log.success).toHaveBeenCalled();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringMatching(/not found on PATH/));
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("Claude Code"));
  });

  it("errors on invalid alias with valid alias list", async () => {
    await expect(handleDefaultCommand(["foobar"])).rejects.toThrow("process.exit");

    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("foobar"));
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("oc"));
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("claude"));
  });

  it("bootstraps config when no config.toml exists", async () => {
    mockReadGlobalConfig.mockReturnValue(null);

    await handleDefaultCommand(["oc"]);

    expect(mockWriteGlobalConfig).toHaveBeenCalledWith({
      version: 1,
      brain_path: "",
      default_harness: "oc",
    });
  });
});

describe("handleDefaultCommand — no arg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    setInstalled(["opencode", "copilot", "claude"]);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints current default in non-TTY", async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      mockReadGlobalConfig.mockReturnValue({
        version: 1,
        brain_path: "/brain",
        default_harness: "oc",
      });

      await handleDefaultCommand([]);

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Default harness: OpenCode"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("prints no-default-set in non-TTY when none configured", async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });

      await handleDefaultCommand([]);

      expect(console.log).toHaveBeenCalledWith("No default harness set.");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("prints no-default-set in non-TTY when config is null", async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      mockReadGlobalConfig.mockReturnValue(null);

      await handleDefaultCommand([]);

      expect(console.log).toHaveBeenCalledWith("No default harness set.");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("TTY picker saves selection and confirms", async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
      vi.mocked(p.select).mockImplementation((opts: any) => {
        return Promise.resolve(opts.options[0].value);
      });
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

      await handleDefaultCommand([]);

      expect(mockWriteGlobalConfig).toHaveBeenCalledWith(expect.objectContaining({ default_harness: "oc" }));
      expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining("OpenCode"));
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });

  it("TTY picker labels current default with (current)", async () => {
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    try {
      mockReadGlobalConfig.mockReturnValue({
        version: 1,
        brain_path: "/brain",
        default_harness: "oc",
      });

      let capturedOptions: Array<{ label: string }> = [];
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
      vi.mocked(p.select).mockImplementation((opts: any) => {
        capturedOptions = opts.options;
        return Promise.resolve(opts.options[0].value);
      });
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

      await handleDefaultCommand([]);

      const openCodeOption = capturedOptions.find((o) => o.label.includes("OpenCode"));
      expect(openCodeOption).toBeDefined();
      expect(openCodeOption?.label).toContain("(current)");

      // Other options should not have "(current)"
      const otherOptions = capturedOptions.filter((o) => !o.label.includes("OpenCode"));
      for (const opt of otherOptions) {
        expect(opt.label).not.toContain("(current)");
      }
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    }
  });
});
