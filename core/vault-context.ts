import { listVaults, readVaultConfigSimple } from "./vault.js";
import type { VaultContext, BrainkitConfig } from "./types.js";

/**
 * Resolve the current vault context from environment variables and vault registry.
 *
 * Resolution order:
 * 1. BRAINKIT_VAULT_PATH -> single vault mode (env override)
 * 2. BRAINKIT_ALL_VAULTS=1 -> multi-vault mode (all registered vaults)
 * 3. Fallback: auto-select if 1 vault, else none
 */
export function resolveVaultContext(): VaultContext {
  // 1. Single vault from env var (highest priority override)
  const fromEnv = process.env["BRAINKIT_VAULT_PATH"];
  if (fromEnv !== undefined && fromEnv !== "") return { mode: "single", vaultPath: fromEnv };

  // 2. All-vaults mode
  if (process.env["BRAINKIT_ALL_VAULTS"] === "1") {
    try {
      const entries = listVaults().filter((e) => e.exists);
      const vaults: Array<{ name: string; path: string; config: BrainkitConfig }> = [];
      for (const entry of entries) {
        try {
          const config = readVaultConfigSimple(entry.resolvedPath);
          vaults.push({ name: entry.name, path: entry.resolvedPath, config });
        } catch {
          // eslint-disable-next-line no-console
          console.warn(`[brainkit] Skipping vault "${entry.name}": config unreadable`);
        }
      }
      if (vaults.length === 0) return { mode: "none" };
      return { mode: "all", vaults };
    } catch {
      return { mode: "none" };
    }
  }

  // 3. Fallback: auto-select single vault
  try {
    const entries = listVaults().filter((e) => e.exists);
    if (entries.length === 1 && entries[0] !== undefined) {
      return { mode: "single", vaultPath: entries[0].resolvedPath };
    }
  } catch {
    // Can't resolve
  }

  return { mode: "none" };
}
