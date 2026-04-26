// @ts-nocheck
import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as os from "node:os";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  buildOnboardingPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "../core/index.ts";

const id = "brainkit";

const suggestedSessions = new Set<string>();

function resolveVaultPath(): string | undefined {
  // 1. Env var (set by CLI launcher)
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return fromEnv;

  // 2. Fallback: discover from brain_path
  try {
    const globalConfig = readGlobalConfig();
    if (!globalConfig?.brain_path) return undefined;
    const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
    const vaults = discoverVaults(brainPath);
    if (vaults.length === 1) return path.join(brainPath, vaults[0]!);
  } catch {
    // Can't resolve — return undefined
  }

  // 3. Multiple or zero vaults without env var — can't resolve
  return undefined;
}

const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const vaultPath = resolveVaultPath();
      if (!vaultPath) {
        const onboardingPrompt = buildOnboardingPrompt("opencode");
        if (!output.system.includes(onboardingPrompt)) {
          output.system.push(onboardingPrompt);
        }
        return;
      }
      try {
        const vaultConfig = readVaultConfigSimple(vaultPath);
        if (!vaultConfig) return;
        const prompt = buildSystemPrompt(vaultConfig, vaultPath, { mode: "cli" });
        if (output.system.includes(prompt)) return;
        output.system.push(prompt);
      } catch {
        // Gracefully handle missing vault
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      const vaultPath = resolveVaultPath();
      if (!vaultPath) return;
      try {
        const vaultConfig = readVaultConfigSimple(vaultPath);
        if (!vaultConfig) return;

        const vaultName = path.basename(vaultPath);
        const identity = [
          "## Brainkit Vault Context (Condensed)",
          `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
          `- Vault: ${vaultName} (${vaultPath})`,
          `- Features: ${
            Object.entries(vaultConfig.features ?? {})
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "defaults"
          }`,
          `- Tone: ${vaultConfig.user.tone ?? "direct"}`,
        ].join("\n");

        output.system.push(identity);
      } catch {
        // Gracefully handle missing vault
      }
    },

    "session.idle": async (event, api) => {
      const vaultPath = resolveVaultPath();

      // Brag detection
      try {
        const sessionId = event.session?.id;
        if (sessionId && !suggestedSessions.has(sessionId)) {
          const messages = event.messages ?? [];
          for (const msg of messages) {
            if (msg.role === "user" && typeof msg.content === "string") {
              if (containsUserAccomplishment(msg.content)) {
                suggestedSessions.add(sessionId);
                api.tui.showToast({
                  variant: "info",
                  message: "Sounds like an accomplishment! Consider adding it to your bragfile.",
                });
                break;
              }
            }
          }
        }
      } catch {
        // Gracefully handle errors
      }

      // Auto-commit
      if (vaultPath) {
        try {
          scheduleAutoCommit(vaultPath);
        } catch {
          // Gracefully handle errors
        }
      }
    },
  };
};

const plugin: { id: string; server: Plugin } = {
  id,
  server,
};

export default plugin;
