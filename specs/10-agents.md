# Librarian sub-agent

## Overview

Brainkit registers one sub-agent for OpenCode: the Librarian. It handles vault-scoped search so the primary agent can delegate "find X in my vault" queries without loading everything into its own context. No user configuration needed — if a vault exists, the Librarian is available.

Copilot CLI and Claude Code don't support custom sub-agent registration, so this is OpenCode-only.

## How it works

Two pieces, wired independently:

1. **Agent file** — the CLI launcher writes `~/.config/brainkit/agents/librarian.md` at launch time. OpenCode discovers it via `OPENCODE_CONFIG_DIR` (which brainkit already sets to `~/.config/brainkit/`). The file contains YAML frontmatter (mode, permissions) and the agent's system prompt.

2. **Delegation instructions** — the server plugin injects a "Vault Search Delegation" section into the primary agent's system prompt via `system.transform`. This tells the primary agent that a Librarian exists, when to delegate, and the invocation syntax.

## Librarian

Read-only search specialist scoped to the vault directory. Hidden from `@` autocomplete but invocable by the primary agent via the Task tool.

**Permissions:**
- `edit: deny` — can't modify files
- `bash` — deny-all with an allowlist: `cat`, `grep`, `find`, `ls`, `head`, `tail`, `wc`
- `task: deny` — can't delegate further
- `external_directory` — deny-all except `{vaultPath}/**`

**Prompt composition** (via `buildLibrarianAgentFile` in `core/librarian-agent.ts`):
- Librarian role and search instructions (inline)
- Brainkit preamble (vault path)
- PARA vault structure
- Key files (conditional on feature flags)

The prompt is intentionally minimal — just enough to navigate and search the vault. No identity, conventions, or behavioral rules.

## Delegation

The primary agent gets a delegation section appended to its system prompt (via `buildDelegation` in `core/prompt-sections.ts`). It covers:

**When to delegate:** multi-file searches, finding specific notes/contacts/brags, keeping the primary context clean.

**When not to:** known file paths, single-file reads, write operations.

**Invocation:** `task(subagent_type="librarian", prompt="<search query>")`

The Librarian returns a summary of findings, not raw file contents. The primary agent uses that summary to answer the user or take action.

## Implementation

| File | Role |
|------|------|
| `core/librarian-agent.ts` | `buildLibrarianAgentFile(config, vaultPath)` — builds the complete `librarian.md` content (YAML frontmatter + prompt body) |
| `core/prompt-sections.ts` | `buildDelegation()` — static delegation instructions for the primary agent |
| `cli/launch.ts` | `ensureOpenCodeConfig` writes `agents/librarian.md` to the config dir when a vault exists |
| `opencode/server.ts` | `system.transform` hook appends delegation section to the system prompt |

The launcher reads vault config at launch to build the agent prompt. If the vault or config is missing, it skips the agent file gracefully — OpenCode launches without a Librarian, and the primary agent doesn't get delegation instructions (since the delegation section only appears when a vault is found).

## Why a markdown file, not a config hook

OpenCode's plugin API doesn't expose a `config` hook for agent registration. Agents are defined via JSON config or markdown files. The markdown approach is idiomatic (matches how OpenCode users define custom agents), inspectable (`cat ~/.config/brainkit/agents/librarian.md`), and keeps the permission structure readable in YAML rather than JSON-escaped strings.
