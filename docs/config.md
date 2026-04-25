# Configuration

## Overview

Brainkit uses two config files: a minimal global pointer and a vault-local config that travels with the vault. The split ensures the vault is fully portable — clone it anywhere, point brainkit at it, and everything works.

## Global Config

**Path:** `~/.config/brainkit/config.toml`

Points brainkit to the brain directory (which contains one or more vaults). This is the only file that's machine-specific and not checked into git.

```toml
version = 1
brain_path = "/Users/you/brain"
```

| Field        | Type   | Required | Description                                              |
| ------------ | ------ | -------- | -------------------------------------------------------- |
| `brain_path` | string | yes      | Absolute path to the brain directory containing vaults   |

**Created by:** The agent during onboarding, or manually by the user.

**Also at `~/.config/brainkit/`:** The CLI launcher writes `opencode.json` and `tui.json` here for OpenCode plugin loading. These are auto-generated and not user-editable.

### `BRAINKIT_VAULT_PATH` environment variable

Set by the CLI launcher after vault selection. Contains the absolute path to the selected vault (e.g., `/Users/you/brain/work`). Read by the OpenCode plugin at init to know which vault to operate on. Not set by the user — managed by the launcher.

### `--vault` flag

When the brain directory contains multiple vaults, use `--vault <name>` to select one:

```bash
brainkit --vault work
brainkit oc --vault life
```

If omitted with a single vault, it auto-selects. With multiple vaults, an interactive prompt appears.

## Vault Config

**Path:** `<vault>/brainkit.toml`

All user preferences and feature toggles. Lives in the vault root, checked into git, backed up naturally. If you clone your vault on a new machine, this comes along.

```toml
version = 1

[user]
name = "Ori"
role = "Software Engineer"
expertise = ["TypeScript", "distributed systems", "AI tooling"]
tone = "direct"

[user.work]
description = "Staff engineer at Acme Corp, a 500-person fintech startup. Stack: TypeScript, Go, PostgreSQL, AWS. Team of 8 backend engineers."

[user.personal]
description = "Based in Tel Aviv. Into climbing, chess, and mechanical keyboards."

[user.customization]
context = "Currently focused on API platform migration from REST to gRPC."
rules = [
  "Always use metric units",
  "Prefer concise bullet points over paragraphs"
]
onboarding_complete = false

[features]
bragfile = true
contacts = true
```

### `version`

| Field     | Type    | Required | Description                                                       |
| --------- | ------- | -------- | ----------------------------------------------------------------- |
| `version` | integer | yes      | Config schema version. Currently `1`. Used for future migrations. |

### `[user]` — Identity

| Field       | Type     | Required | Default          | Description                                                                                               |
| ----------- | -------- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `name`      | string   | yes      | —                | User's name. Used in system prompt and vault references.                                                  |
| `role`      | string   | yes      | —                | Professional role/title.                                                                                  |
| `expertise` | string[] | no       | `[]`             | Areas of expertise. Helps the agent tailor its responses.                                                 |
| `tone`      | string   | no       | `"direct"`       | Preferred writing tone for vault content (direct, casual, concise, formal).                               |

### `[user.work]` — Professional Context

| Field         | Type   | Required | Default | Description                                                                                                                                                |
| ------------- | ------ | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | string | no       | —       | Free-text about the user's work life — company, team, tech stack, size, focus area. Injected into the system prompt to give the agent workplace awareness. |

### `[user.personal]` — Personal Context

| Field         | Type   | Required | Default | Description                                                                                                                          |
| ------------- | ------ | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `description` | string | no       | —       | Free-text about the user's personal life — location, hobbies, family, interests. |

### `[user.customization]` — Behavioral Tweaks

| Field                 | Type     | Required | Default | Description                                                                                                                         |
| --------------------- | -------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `context`             | string   | no       | —       | Freeform context injected into the system prompt. Use for temporary focus areas or project context.                                 |
| `rules`               | string[] | no       | `[]`    | Custom rules the agent must follow (e.g., formatting preferences, unit systems, communication style).                               |
| `onboarding_complete` | boolean  | no       | `false` | When `true`, the agent stops offering to fill in missing config fields. Set by the agent after onboarding, or manually by the user. |

### `[features]` — Feature Toggles

| Field      | Type    | Required | Default | Description                               |
| ---------- | ------- | -------- | ------- | ----------------------------------------- |
| `bragfile` | boolean | no       | `true`  | Enable the bragfile (accomplishment log). |
| `contacts` | boolean | no       | `true`  | Enable the contacts index.                |

### `[agents]` — Agent System

| Field                 | Type    | Required | Default | Description                                                        |
| --------------------- | ------- | -------- | ------- | ------------------------------------------------------------------ |
| `enabled`             | boolean | no       | `false` | Enable brainkit's agent system (Thinker, Consultant, Librarian).   |
| `keep_builtin_agents` | boolean | no       | `false` | When `true`, keep OpenCode's built-in agents alongside brainkit's. |

### `[agents.thinker]` / `[agents.consultant]` / `[agents.librarian]`

| Field   | Type   | Required | Default                            | Description                                                             |
| ------- | ------ | -------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `model` | string | no       | Inherited from user's global model | Model ID in `provider/model` format (e.g. `anthropic/claude-opus-4-6`). |

See `specs/10-agents.md` for agent roles, permissions, and prompt design.

## Config Lifecycle

### First Run (No Config)

1. **No global config** → Plugin loads but can't inject system prompt. The agent is instructed (via a minimal fallback prompt) to guide the user through setup: ask where the vault should live, create the global config.

2. **Global config exists, no `brainkit.toml`** → Agent detects a fresh vault. Triggers the onboarding skill which walks through a conversational Q&A to fill in user info, preferences, and feature choices. Writes `brainkit.toml` when done.

3. **`brainkit.toml` exists but incomplete** → Agent notices missing fields. If `onboarding_complete` is `false`, it offers to fill them in naturally during conversation. If `true`, it stays quiet about missing fields.

### Steady State

The plugin reads both configs on every turn (system prompt hook). Changes to `brainkit.toml` take effect immediately — no restart needed.

**Exception:** Changes to `[agents]` require restarting OpenCode — the agent config hook runs once at startup. The agent can also modify the config (e.g., toggling a feature, updating context) via its built-in file editing tools.

### Portable Vault

```bash
# On a new machine:
# 1. Clone the vault
git clone git@github.com:you/second-brain.git ~/second-brain

# 2. Point brainkit at it (agent does this during first run, or manually)
mkdir -p ~/.config/brainkit
echo 'version = 1\nbrain_path = "/Users/you/brain"' > ~/.config/brainkit/config.toml

# 3. Launch brainkit — everything works
brainkit
```

### Migrations

The `version` field tracks config schema version. When brainkit updates:

- **Non-breaking changes** (new optional fields): auto-applied silently at startup, version bumped.
- **Breaking changes** (renames, removals): detected at startup, surfaced to the agent, applied only after user approval.

See `specs/11-migrations.md` for the migration pipeline design.

## Key Decisions

**Why two config files?**
The vault is a git repo. The path to it is machine-specific and shouldn't be in git. Everything else (user identity, preferences, feature toggles) should be — so it's in `brainkit.toml` inside the vault.

**Why TOML?**
Human-readable, easy to edit by hand, minimal syntax. The agent can read and write it with standard file tools. Already used by the vault config, so consistent.

**Why `onboarding_complete` instead of just checking if fields are filled?**
A user might intentionally leave `user.personal.description` empty (scope is professional-only). Without the flag, the agent would keep nagging about it. The flag gives the user explicit control over when setup is "done enough."

**Why free-text `description` fields instead of structured fields?**
Work and personal context are highly variable. Structured fields (company_name, team_size, tech_stack) would be rigid and incomplete. Free text lets the user describe their situation naturally, and the agent parses it from the system prompt.

## Related

- `core/types.ts` — TypeScript interfaces for both config types
- `core/vault.ts` — `readGlobalConfig()`, `writeGlobalConfig()`, `readVaultConfig()`, `writeVaultConfig()`
- `docs/features.md` — feature definitions that reference config toggles
- `specs/09-opencode-plugin.md` — how the plugin reads and uses config
