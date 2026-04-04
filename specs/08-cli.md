# CLI Mode

## Overview

Brainkit has two modes of operation:

1. **Pi extension** (recommended) — full experience with typed tools, custom UI, system prompt injection, auto-commit, and event hooks
2. **CLI** — distributes skills to any AI agent via provider-specific directories. Works with Claude Code, GitHub Copilot, Cursor, Gemini CLI, OpenCode, Codex, Trae, Kiro, and more.

Both modes use the same `skills/` source files and `brainkit.toml` config. No duplication.

## What CLI users get vs pi users

| Capability                             | Pi extension       | CLI                           |
| -------------------------------------- | ------------------ | ----------------------------- |
| Skills (domain knowledge)              | yes                | yes (same files)              |
| PARA vault structure                   | yes                | yes                           |
| Bragfile, contacts, meeting notes      | yes                | yes (agent interprets skills) |
| Typed tools (deterministic formatting) | yes                | no                            |
| Custom UI (header, status bar, hints)  | yes                | no                            |
| System prompt injection                | yes                | no (AGENTS.md instead)        |
| Auto-commit                            | yes                | no                            |
| Auto-brag detection                    | yes                | no                            |
| Staleness reminders                    | yes                | no                            |
| Auto-update notifications              | yes                | no                            |
| Onboarding Q&A                         | yes (agent-guided) | yes (CLI prompts)             |

The core value (organized vault + agent that understands conventions) works in both modes. Pi adds programmatic reliability and polish on top.

## CLI design

### One command

```bash
npx brainkit
```

The CLI is context-aware:

- **No vault** → interactive setup: ask name, role, preferences, create vault, install skills, generate AGENTS.md
- **Vault exists** → update: reinstall skills to detected providers, regenerate AGENTS.md

No subcommands. No flags. Just `npx brainkit`.

Health checks are handled by the maintenance skill — the user asks their agent "check my vault" and the agent follows the skill instructions. No CLI doctor command needed.

### First run (no vault)

```
$ npx brainkit

  [brainkit] No vault found. Let's set one up.

  Where should your vault live? (default: ./brain)
  > ~/brain

  What's your name?
  > Ori

  What's your role?
  > Senior Backend Engineer

  Areas of expertise? (comma-separated)
  > distributed systems, API design

  Scope? (professional / personal / both)
  > both

  Preferred tone? (direct / casual / concise)
  > direct

  [brainkit] Created vault at ~/brain
  [brainkit] Created PARA directories
  [brainkit] Created bragfile and contacts
  [brainkit] Detected agents: claude-code, copilot, cursor
  [brainkit] Installed 7 skills to 3 providers
  [brainkit] Generated AGENTS.md
  [brainkit] Done. Open your agent in ~/brain to get started.
```

### Subsequent runs (vault exists)

```
$ npx brainkit

  [brainkit] Vault found: ~/brain
  [brainkit] Detected agents: claude-code, copilot, cursor, gemini
  [brainkit] Installed 7 skills to 4 providers
  [brainkit] Updated AGENTS.md
  [brainkit] Done.
```

### Skill installation

Skills are copied as-is from the brainkit package's `skills/` directory into provider-specific directories inside the vault. No transformation needed — the skills describe formats and conventions clearly enough that any agent can follow them, even without the pi-specific typed tools.

### Supported providers

| Provider       | Vault directory              | Detection                               |
| -------------- | ---------------------------- | --------------------------------------- |
| Claude Code    | `.claude/skills/brainkit/`   | `~/.claude/` exists or `claude` in PATH |
| GitHub Copilot | `.agents/skills/brainkit/`   | `~/.agents/` exists                     |
| Cursor         | `.cursor/skills/brainkit/`   | `~/.cursor/` exists                     |
| Gemini CLI     | `.gemini/skills/brainkit/`   | `gemini` in PATH                        |
| OpenCode       | `.opencode/skills/brainkit/` | `~/.opencode/` exists                   |
| Codex CLI      | `.codex/skills/brainkit/`    | `codex` in PATH                         |
| Trae           | `.trae/skills/brainkit/`     | `~/.trae/` exists                       |
| Kiro           | `.kiro/skills/brainkit/`     | `~/.kiro/` exists                       |

Skills are installed into the vault directory (not global), so each vault gets its own copy.

### AGENTS.md generation

The CLI generates an AGENTS.md in the vault root by compiling:

1. User identity from `brainkit.toml` (name, role, expertise, context)
2. Vault structure description (PARA)
3. Conventions (naming, formatting, bold usage)
4. Feature-specific sections (bragfile format, contacts format, meeting notes structure)
5. Custom rules from config

This is a static version of what `buildSystemPrompt` does dynamically in the pi extension. Written once, read by the agent from disk.

## Implementation

### Package structure

```
brainkit/
  package.json          # Add bin field for CLI
  cli/                  # CLI entry point
    index.ts            # Context-aware: init or update
    init.ts             # Interactive setup prompts
    install.ts          # Skill distribution + AGENTS.md generation
    providers.ts        # Provider detection and paths
  extensions/           # Unchanged — pi-specific
  skills/               # Unchanged — shared source
```

### Shared code

The CLI imports from `extensions/vault.ts` for:

- `PARA`, `KEY_FILES`
- `readVaultConfig`, `writeVaultConfig`

No duplication of vault logic.

### README changes

The Install section becomes two options, with pi as the recommended path:

```markdown
## Install

### With pi (recommended)

Full experience: typed tools, custom UI, system prompt injection, auto-commit.

pi install git:github.com/oribarilan/brainkit

### With any agent

Works with Claude Code, Copilot, Cursor, Gemini, and more.
Same vault and skills, without pi-specific extras.

npx brainkit
```

## Why no skill transformation?

The skills reference pi tools like `brain_add_brag` and `brain_query_contacts`. Non-pi agents don't have these tools, but the skills also describe the exact format, structure, and conventions. Any smart agent can read "use brain_add_brag to add entries in the format `- **YYYY-MM-DD**: description`" and understand what to do — it just uses its built-in file editing instead of a typed tool.

The trade-off: pi's typed tools guarantee correct formatting. Without them, the agent usually gets it right but occasionally misformats. This is acceptable for the CLI path.

## Why not a separate package?

The skills are the same files. One package with two entry points (pi extension + CLI) avoids duplication and keeps everything in sync.
