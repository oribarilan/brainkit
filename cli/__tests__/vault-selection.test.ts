import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVaultFlag, selectVault } from "../launch.js";

// ---------------------------------------------------------------------------
// Mock @oribish/brainkit-core to control readGlobalConfig and discoverVaults
// ---------------------------------------------------------------------------

vi.mock("@oribish/brainkit-core", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
}));

import { readGlobalConfig, discoverVaults } from "@oribish/brainkit-core";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockDiscoverVaults = vi.mocked(discoverVaults);

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
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
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
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Vault "bogus" not found'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Available vaults:"),
    );
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
    expect(process.exit).not.toHaveBeenCalled();
  });
});
