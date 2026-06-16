import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../vault.js", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
  readVaultConfigSimple: vi.fn(),
}));

import { resolveVaultContext } from "../vault-context.js";
import { readGlobalConfig, discoverVaults, readVaultConfigSimple } from "../vault.js";
import type { BrainkitConfig } from "../types.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockDiscoverVaults = vi.mocked(discoverVaults);
const mockReadVaultConfigSimple = vi.mocked(readVaultConfigSimple);

function makeConfig(name = "Test"): BrainkitConfig {
  return { version: 1, user: { name, role: "Engineer" } };
}

describe("resolveVaultContext", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns single mode when BRAINKIT_VAULT_PATH is set", () => {
    process.env.BRAINKIT_VAULT_PATH = "/brain/work";
    delete process.env.BRAINKIT_ALL_VAULTS;

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/work" });
  });

  it("returns all mode when BRAINKIT_ALL_VAULTS=1", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work", "personal"]);
    mockReadVaultConfigSimple.mockImplementation((_vaultPath: string) => {
      if (_vaultPath.endsWith("work")) return makeConfig("WorkUser");
      if (_vaultPath.endsWith("personal")) return makeConfig("PersonalUser");
      return makeConfig();
    });

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
    if (ctx.mode === "all") {
      expect(ctx.vaults).toHaveLength(2);
      expect(ctx.vaults[0]?.name).toBe("work");
      expect(ctx.vaults[1]?.name).toBe("personal");
    }
  });

  it("BRAINKIT_ALL_VAULTS takes precedence over BRAINKIT_VAULT_PATH", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    process.env.BRAINKIT_VAULT_PATH = "/brain/work";

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work"]);
    mockReadVaultConfigSimple.mockReturnValue(makeConfig());

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
  });

  it("skips vaults with unreadable configs (warns, does not abort)", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["good", "bad"]);
    mockReadVaultConfigSimple.mockImplementation((_vaultPath: string) => {
      if (_vaultPath.endsWith("bad")) throw new Error("TOML parse error");
      return makeConfig();
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
    if (ctx.mode === "all") {
      expect(ctx.vaults).toHaveLength(1);
      expect(ctx.vaults[0]?.name).toBe("good");
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns none when no env vars and multiple vaults", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work", "personal"]);

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("none");
  });

  it("auto-selects single vault in fallback (no env vars, 1 vault)", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["only"]);

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/only" });
  });

  it("returns none when no global config", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue(null);

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("none");
  });
});
