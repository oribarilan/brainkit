import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readGlobalConfig, readVaultConfig, type BrainkitConfig } from "./vault.js";
import { registerTools } from "./tools.js";
import { setupUI } from "./ui.js";
import { setupHooks } from "./hooks.js";
import { setupUpdater } from "./updater.js";

export default function brainkit(pi: ExtensionAPI): void {
  // --- State ---
  let vaultPath: string | null = null;
  let config: BrainkitConfig | null = null;

  const getVaultPath = (): string | null => vaultPath;
  const getConfig = (): BrainkitConfig | null => config;

  // --- Load vault config ---
  function loadVault(): void {
    const globalConfig = readGlobalConfig();
    if (globalConfig) {
      vaultPath = globalConfig.vaultPath;
      try {
        config = readVaultConfig(vaultPath);
      } catch {
        config = null;
      }
    }
  }

  // Initial load
  loadVault();

  // --- Register everything ---
  registerTools(pi, getVaultPath, getConfig, loadVault);
  setupUI(pi, getVaultPath, getConfig);
  setupHooks(pi, getVaultPath, getConfig);
  setupUpdater(pi);

  // --- /setup command (thin wrapper) ---
  pi.registerCommand("setup", {
    description: "Set up your brainkit vault",
    // eslint-disable-next-line @typescript-eslint/require-await
    handler: async (_args, _ctx) => {
      pi.sendUserMessage("I want to set up my brainkit vault. Walk me through the configuration.", {
        deliverAs: "followUp",
      });
    },
  });

  // --- /doctor command (thin wrapper) ---
  pi.registerCommand("doctor", {
    description: "Check and fix vault health",
    // eslint-disable-next-line @typescript-eslint/require-await
    handler: async (_args, _ctx) => {
      pi.sendUserMessage("Run a health check on my vault and fix any issues.", { deliverAs: "followUp" });
    },
  });

  // --- Reload vault on session start ---
  pi.on("session_start", (_event, _ctx) => {
    loadVault();
  });
}
