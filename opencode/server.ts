// @ts-nocheck
import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import {
  readVaultConfigSimple,
  buildSystemPrompt,
  buildMultiVaultPrompt,
  buildOnboardingPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
  resolveVaultContext,
} from "../core/index.ts";

const id = "brainkit";

const suggestedSessions = new Set<string>();

const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const ctx = resolveVaultContext();

      if (ctx.mode === "none") {
        const onboardingPrompt = buildOnboardingPrompt("opencode");
        if (!output.system.includes(onboardingPrompt)) {
          output.system.push(onboardingPrompt);
        }
        return;
      }

      if (ctx.mode === "all") {
        const prompt = buildMultiVaultPrompt(ctx.vaults, { mode: "cli" });
        if (!output.system.includes(prompt)) {
          output.system.push(prompt);
        }
        return;
      }

      // Single vault
      try {
        const vaultConfig = readVaultConfigSimple(ctx.vaultPath);
        if (!vaultConfig) return;
        const prompt = buildSystemPrompt(vaultConfig, ctx.vaultPath, { mode: "cli" });
        if (!output.system.includes(prompt)) {
          output.system.push(prompt);
        }
      } catch {
        // Gracefully handle missing vault
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      const ctx = resolveVaultContext();

      if (ctx.mode === "all") {
        const blocks = ctx.vaults.map((v) => {
          const features =
            Object.entries(v.config.features ?? {})
              .filter(([, val]) => val)
              .map(([k]) => k)
              .join(", ") || "defaults";
          return [
            `### \`${v.name}\``,
            `- User: ${v.config.user.name} (${v.config.user.role})`,
            `- Path: ${v.path}`,
            `- Features: ${features}`,
            `- Tone: ${v.config.user.tone ?? "direct"}`,
          ].join("\n");
        });
        output.system.push("## Brainkit Vault Context (Condensed — All Vaults)\n" + blocks.join("\n\n"));
        return;
      }

      if (ctx.mode !== "single") return;
      try {
        const vaultConfig = readVaultConfigSimple(ctx.vaultPath);
        if (!vaultConfig) return;

        const vaultName = path.basename(ctx.vaultPath);
        const identity = [
          "## Brainkit Vault Context (Condensed)",
          `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
          `- Vault: ${vaultName} (${ctx.vaultPath})`,
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
      const ctx = resolveVaultContext();

      // Brag detection (unchanged — toast is generic, agent knows routing)
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
        if (ctx.mode === "single") {
          scheduleAutoCommit(ctx.vaultPath);
        } else if (ctx.mode === "all") {
          for (const vault of ctx.vaults) {
            scheduleAutoCommit(vault.path);
          }
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
