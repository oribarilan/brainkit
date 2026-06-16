import * as path from "node:path";
import * as os from "node:os";

import { readGlobalConfig, discoverVaults, readVaultConfigSimple } from "./vault.js";
import type { VaultContext, BrainkitConfig } from "./types.js";

/**
 * Resolve the current vault context from environment variables and global config.
 *
 * Resolution order:
 * 1. BRAINKIT_ALL_VAULTS=1 -> multi-vault mode (reads brain_path from global config)
 * 2. BRAINKIT_VAULT_PATH -> single vault mode
 * 3. Fallback: auto-select if 1 vault, else none
 */
export function resolveVaultContext(): VaultContext {
  // 1. All-vaults mode (takes precedence)
  if (process.env.BRAINKIT_ALL_VAULTS === "1") {
    try {
      const globalConfig = readGlobalConfig();
      if (!globalConfig?.brain_path) return { mode: "none" };

      const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
      const vaultNames = discoverVaults(brainPath);

      const vaults: Array<{ name: string; path: string; config: BrainkitConfig }> = [];
      for (const name of vaultNames) {
        const vaultPath = path.join(brainPath, name);
        try {
          const config = readVaultConfigSimple(vaultPath);
          vaults.push({ name, path: vaultPath, config });
        } catch {
          console.warn(`[brainkit] Skipping vault "${name}": config unreadable`);
        }
      }

      if (vaults.length === 0) return { mode: "none" };
      return { mode: "all", vaults };
    } catch {
      return { mode: "none" };
    }
  }

  // 2. Single vault from env var
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return { mode: "single", vaultPath: fromEnv };

  // 3. Fallback discovery
  try {
    const globalConfig = readGlobalConfig();
    if (!globalConfig?.brain_path) return { mode: "none" };

    const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
    const vaults = discoverVaults(brainPath);
    if (vaults.length === 1) return { mode: "single", vaultPath: path.join(brainPath, vaults[0]!) };
  } catch {
    // Can't resolve
  }

  return { mode: "none" };
}
