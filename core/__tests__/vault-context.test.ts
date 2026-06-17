import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../vault.js", () => ({
  listVaults: vi.fn(),
  readVaultConfigSimple: vi.fn(),
}));

import { resolveVaultContext } from "../vault-context.js";
import { listVaults, readVaultConfigSimple } from "../vault.js";
import type { BrainkitConfig } from "../types.js";
import type { VaultEntry } from "../vault.js";

const mockListVaults = vi.mocked(listVaults);
const mockReadVaultConfigSimple = vi.mocked(readVaultConfigSimple);

function makeEntry(name: string, resolvedPath: string, exists = true): VaultEntry {
  return { name, path: resolvedPath, resolvedPath, exists };
}

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
    process.env["BRAINKIT_VAULT_PATH"] = "/brain/work";
    delete process.env["BRAINKIT_ALL_VAULTS"];

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/work" });
    expect(mockListVaults).not.toHaveBeenCalled();
  });

  it("BRAINKIT_VAULT_PATH takes precedence over BRAINKIT_ALL_VAULTS", () => {
    process.env["BRAINKIT_VAULT_PATH"] = "/brain/work";
    process.env["BRAINKIT_ALL_VAULTS"] = "1";

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/work" });
  });

  it("returns all mode when BRAINKIT_ALL_VAULTS=1", () => {
    process.env["BRAINKIT_ALL_VAULTS"] = "1";
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("personal", "/brain/personal")]);
    mockReadVaultConfigSimple.mockImplementation((vaultPath: string) => {
      if (vaultPath.endsWith("work")) return makeConfig("WorkUser");
      if (vaultPath.endsWith("personal")) return makeConfig("PersonalUser");
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

  it("skips vaults with unreadable configs (warns, does not abort)", () => {
    process.env["BRAINKIT_ALL_VAULTS"] = "1";
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([makeEntry("good", "/brain/good"), makeEntry("bad", "/brain/bad")]);
    mockReadVaultConfigSimple.mockImplementation((vaultPath: string) => {
      if (vaultPath.endsWith("bad")) throw new Error("TOML parse error");
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

  it("filters out non-existent vaults in all-vaults mode", () => {
    process.env["BRAINKIT_ALL_VAULTS"] = "1";
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([makeEntry("real", "/brain/real", true), makeEntry("gone", "/brain/gone", false)]);
    mockReadVaultConfigSimple.mockReturnValue(makeConfig());

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
    if (ctx.mode === "all") {
      expect(ctx.vaults).toHaveLength(1);
      expect(ctx.vaults[0]?.name).toBe("real");
    }
  });

  it("returns none when all-vaults mode has zero valid vaults", () => {
    process.env["BRAINKIT_ALL_VAULTS"] = "1";
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([]);

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "none" });
  });

  it("returns none when no env vars and multiple vaults", () => {
    delete process.env["BRAINKIT_ALL_VAULTS"];
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([makeEntry("work", "/brain/work"), makeEntry("personal", "/brain/personal")]);

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("none");
  });

  it("auto-selects single vault in fallback (no env vars, 1 vault)", () => {
    delete process.env["BRAINKIT_ALL_VAULTS"];
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([makeEntry("only", "/brain/only")]);

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/only" });
  });

  it("returns none when no vaults registered", () => {
    delete process.env["BRAINKIT_ALL_VAULTS"];
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockReturnValue([]);

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "none" });
  });

  it("returns none when listVaults throws", () => {
    delete process.env["BRAINKIT_ALL_VAULTS"];
    delete process.env["BRAINKIT_VAULT_PATH"];

    mockListVaults.mockImplementation(() => {
      throw new Error("config unreadable");
    });

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "none" });
  });
});
