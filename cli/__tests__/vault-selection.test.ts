import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock core module
// ---------------------------------------------------------------------------

vi.mock("../../core/index.js", () => ({
  listVaults: vi.fn(),
  validateRegistry: vi.fn(() => []),
  readGlobalConfig: vi.fn(),
}));

import { listVaults, validateRegistry } from "../../core/index.js";
import type { VaultEntry } from "../../core/index.js";

const mockListVaults = vi.mocked(listVaults);
const mockValidateRegistry = vi.mocked(validateRegistry);

// ---------------------------------------------------------------------------
// Mock @clack/prompts
// ---------------------------------------------------------------------------

vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
  isCancel: vi.fn(() => false),
}));

import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { parseVaultFlag, selectVault } from "../launch.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(name: string, resolvedPath: string, exists = true): VaultEntry {
  return { name, path: resolvedPath, resolvedPath, exists };
}

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
  beforeEach(() => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockListVaults.mockReturnValue([]);
    mockValidateRegistry.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns onboarding when no vaults registered", async () => {
    mockListVaults.mockReturnValue([]);
    const result = await selectVault(null);
    expect(result).toEqual({ mode: "onboarding" });
  });

  it("auto-selects when only one existing vault", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work")]);
    const result = await selectVault(null);
    expect(result).toEqual({ mode: "single", vaultPath: "/brain/work" });
  });

  it("resolves --vault flag by name", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("life", "/brain/life")]);
    const result = await selectVault("work");
    expect(result).toEqual({ mode: "single", vaultPath: "/brain/work" });
  });

  it("exits with error when --vault names unknown vault", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work")]);
    await expect(selectVault("unknown")).rejects.toThrow("process.exit");
  });

  it("--vault all returns all mode", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("life", "/brain/life")]);
    const result = await selectVault("all");
    expect(result).toEqual({ mode: "all" });
  });

  it("--vault ALL is case-insensitive", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work")]);
    const result = await selectVault("ALL");
    expect(result).toEqual({ mode: "all" });
  });

  it("--vault all with 0 existing vaults exits with error", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work", false)]);
    await expect(selectVault("all")).rejects.toThrow("process.exit");
  });

  it("warns about non-existent vault paths", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("gone", "/brain/gone", false)]);
    await selectVault(null);
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("gone"));
  });

  it("hard errors on name collisions", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("work", "/brain/work2")]);
    mockValidateRegistry.mockReturnValue(["Duplicate name: work"]);
    await expect(selectVault(null)).rejects.toThrow("process.exit");
    expect(p.log.error).toHaveBeenCalled();
  });

  it("returns onboarding when all registered vaults are missing", async () => {
    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work", false), makeEntry("life", "/brain/life", false)]);
    const result = await selectVault(null);
    expect(result).toEqual({ mode: "onboarding" });
  });
});
