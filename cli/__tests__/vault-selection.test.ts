import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Mock core module to control readGlobalConfig and discoverVaults
// ---------------------------------------------------------------------------

vi.mock("../../core/index.js", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
  getConfigDir: vi.fn(),
}));

import { readGlobalConfig, discoverVaults } from "../../core/index.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockDiscoverVaults = vi.mocked(discoverVaults);

// ---------------------------------------------------------------------------
// Mock reset helper to verify selectVault calls it on the missing-brain path
// ---------------------------------------------------------------------------

vi.mock("../reset.js", () => ({
  resetBrainkitConfig: vi.fn(),
}));

import { resetBrainkitConfig } from "../reset.js";

const mockResetBrainkitConfig = vi.mocked(resetBrainkitConfig);

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
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { parseVaultFlag, selectVault } from "../launch.js";

// ---------------------------------------------------------------------------
// parseVaultFlag
// ---------------------------------------------------------------------------

describe("parseVaultFlag", () => {
  it("extracts --vault value from args", () => {
    const result = parseVaultFlag(["--vault", "work"]);
    expect(result).toEqual({ vault: "work", remaining: [] });
  });

  it("extracts --vault with other args", () => {
    const result = parseVaultFlag(["--model", "gpt-4", "--vault", "life"]);
    expect(result).toEqual({ vault: "life", remaining: ["--model", "gpt-4"] });
  });

  it("returns null vault when --vault not present", () => {
    const result = parseVaultFlag(["--model", "gpt-4"]);
    expect(result).toEqual({ vault: null, remaining: ["--model", "gpt-4"] });
  });

  it("throws when --vault has no value", () => {
    expect(() => parseVaultFlag(["--vault"])).toThrow();
  });

  it("throws when --vault value looks like another flag", () => {
    expect(() => parseVaultFlag(["--vault", "--model"])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// selectVault
// ---------------------------------------------------------------------------

describe("selectVault", () => {
  let brainDir: string;

  beforeEach(() => {
    brainDir = mkdtempSync(join(tmpdir(), "brainkit-sv-"));
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: brainDir });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(brainDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("auto-selects when only one vault exists", async () => {
    mockDiscoverVaults.mockReturnValue(["work"]);

    const result = await selectVault(null);
    expect(result.vaultPath).toBe(join(brainDir, "work"));
    expect(result.brainPath).toBe(brainDir);
  });

  it("resolves --vault flag to brain_path/name", async () => {
    mockDiscoverVaults.mockReturnValue(["work", "life"]);

    const result = await selectVault("work");
    expect(result.vaultPath).toBe(join(brainDir, "work"));
  });

  it("exits with error when --vault names a nonexistent vault", async () => {
    mockDiscoverVaults.mockReturnValue(["work", "life"]);

    await expect(selectVault("bogus")).rejects.toThrow("process.exit");
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining('Vault "bogus" not found'));
  });

  it("returns brainPath when zero vaults (fresh brain)", async () => {
    mockDiscoverVaults.mockReturnValue([]);

    const result = await selectVault(null);
    expect(result.vaultPath).toBe(brainDir);
    expect(result.brainPath).toBe(brainDir);
  });

  it("returns undefined paths when no global config exists", async () => {
    mockReadGlobalConfig.mockReturnValue(null);

    const result = await selectVault(null);
    expect(result.vaultPath).toBeUndefined();
    expect(result.brainPath).toBeUndefined();
  });

  it("returns undefined paths when global config has empty brain_path", async () => {
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "" });

    const result = await selectVault(null);
    expect(result.vaultPath).toBeUndefined();
    expect(result.brainPath).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// selectVault — missing-brain-dir reset path
// ---------------------------------------------------------------------------

describe("selectVault — brain dir vanished", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    // Point at a brain_path that does not exist so discoverVaults throws.
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/nonexistent/brain/path" });
    mockDiscoverVaults.mockImplementation(() => {
      throw new Error("ENOENT: brain dir not found");
    });
    mockResetBrainkitConfig.mockReset().mockImplementation(() => {});
    vi.mocked(p.confirm).mockReset();
    vi.mocked(p.isCancel).mockReset().mockReturnValue(false);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    // Force interactive code path. Stash the original (which may be undefined
    // in the test runner) so we can restore it.
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true, writable: true });
  });

  it("calls resetBrainkitConfig (full wipe) when user confirms", async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);

    const result = await selectVault(null);

    expect(mockResetBrainkitConfig).toHaveBeenCalledOnce();
    // Returns undefined paths so the caller routes into onboarding.
    expect(result.vaultPath).toBeUndefined();
    expect(result.brainPath).toBeUndefined();
  });

  it("warns user up-front that the wipe includes Copilot auth/history", async () => {
    vi.mocked(p.confirm).mockResolvedValue(true);

    await selectVault(null);

    const confirmCall = vi.mocked(p.confirm).mock.calls[0]?.[0] as { message: string };
    expect(confirmCall.message).toMatch(/copilot.*auth/i);
    expect(confirmCall.message).toMatch(/vault/i);
  });

  it("does not call resetBrainkitConfig when user declines", async () => {
    vi.mocked(p.confirm).mockResolvedValue(false);

    await expect(selectVault(null)).rejects.toThrow("process.exit");
    expect(mockResetBrainkitConfig).not.toHaveBeenCalled();
  });

  it("non-TTY: bails out without calling reset and points user at `brainkit reset`", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true, writable: true });

    await expect(selectVault(null)).rejects.toThrow("process.exit");
    expect(mockResetBrainkitConfig).not.toHaveBeenCalled();
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("brainkit reset"));
  });
});
