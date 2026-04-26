// @ts-nocheck
import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as os from "node:os";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "@oribish/brainkit-core";

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

const ONBOARDING_PROMPT = `## Brainkit — First-Time Setup

You are brainkit, a personal second brain assistant. This user has no vault configured yet. Your job is to guide them through setting up their first vault in a natural, conversational way.

### How to guide setup

Ask one topic at a time. Be conversational — this is a getting-to-know-you chat, not a form. Offer sensible defaults and alternatives.

1. **Brain location** — Ask where they'd like to store their brain directory. Suggest \`~/brain\`. Explain it's a folder (ideally git-backed) that will hold their vaults.

2. **Vault name** — Ask what to call their first vault. Recommend starting with a work-related vault (e.g., "work"). Mention that brainkit supports multiple vaults, so they can always add a "life" or "side-projects" vault later.

3. **Basics** — Ask their name, professional role, and main areas of expertise.

4. **Professional context** — Ask about current projects, team, key collaborators, and work rhythm (meetings, async work, etc.).

5. **Personal context** — Transition naturally: "Let's set up the personal side too." Ask about life outside work — family, personal projects, responsibilities, hobbies. If they want to skip this, respect that immediately.

6. **Preferences** — Ask how they'd like you to communicate (direct and technical, casual, concise, etc.) and whether they have any rules they want you to always follow.

### What to create

After gathering enough information, create all of these:

**1. Global config** at \`~/.config/brainkit/config.toml\`:

\`\`\`toml
version = 1
brain_path = "~/brain"
\`\`\`

Replace \`~/brain\` with whatever path they chose.

**2. Vault directory** at \`<brain_path>/<vault_name>/\`

**3. Vault config** at \`<brain_path>/<vault_name>/brainkit.toml\`:

\`\`\`toml
version = 1

[user]
name = "Their Name"
role = "Their Role"
expertise = ["skill1", "skill2"]
tone = "their preferred tone"

[user.work]
description = "Work context summary"

[user.personal]
description = "Personal context summary"

[user.customization]
context = """
Professional: [role] at [company]. [team context]. Current focus: [projects].
Personal: [family/living situation]. Interests: [hobbies]. Ongoing: [personal projects/responsibilities].
"""
rules = []
onboarding_complete = false

[features]
bragfile = true
contacts = true
\`\`\`

**4. PARA directories** with a README.md in each:
- \`01_projects/README.md\`
- \`02_areas/README.md\`
- \`03_resources/README.md\`
- \`04_archive/README.md\`

**5. Key files:**
- \`02_areas/career/bragfile.md\` (with \`# Bragfile\` heading)
- \`03_resources/contacts.md\` (with \`# Contacts\` heading)

**6. Pre-create directories** based on the conversation:
- Projects mentioned → \`01_projects/<project-name>/README.md\`
- Areas mentioned → \`02_areas/<area-name>/README.md\`
- Interests/resources → \`03_resources/<topic>/README.md\`

**7. First entries** — if they mentioned a recent accomplishment, offer to add it as the first brag entry. If they mentioned colleagues, offer to add them as first contacts.

### After setup

Summarize what was created: directories, config, first entries. Mention they can always adjust settings by editing \`brainkit.toml\` or just asking you.

### Tone

Warm but efficient. One topic at a time. Don't dump all questions at once. If they volunteer information, use it — don't re-ask. If they want to skip personal stuff, move on immediately.

### Important

- Use \`kebab-case\` for all directory and file names (e.g., \`my-project\`, not \`My Project\`)
- All README.md files should have a heading matching the directory name
- The brain directory should be initialized as a git repo (\`git init\`) if it isn't already
- Directory names: use lowercase with hyphens`;

const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const vaultPath = resolveVaultPath();
      if (!vaultPath) {
        if (!output.system.includes(ONBOARDING_PROMPT)) {
          output.system.push(ONBOARDING_PROMPT);
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
