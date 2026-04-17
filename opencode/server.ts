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
        const vaultConfig = readVaultConfig(globalConfig.vaultPath);
        if (!vaultConfig) return;
        const prompt = buildSystemPrompt({
          mode: "cli",
          globalConfig,
          vaultConfig,
        });
        if (!prompt) return;
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
        const vaultConfig = readVaultConfig(globalConfig.vaultPath);
        if (!vaultConfig) return;

        const identity = [
          "## Brainkit Vault Context (Condensed)",
          `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
          `- Vault: ${globalConfig.vaultPath}`,
          `- Features: ${Object.entries(vaultConfig.features)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ")}`,
          `- Tone: ${vaultConfig.user.tone}`,
          `- Scope: ${vaultConfig.user.scope}`,
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
          scheduleAutoCommit(globalConfig.vaultPath);
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
