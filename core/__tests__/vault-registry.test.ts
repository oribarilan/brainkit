import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { listVaults, validateRegistry, expandTilde } from "../vault.js";
import type { VaultEntry } from "../vault.js";

describe("expandTilde", () => {
  it("expands bare ~", () => {
    expect(expandTilde("~")).toBe(os.homedir());
  });

  it("expands ~/foo/bar", () => {
    expect(expandTilde("~/foo/bar")).toBe(path.join(os.homedir(), "foo/bar"));
  });

  it("expands ~\\foo (Windows backslash)", () => {
    expect(expandTilde("~\\foo")).toBe(path.join(os.homedir(), "foo"));
  });

  it("does not expand /absolute/path", () => {
    expect(expandTilde("/absolute/path")).toBe("/absolute/path");
  });

  it("does not expand ~user/foo", () => {
    expect(expandTilde("~user/foo")).toBe("~user/foo");
  });

  it("does not expand relative/path", () => {
    expect(expandTilde("relative/path")).toBe("relative/path");
  });
});

describe("listVaults", () => {
  let configDir: string;
  let vaultDir: string;
  let savedConfigDir: string | undefined;

  beforeEach(() => {
    configDir = mkdtempSync(path.join(tmpdir(), "brainkit-cfg-"));
    vaultDir = mkdtempSync(path.join(tmpdir(), "brainkit-vaults-"));
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
    rmSync(vaultDir, { recursive: true, force: true });
  });

  function writeConfig(toml: string): void {
    writeFileSync(path.join(configDir, "config.toml"), toml, "utf-8");
  }

  it("returns empty array when config does not exist", () => {
    // No config.toml written
    expect(listVaults()).toEqual([]);
  });

  it("returns empty array when config has no vaults field (v1 config)", () => {
    writeConfig('version = 1\nbrain_path = "/x"\n');
    expect(listVaults()).toEqual([]);
  });

  it("returns empty array when vaults array is empty", () => {
    writeConfig("version = 2\nvaults = []\n");
    expect(listVaults()).toEqual([]);
  });

  it("returns entries with resolved paths for existing directories", () => {
    const personal = path.join(vaultDir, "personal");
    mkdirSync(personal);

    writeConfig(stringifyToml({ version: 2, vaults: [{ path: personal }] }));

    const result = listVaults();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "personal",
      path: personal,
      resolvedPath: path.resolve(personal),
      exists: true,
    });
  });

  it("derives name from basename when not explicit", () => {
    const engVault = path.join(vaultDir, "eng-vault");
    mkdirSync(engVault);

    writeConfig(stringifyToml({ version: 2, vaults: [{ path: engVault }] }));

    const result = listVaults();
    expect(result[0]?.name).toBe("eng-vault");
  });

  it("uses explicit name when provided", () => {
    const personal = path.join(vaultDir, "personal");
    mkdirSync(personal);

    writeConfig(stringifyToml({ version: 2, vaults: [{ path: personal, name: "home" }] }));

    const result = listVaults();
    expect(result[0]?.name).toBe("home");
  });

  it("sets exists to false for non-existent paths", () => {
    const nonexistent = path.join(vaultDir, "nonexistent");
    writeConfig(stringifyToml({ version: 2, vaults: [{ path: nonexistent }] }));

    const result = listVaults();
    expect(result[0]?.exists).toBe(false);
  });

  it("handles multiple vaults", () => {
    const work = path.join(vaultDir, "work");
    const life = path.join(vaultDir, "life");
    mkdirSync(work);
    mkdirSync(life);

    writeConfig(stringifyToml({ version: 2, vaults: [{ path: work }, { path: life }] }));

    const result = listVaults();
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("work");
    expect(result[1]?.name).toBe("life");
  });

  it("never throws on config parse error", () => {
    writeConfig("this is not valid toml {{{");
    expect(listVaults()).toEqual([]);
  });
});

describe("smol-toml round-trip", () => {
  it("round-trips [[vaults]] through smol-toml", () => {
    const config = {
      version: 2,
      vaults: [{ path: "~/brain/personal" }, { path: "~/work/eng-vault", name: "work" }],
    };
    const toml = stringifyToml(config);
    const parsed = parseToml(toml);
    expect(parsed["version"]).toBe(2);
    expect(parsed["vaults"]).toEqual([{ path: "~/brain/personal" }, { path: "~/work/eng-vault", name: "work" }]);
  });
});

describe("validateRegistry", () => {
  it("returns empty array when no collisions", () => {
    const entries: VaultEntry[] = [
      { name: "work", path: "~/work", resolvedPath: "/home/u/work", exists: true },
      { name: "life", path: "~/life", resolvedPath: "/home/u/life", exists: true },
    ];
    expect(validateRegistry(entries)).toEqual([]);
  });

  it("detects name collisions", () => {
    const entries: VaultEntry[] = [
      { name: "work", path: "~/a", resolvedPath: "/home/u/a", exists: true },
      { name: "work", path: "~/b", resolvedPath: "/home/u/b", exists: true },
    ];
    const errors = validateRegistry(entries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("work");
  });

  it("detects multiple collisions", () => {
    const entries: VaultEntry[] = [
      { name: "work", path: "~/a", resolvedPath: "/home/u/a", exists: true },
      { name: "work", path: "~/b", resolvedPath: "/home/u/b", exists: true },
      { name: "home", path: "~/c", resolvedPath: "/home/u/c", exists: true },
      { name: "home", path: "~/d", resolvedPath: "/home/u/d", exists: true },
    ];
    const errors = validateRegistry(entries);
    expect(errors).toHaveLength(2);
  });
});
