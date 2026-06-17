import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { migrateGlobalConfig, maybeMigrateGlobal } from "../global-migration.js";

describe("migrateGlobalConfig", () => {
  let brainDir: string;

  beforeEach(() => {
    brainDir = mkdtempSync(path.join(tmpdir(), "brainkit-brain-"));
  });

  afterEach(() => {
    rmSync(brainDir, { recursive: true, force: true });
  });

  function createVault(name: string): void {
    const vaultPath = path.join(brainDir, name);
    mkdirSync(vaultPath, { recursive: true });
    writeFileSync(path.join(vaultPath, "brainkit.toml"), 'version = 2\n\n[user]\nname = "test"\nrole = "dev"\n');
  }

  it("migrates v1 with brain_path and discovered vaults", () => {
    createVault("personal");
    createVault("work");

    const raw = { version: 1, brain_path: brainDir };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toHaveLength(2);
    // discoverVaults sorts alphabetically
    expect(result.vaults[0]?.path).toBe(path.join(brainDir, "personal"));
    expect(result.vaults[1]?.path).toBe(path.join(brainDir, "work"));
    expect((result as unknown as Record<string, unknown>)["brain_path"]).toBeUndefined();
  });

  it("preserves tilde in vault paths when brain_path uses tilde", () => {
    // Can't create real dirs at ~/brain for tests, so discoverVaults will fail → empty vaults
    const raw = { version: 1, brain_path: "~/brain" };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toEqual([]);
  });

  it("migrates v1 with absolute brain_path", () => {
    createVault("eng");

    const raw = { version: 1, brain_path: brainDir };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    for (const v of result.vaults) {
      // Should be absolute path (or drive letter on Windows)
      expect(path.isAbsolute(v.path)).toBe(true);
    }
  });

  it("returns v2 with empty vaults when brain_path doesn't exist", () => {
    const raw = { version: 1, brain_path: "/nonexistent/brain/path" };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toEqual([]);
  });

  it("returns v2 with empty vaults when zero vaults discovered", () => {
    // brainDir exists but has no vault subdirs (no brainkit.toml files)
    const raw = { version: 1, brain_path: brainDir };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toEqual([]);
  });

  it("passes through already-v2 config unchanged", () => {
    const raw = { version: 2, vaults: [{ path: "~/brain/work" }] };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toEqual([{ path: "~/brain/work" }]);
  });

  it("migrates v1 without brain_path to v2 with empty vaults", () => {
    const raw = { version: 1 };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
    expect(result.vaults).toEqual([]);
  });

  it("migrates missing version (implicit v1) to v2", () => {
    const raw = { brain_path: brainDir };
    const result = migrateGlobalConfig(raw);
    expect(result.version).toBe(2);
  });

  it("preserves default_harness and skip_versions through migration", () => {
    const raw = { version: 1, brain_path: "/x", default_harness: "opencode", skip_versions: ["0.5.0"] };
    const result = migrateGlobalConfig(raw);
    expect(result.default_harness).toBe("opencode");
    expect(result.skip_versions).toEqual(["0.5.0"]);
  });

  it("round-trips through smol-toml serialization", () => {
    createVault("notes");
    const migrated = migrateGlobalConfig({ version: 1, brain_path: brainDir });
    const toml = stringifyToml(migrated);
    const parsed = parseToml(toml) as Record<string, unknown>;
    expect(parsed["version"]).toBe(2);
    expect(Array.isArray(parsed["vaults"])).toBe(true);
  });
});

describe("maybeMigrateGlobal", () => {
  let configDir: string;
  let brainDir: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), "brainkit-cfg-"));
    brainDir = mkdtempSync(path.join(tmpdir(), "brainkit-brain-"));
    savedConfigDir = process.env["BRAINKIT_CONFIG_DIR"];
    process.env["BRAINKIT_CONFIG_DIR"] = configDir;
  });

  afterEach(() => {
    if (savedConfigDir === undefined) {
      delete process.env["BRAINKIT_CONFIG_DIR"];
    } else {
      process.env["BRAINKIT_CONFIG_DIR"] = savedConfigDir;
    }
    rmSync(configDir, { recursive: true, force: true });
    rmSync(brainDir, { recursive: true, force: true });
  });

  function writeConfig(toml: string): void {
    writeFileSync(path.join(configDir, "config.toml"), toml, "utf-8");
  }

  function readConfig(): string {
    return readFileSync(path.join(configDir, "config.toml"), "utf-8");
  }

  function createVault(name: string): void {
    const vaultPath = path.join(brainDir, name);
    mkdirSync(vaultPath, { recursive: true });
    writeFileSync(path.join(vaultPath, "brainkit.toml"), 'version = 2\n\n[user]\nname = "test"\nrole = "dev"\n');
  }

  it("migrates v1 config and creates backup", () => {
    createVault("personal");
    writeConfig(stringifyToml({ version: 1, brain_path: brainDir }));

    maybeMigrateGlobal();

    const updated = readConfig();
    const parsed = parseToml(updated) as Record<string, unknown>;
    expect(parsed["version"]).toBe(2);
    expect(Array.isArray(parsed["vaults"])).toBe(true);
    expect(parsed["brain_path"]).toBeUndefined();

    // Backup exists
    expect(existsSync(path.join(configDir, "config.toml.v1.bak"))).toBe(true);
  });

  it("does not modify already-v2 config", () => {
    writeConfig("version = 2\nvaults = []\n");
    const before = readConfig();

    maybeMigrateGlobal();

    const after = readConfig();
    expect(after).toBe(before);
    expect(existsSync(path.join(configDir, "config.toml.v1.bak"))).toBe(false);
  });

  it("does nothing when config doesn't exist", () => {
    // No config written
    maybeMigrateGlobal();
    expect(existsSync(path.join(configDir, "config.toml"))).toBe(false);
  });

  it("does not crash on invalid TOML", () => {
    writeConfig("this is not valid toml {{{");
    expect(() => {
      maybeMigrateGlobal();
    }).not.toThrow();
  });

  it("backup contains original v1 content", () => {
    const original = stringifyToml({ version: 1, brain_path: brainDir });
    writeConfig(original);

    maybeMigrateGlobal();

    const backup = readFileSync(path.join(configDir, "config.toml.v1.bak"), "utf-8");
    expect(backup).toBe(original);
  });
});
