# Brainkit Agent System

## Overview

Brainkit provides an optional client-side agent system that registers specialized AI agents via OpenCode's plugin API. Users opt in during onboarding and configure model assignments in `brainkit.toml`.

The system follows a hub-and-spoke pattern: two primary agents (user-facing, switchable via Tab) and one sub-agent (delegated to by the primary agents for vault research).

## Agents

### Thinker (primary)

The main orchestrator. Full read/write access. Reasons about tasks, makes decisions, edits files, runs commands. This is the default agent when the agent system is enabled.

- **Mode**: `primary`
- **Recommended model**: Reasoning model with mid+ context window (e.g. Claude Opus, GPT-5.4, Kimi K2.5)
- **Permissions**: Full (read, write, edit, bash, etc.)
- **When to use**: General work — coding, vault management, bragfile entries, meeting notes, anything that requires action

### Consultant (primary)

Read-only strategic advisor. Can reason, analyze, and recommend — but cannot modify files or run destructive commands. Use when you want to think through a problem without risk of changes.

- **Mode**: `primary`
- **Recommended model**: Reasoning model with mid+ context window (same tier as Thinker, or a different model for second-opinion diversity)
- **Permissions**: Read-only with granular bash — can run read-only commands but cannot modify files or execute destructive operations
  ```json
  {
    "edit": "deny",
    "bash": {
      "*": "deny",
      "git log *": "allow",
      "git diff *": "allow",
      "git status *": "allow",
      "git show *": "allow",
      "grep *": "allow",
      "ls *": "allow",
      "cat *": "allow",
      "find *": "allow",
      "tree *": "allow",
      "head *": "allow",
      "tail *": "allow",
      "wc *": "allow",
      "just lint *": "allow",
      "just test *": "allow",
      "just check *": "allow"
    },
    "task": {
      "*": "deny",
      "librarian": "allow"
    }
  }
  ```
  > **How bash permissions work**: OpenCode uses simple wildcard matching (`*` = any chars, `?` = one char) against arity-parsed commands. For example, `git log --oneline --all` is parsed as `git log` (git has arity 2), then matched against `"git log *"`. Flags are stripped during parsing. Rules are evaluated in order; last match wins. Pipes and subshells are a known gap in OpenCode's permission system.
- **When to use**: Architecture decisions, code review, debugging strategy, "what should I do?" conversations

> **Note**: The Consultant is read-only for the vault but has limited project access — it can run linting and test commands in the current working directory. This makes it useful for code review and debugging strategy in the user's project, not just vault analysis.

### Librarian (sub-agent)

Vault search specialist. Delegated to by Thinker or Consultant when they need to find relevant information in the vault. Returns summarized, relevant results — not raw file dumps. This keeps the primary agent's context window clean.

- **Mode**: `subagent`
- **Recommended model**: Fast, cheap model with mid-high context window (e.g. Haiku, GPT-5.4-mini, Gemini Flash)
- **Permissions**: Read-only, no delegation — `edit: "deny"`, `bash: { "*": "deny", "cat *": "allow", "grep *": "allow", "find *": "allow", "ls *": "allow", "head *": "allow", "tail *": "allow", "wc *": "allow" }`, `task: "deny"`
- **Filesystem scoping**: The Librarian's access is restricted to the vault directory via `external_directory` permissions. Since the vault is typically outside the workspace (OpenCode runs from the user's project), this prevents the Librarian from reading arbitrary files:
  ```json
  {
    "external_directory": {
      "*": "deny",
      "{vaultPath}/**": "allow"
    }
  }
  ```
- **Prompt**: Receives the PARA structure layout and key file paths. Discovers actual vault contents dynamically via read/search tools at runtime. Instructed to search, filter, and summarize — return only what's relevant to the query. Scoped strictly to the vault (which is a git-backed repo).
- **When to use**: "Find my notes about X", "What contacts do I have at Company Y", "When did I last brag about Z"

## Configuration

### `brainkit.toml`

Agent configuration lives in the vault's `brainkit.toml` under an `[agents]` section:

```toml
[agents]
enabled = true
# keep_builtin_agents = true  # restore OpenCode's built-in agents alongside brainkit's

[agents.thinker]
model = "anthropic/claude-opus-4-6"

[agents.consultant]
model = "openai/gpt-5.4"

[agents.librarian]
model = "anthropic/claude-haiku-4-5"
```

When `agents.enabled = false` (or absent), brainkit does not register any agents — the user gets vanilla OpenCode behavior with brainkit's system prompt and skills only.

When `agents.enabled = true`, brainkit's agents replace the built-in OpenCode agents by default (build, plan, explore, etc. are disabled). Only Thinker, Consultant, and Librarian appear.

Setting `keep_builtin_agents = true` restores the built-in OpenCode agents alongside brainkit's agents. There is no merged mode — it's either brainkit agents only (default) or brainkit agents + built-in agents.

Changes to `[agents]` in `brainkit.toml` require restarting OpenCode to take effect. There is no hot-reload — the config hook runs once at startup.

### Model assignment

Users are not required to set models. Behavior when `model` is omitted:

- **Thinker / Consultant**: Inherit the user's globally configured model (standard OpenCode behavior for primary agents)
- **Librarian**: Inherits from the invoking primary agent (standard OpenCode behavior for sub-agents)

Setting explicit models is recommended for cost optimization (cheap model for Librarian) and diversity (different reasoning model for Consultant).

## Implementation

### Type updates

The `BrainkitConfig` type in `core/types.ts` needs an `agents` field:

```typescript
export interface BrainkitConfig {
  // ...existing fields...
  agents?: {
    enabled?: boolean;
    keep_builtin_agents?: boolean;
    thinker?: { model?: string };
    consultant?: { model?: string };
    librarian?: { model?: string };
  };
}
```

### Registration

Agents are registered via the `config` hook on the plugin's server export. The plugin reads `brainkit.toml`, and if agents are enabled, mutates `config.agent`:

```typescript
config: async (opencodeConfig) => {
  const globalConfig = readGlobalConfig();
  if (!globalConfig) return;
  const vaultPath = globalConfig.vault_path;
  const { config: vaultConfig } = readVaultConfig(vaultPath);
  if (!vaultConfig?.agents?.enabled) return;

  opencodeConfig.default_agent = "thinker";

  // Hide built-in OpenCode agents unless keep_builtin_agents is set
  if (!vaultConfig.agents.keep_builtin_agents) {
    for (const key of Object.keys(opencodeConfig.agent ?? {})) {
      opencodeConfig.agent[key] = { ...opencodeConfig.agent[key], disable: true };
    }
  }

  opencodeConfig.agent = {
    ...opencodeConfig.agent,
    thinker: {
      description: "Brainkit's main agent. Full access. Reasons, plans, and executes.",
      mode: "primary",
      model: vaultConfig.agents.thinker?.model,
      prompt: buildThinkerPrompt(vaultConfig, vaultPath),
    },
    consultant: {
      description: "Read-only advisor. Analyzes, reviews, recommends — no modifications.",
      mode: "primary",
      model: vaultConfig.agents.consultant?.model,
      prompt: buildConsultantPrompt(vaultConfig, vaultPath),
      permission: {
        read: "allow",
        edit: "deny",
        bash: {
          "*": "deny",
          "git log *": "allow",
          "git diff *": "allow",
          "git status *": "allow",
          "git show *": "allow",
          "grep *": "allow",
          "ls *": "allow",
          "cat *": "allow",
          "find *": "allow",
          "tree *": "allow",
          "head *": "allow",
          "tail *": "allow",
          "wc *": "allow",
          "just lint *": "allow",
          "just test *": "allow",
          "just check *": "allow",
        },
        task: {
          "*": "deny",
          librarian: "allow",
        },
      },
    },
    librarian: {
      description: "Vault search specialist. Finds and summarizes relevant vault content.",
      mode: "subagent",
      model: vaultConfig.agents.librarian?.model,
      prompt: buildLibrarianPrompt(vaultConfig, vaultPath),
      permission: {
        edit: "deny",
        external_directory: {
          "*": "deny",
          [`${vaultPath}/**`]: "allow",
        },
        bash: {
          "*": "deny",
          "cat *": "allow",
          "grep *": "allow",
          "find *": "allow",
          "ls *": "allow",
          "head *": "allow",
          "tail *": "allow",
          "wc *": "allow",
        },
        task: "deny",
      },
    },
  };
};
```

### Plugin entry point

The current `opencode/server.ts` uses the `ServerPlugin` pattern (`api.hook(...)`). The `config` hook uses the `Plugin` pattern (returning a hooks object). These need to coexist — the plugin module exports both:

```typescript
// opencode/server.ts
export default {
  server: async (ctx) => {
    // config hook for agent registration
    return {
      config: async (config) => {
        /* register agents */
      },
      // other hooks...
    };
  },
} satisfies PluginModule;
```

> **Note**: The `config` hook coexists with the existing `ServerPlugin` hooks via the `PluginModule` export pattern shown above.

### System prompt interaction

Agent prompts have two layers:

- **Static** (set once at startup via `prompt` field): Role, identity, vault structure, conventions, custom rules, delegation instructions. These don't change during a session.
- **Dynamic** (injected per-turn via `experimental.chat.system.transform`): Bragfile staleness reminders, pending config migrations, onboarding/vault state detection, project context. These refresh each turn.

When agents are enabled, the `system.transform` hook is still registered but only injects dynamic sections — not the full system prompt. This avoids double-injecting static content while keeping situational awareness fresh.

When agents are disabled (`agents.enabled = false` or absent), the `system.transform` hook injects the full brainkit system prompt (static + dynamic), same as current behavior.

### Agent prompts

Each agent gets a tailored system prompt built at startup from the vault config. The prompts share some sections (identity, vault structure) but differ in role framing and behavioral instructions.

#### Shared sections

These sections are included in all agent prompts (Thinker, Consultant, Librarian):

1. **Identity** — user name, role, expertise, work/personal context (from `brainkit.toml`). Same content as the existing `buildSystemPrompt()` identity section.
2. **Vault structure** — PARA directory layout, key file paths (bragfile, contacts).

#### Thinker prompt

The Thinker gets the full brainkit system prompt (identity, vault structure, conventions, features, reminders) plus orchestrator-specific instructions.

```markdown
## Role

You are Thinker — brainkit's primary agent. You have full access to read, write, and manage the vault. You are the user's main interface for all vault operations.

## Delegation

You have a sub-agent called Librarian that specializes in vault search. Delegate to it when:

- The user asks a question that requires searching across multiple vault files
- You need to find specific notes, contacts, meeting notes, or brag entries
- You want to avoid loading large amounts of vault content into your own context

Delegate via: `task(subagent_type="librarian", prompt="<specific search query>")`

Write clear, specific search queries. The Librarian will return a summary of what it found — not raw file dumps. Use the summary to answer the user or take action.

Do NOT delegate when:

- You already know the file path (just read it directly)
- The operation is a simple single-file read
- You're writing or editing files (Librarian is read-only)

## Vault operations

{existing buildSystemPrompt sections: key files, conventions, behavioral rules, custom rules}

## Reminders

{bragfile staleness, onboarding nudges — same as existing buildSystemPrompt}
```

#### Consultant prompt

The Consultant shares the vault context but is framed as a read-only advisor. No feature-action guidance (no "use brain_add_brag"), no proactive nudges (bragfile staleness, onboarding). Only analysis and recommendations.

```markdown
## Role

You are Consultant — brainkit's read-only advisor. You can read the vault, analyze content, and provide strategic advice. You cannot modify files, run destructive commands, or make changes.

Your job is to help the user think — not to act. Recommend what to do, analyze trade-offs, review content, spot patterns. If the user wants to act on your advice, they should switch to Thinker.

## Delegation

You have a sub-agent called Librarian that specializes in vault search. Delegate to it when you need to find information across the vault. Same delegation rules as Thinker.

Delegate via: `task(subagent_type="librarian", prompt="<specific search query>")`

## Vault context

{identity, vault structure, key files — same as Thinker but read-only framing}

## Conventions

{same conventions section — Consultant needs to understand vault formatting even though it can't write}

## Constraints

- You CANNOT modify vault files. If the user asks you to make changes, remind them to switch to Thinker.
- You CAN run read-only commands (git log, git diff, grep, ls, cat) to gather context.
- You CAN delegate to Librarian for vault search.
- Focus on analysis, not action. Ask clarifying questions. Surface insights.
```

#### Librarian prompt

The Librarian gets a minimal, focused prompt — vault structure knowledge and search instructions. No feature guidance, no conventions, no behavioral rules. It just needs to find things and summarize them.

```markdown
## Role

You are Librarian — brainkit's vault search specialist. Your job is to find relevant information in the user's vault and return a concise, useful summary.

## Vault

Path: `{vaultPath}`

The vault follows the PARA method:

- `01_projects/` — Active projects with goals and deadlines
- `02_areas/` — Ongoing responsibilities (career, health, finance, etc.)
- `03_resources/` — Reference material and topics of interest
- `04_archive/` — Inactive items

Key files:

- `02_areas/career/bragfile.md` — Accomplishment log (if bragfile enabled)
- `03_resources/contacts.md` — People index (if contacts enabled)
- `brainkit.toml` — Vault configuration

## Vault contents

Use your read and search tools (`ls`, `find`, `grep`, `cat`) to discover vault contents dynamically. The vault is a git-backed repository — explore it at runtime rather than relying on a static snapshot.

## Instructions

1. Read the search query carefully. Understand what the user (via the primary agent) is looking for.
2. Use your read and search tools to find relevant files and content in the vault.
3. Return a **summary** of what you found — not raw file contents. Include:
   - Which files contained relevant information
   - Key details, quotes, or data points that answer the query
   - How confident you are in the results (did you find exact matches or partial?)
4. If you find nothing relevant, say so clearly. Don't fabricate results.

## Constraints

- You are read-only. You cannot modify any files.
- You cannot delegate to other agents.
- Scope your search to the vault at `{vaultPath}`. Do not search outside it.
- Be concise. The primary agent will use your summary to respond to the user — don't include unnecessary context.
```

### Delegation pattern

Thinker and Consultant delegate to Librarian via OpenCode's built-in `task()` / `delegate_task()` tool:

```
delegate_task(subagent_type="librarian", prompt="Find all meeting notes mentioning the API redesign project")
```

The Librarian searches the vault, reads relevant files, and returns a summary. The primary agent receives the summary in its context — not the raw file contents.

### Prompt composition

Agent prompts are built from reusable section builders, not monolithic templates. This keeps shared content DRY while allowing per-agent customization.

#### File layout

| File                      | Purpose                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `core/prompt-sections.ts` | Section builder functions (`buildIdentity`, `buildVaultStructure`, `buildKeyFiles`, etc.)            |
| `core/agent-prompts.ts`   | Per-agent composers (`buildThinkerPrompt`, `buildConsultantPrompt`, `buildLibrarianPrompt`)          |
| `core/system-prompt.ts`   | Existing `buildSystemPrompt()` recomposed from section builders (backward compat for no-agents mode) |

Each section builder is a pure function `(SectionContext) → string | null`. Agent prompt builders select which sections to include via `joinSections([...])`.

#### Section matrix

| Section           | No-agents | Thinker | Consultant | Librarian | Delivery |
| ----------------- | --------- | ------- | ---------- | --------- | -------- |
| Brainkit preamble | ✓         | ✓       | ✓          | ✓         | Static   |
| Agent role        | —         | ✓       | ✓          | ✓         | Static   |
| Identity          | ✓         | ✓       | ✓          | —         | Static   |
| Vault structure   | ✓         | ✓       | ✓          | ✓         | Static   |
| Key files         | ✓         | ✓       | ✓          | ✓         | Static   |
| Conventions       | ✓         | ✓       | ✓          | —         | Static   |
| Custom rules      | ✓         | ✓       | ✓          | —         | Static   |
| Behavioral rules  | ✓         | ✓       | —          | —         | Static   |
| Delegation        | —         | ✓       | ✓          | —         | Static   |
| Discoverability   | ✓         | ✓       | —          | —         | Static   |
| Project context   | ✓         | ✓       | —          | —         | Dynamic  |
| Brag reminder     | ✓         | ✓       | —          | —         | Dynamic  |
| Onboarding        | ✓         | ✓       | —          | —         | Dynamic  |
| Profile nudge     | ✓         | ✓       | —          | —         | Dynamic  |
| Pending migration | ✓         | ✓       | —          | —         | Dynamic  |

**Static** sections are set once at startup via the agent's `prompt` field (or via `system.transform` in no-agents mode). **Dynamic** sections are injected per-turn via `system.transform` and refresh each turn. When agents are enabled, only Thinker receives dynamic sections — Consultant and Librarian don't need situational prompts since they can't act on them.

The Librarian is intentionally minimal — just enough to navigate and search the vault. The Consultant gets vault context for understanding but no action instructions or proactive nudges. The Thinker gets everything (effectively the current `buildSystemPrompt()` plus role header and delegation instructions).

#### `SectionContext` type

```typescript
type SectionContext = {
  config: BrainkitConfig;
  vaultPath: string;
  mode: PromptMode;
  cwd?: string;
};
```

## Onboarding

When a user runs onboarding (first-run or `/setup`), the agent asks if they want to enable the agent system. If yes:

1. Explain the three agents and their roles
2. Help the user list available models via `opencode models [provider]` (CLI) or `/models` (TUI). Use `opencode models --verbose` for cost details. Guide selection based on available models.
3. Guide model selection with recommendations:
   - Thinker: "Pick a strong reasoning model — this is your main workhorse"
   - Consultant: "Can be the same as Thinker, or a different model for diverse perspectives"
   - Librarian: "Pick a fast, cheap model — it just searches and summarizes"
4. Write the `[agents]` section to `brainkit.toml`
5. Inform the user they need to restart OpenCode for agent changes to take effect (config hook runs at startup)

The onboarding skill should reference OpenCode's docs for model listing and provider setup.
