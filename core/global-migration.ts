import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import { discoverVaults, expandTilde, getConfigDir } from "./vault.js";
import type { BrainkitGlobalConfig } from "./types.js";

/**
 * Migrate global config from v1 (brain_path) to v2 (vaults registry).
 * Pure in-memory transform — does not touch disk.
 *
 * Detection: version === 1 (or missing) AND brain_path exists AND no vaults.
 * Returns config unchanged if already v2+, or if v1 without brain_path.
 */
export function migrateGlobalConfig(raw: Record<string, unknown>): BrainkitGlobalConfig {
  const version = typeof raw["version"] === "number" ? raw["version"] : 1;

  // Already v2+ → pass through
  if (version >= 2 || Array.isArray(raw["vaults"])) {
    return {
      version: raw["version"] as number,
      default_harness: raw["default_harness"] as string | undefined,
      skip_versions: raw["skip_versions"] as string[] | undefined,
      vaults: (raw["vaults"] as Array<{ path: string; name?: string }> | undefined) ?? [],
    };
  }

  // v1 without brain_path → minimal migration (add empty vaults, bump version)
  const brainPath = raw["brain_path"];
  if (typeof brainPath !== "string" || brainPath === "") {
    return {
      version: 2,
      default_harness: raw["default_harness"] as string | undefined,
      skip_versions: raw["skip_versions"] as string[] | undefined,
      vaults: [],
    };
  }

  // v1 with brain_path → discover vaults and build registry
  const resolvedBrainPath = path.resolve(expandTilde(brainPath));
  let vaultNames: string[] = [];
  try {
    vaultNames = discoverVaults(resolvedBrainPath);
  } catch {
    // brain_path doesn't exist or isn't a directory → empty vaults
  }

  // Build vault entries, preserving ~ from original brain_path
  const vaults: Array<{ path: string }> = vaultNames.map((name) => {
    if (brainPath.startsWith("~")) {
      // Preserve tilde form: ~/brain → ~/brain/personal
      const sep = brainPath.endsWith("/") || brainPath.endsWith("\\") ? "" : "/";
      return { path: brainPath + sep + name };
    }
    return { path: path.join(brainPath, name) };
  });

  return {
    version: 2,
    default_harness: raw["default_harness"] as string | undefined,
    skip_versions: raw["skip_versions"] as string[] | undefined,
    vaults,
  };
}

/**
 * Read raw config, detect v1, write v2 to disk with backup + atomic write.
 * Call early in CLI startup, before selectVault().
 * Does NOT crash on failure — logs warning and returns.
 * No-op if config doesn't exist or is already v2.
 */
export function maybeMigrateGlobal(): void {
  try {
    const configPath = path.join(getConfigDir(), "config.toml");
    let rawText: string;
    try {
      rawText = fs.readFileSync(configPath, "utf-8");
    } catch {
      return; // No config file — not a migration case
    }

    const raw = parseToml(rawText) as Record<string, unknown>;
    const version = typeof raw["version"] === "number" ? raw["version"] : 1;
    if (version >= 2 || Array.isArray(raw["vaults"])) {
      return; // Already v2+
    }

    const migrated = migrateGlobalConfig(raw);

    // Backup
    fs.copyFileSync(configPath, configPath + ".v1.bak");

    // Atomic write: tmp + rename
    const tmpPath = configPath + ".tmp";
    fs.writeFileSync(tmpPath, stringifyToml(migrated) + "\n", "utf-8");
    fs.renameSync(tmpPath, configPath);
  } catch {
    // Migration failure is not fatal — readGlobalConfig applies in-memory transform
  }
}
