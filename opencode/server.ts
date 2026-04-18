// @ts-nocheck
import type { Plugin } from "@opencode-ai/plugin";
import {
  readGlobalConfig,
  readVaultConfig,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "@oribish/brainkit-core";

const id = "brainkit";

const suggestedSessions = new Set<string>();

const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      try {
        const globalConfig = readGlobalConfig();
        if (!globalConfig) return;
        const vaultConfig = readVaultConfig(globalConfig.vault_path);
        if (!vaultConfig) return;
        const prompt = buildSystemPrompt(vaultConfig, globalConfig.vault_path, { mode: "cli" });
        if (output.system.includes(prompt)) return;
        output.system.push(prompt);
      } catch {
        // Gracefully handle missing vault
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      try {
        const globalConfig = readGlobalConfig();
        if (!globalConfig) return;
        const vaultConfig = readVaultConfig(globalConfig.vault_path);
        if (!vaultConfig) return;

        const identity = [
          "## Brainkit Vault Context (Condensed)",
          `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
          `- Vault: ${globalConfig.vault_path}`,
          `- Features: ${
            Object.entries(vaultConfig.features ?? {})
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join(", ") || "defaults"
          }`,
          `- Tone: ${vaultConfig.user.tone ?? "direct"}`,
          `- Scope: ${vaultConfig.user.scope ?? "professional"}`,
        ].join("\n");

        output.system.push(identity);
      } catch {
        // Gracefully handle missing vault
      }
    },

    "session.idle": async (event, api) => {
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
      try {
        const globalConfig = readGlobalConfig();
        if (globalConfig) {
          scheduleAutoCommit(globalConfig.vault_path);
        }
      } catch {
        // Gracefully handle errors
      }
    },
  };
};

const plugin: { id: string; server: Plugin } = {
  id,
  server,
};

export default plugin;
