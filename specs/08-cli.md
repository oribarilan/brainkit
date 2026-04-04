# CLI Mode

## Overview

Brainkit has two modes of operation:

1. **Pi extension** (recommended) — full experience with typed tools, custom UI, system prompt injection, auto-commit, and event hooks
2. **CLI** — distributes skills to any AI agent via the Agent Skills standard. Works with Claude Code, GitHub Copilot, OpenCode, Codex, and any agent that supports `.agents/skills/` or `.claude/skills/`.

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
npx @oribish/brainkit
```

The CLI is CWD-based — it always operates on the current working directory. The CWD becomes the vault root. There is no vault path argument, no global vault registry, and no indirection. Users `cd` into the directory they want as their vault, then run the command.

Behavior is context-aware:

- **No `brainkit.toml` in CWD** → interactive setup: show CWD prominently, ask name, role, preferences, create vault structure, install skills, generate AGENTS.md
- **`brainkit.toml` found in CWD** → update: confirm with user, then reinstall skills and regenerate AGENTS.md

The CLI also supports `--version` and `--help` flags.

Health checks are handled by the maintenance skill — the user asks their agent "check my vault" and the agent follows the skill instructions. No CLI doctor command needed.

### First run (no `brainkit.toml` in CWD)

```
$ cd ~/brain && npx @oribish/brainkit

  [brainkit] Setting up a new vault in:
             ~/brain

  Continue here? (Y/n)
  > y

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

  Which coding agent(s) do you use? (comma-separated)
  1. GitHub Copilot
  2. OpenCode
  3. Codex
  4. Claude Code
  > 1, 4

  [brainkit] Created PARA directories
  [brainkit] Created bragfile and contacts
  [brainkit] Installed skills to .agents/skills/ and .claude/skills/
  [brainkit] Generated AGENTS.md
  [brainkit] Done. Open your agent in ~/brain to get started.
```

The agent choice is stored in `brainkit.toml` under `[agents]` so subsequent runs don't re-ask:

```toml
[agents]
providers = ["copilot", "claude-code"]
```

Note: CLI onboarding is intentionally thinner than pi's 5-phase agent-guided flow (which covers work context, personal life, communication preferences in detail). CLI captures the essentials; users who want richer onboarding should use the pi extension.

### Subsequent runs (`brainkit.toml` found in CWD)

```
$ npx @oribish/brainkit

  [brainkit] Vault found in current directory.
  [brainkit] This will overwrite installed skills and AGENTS.md.
             Vault content (notes, bragfile, contacts) is never modified.

  Continue? (Y/n)
  > y

  [brainkit] Installed skills to .agents/skills/ and .claude/skills/ (v0.2.0)
  [brainkit] Updated AGENTS.md
  [brainkit] Done.
```

The confirmation prevents accidental overwrites of customized AGENTS.md or skill files. Only metadata (skills, AGENTS.md, version markers) is touched — vault content is never modified by the CLI.

### Skill installation

Skills are installed into provider directories inside the vault, following the [Agent Skills standard](https://agentskills.io). The CLI maps harness choices to directories:

| Harness        | Directory                  |
| -------------- | -------------------------- |
| GitHub Copilot | `.agents/skills/brainkit/` |
| OpenCode       | `.agents/skills/brainkit/` |
| Codex          | `.agents/skills/brainkit/` |
| Claude Code    | `.claude/skills/brainkit/` |

Multiple harnesses can map to the same directory. The CLI deduplicates — if a user picks Copilot + OpenCode + Codex, skills are installed to `.agents/skills/brainkit/` once.

Priority when multiple directories are needed: `.agents/` > `.claude/`. This reflects the Agent Skills standard as the biggest common denominator — most harnesses read from `.agents/skills/`.

#### Skill format (Agent Skills standard)

Skills are installed following the [Agent Skills specification](https://agentskills.io/specification). The installed layout is a single skill directory with supporting files in `references/`:

```
.agents/skills/brainkit/
├── SKILL.md              # Required: root skill with YAML frontmatter
├── references/
│   ├── para.md           # PARA method reference
│   ├── bragfile.md       # Bragfile format and rules
│   ├── contacts.md       # Contacts format and rules
│   ├── meeting-notes.md  # Meeting notes conventions
│   ├── maintenance.md    # Vault health checks
│   └── onboarding.md     # First-run guidance
└── .brainkit-version     # Version marker (see below)
```

The root `SKILL.md` includes the required YAML frontmatter (`name`, `description`) and references supporting files via relative links so agents load them on demand, following the spec's progressive disclosure model.

```yaml
---
name: brainkit
description: >
  Personal second brain vault using the PARA method. Use when working with
  notes, bragfile entries, contacts, meeting notes, or vault organization.
---
```

The `name` field must match the parent directory name per the Agent Skills spec.

#### Source-to-install mapping

The source `skills/` directory uses one subdirectory per skill (for pi's skill loading). The CLI installer maps this to the Agent Skills layout:

| Source                          | Installed as                                          |
| ------------------------------- | ----------------------------------------------------- |
| `skills/brainkit/SKILL.md`      | `.agents/skills/brainkit/SKILL.md`                    |
| `skills/para/SKILL.md`          | `.agents/skills/brainkit/references/para.md`          |
| `skills/bragfile/SKILL.md`      | `.agents/skills/brainkit/references/bragfile.md`      |
| `skills/contacts/SKILL.md`      | `.agents/skills/brainkit/references/contacts.md`      |
| `skills/meeting-notes/SKILL.md` | `.agents/skills/brainkit/references/meeting-notes.md` |
| `skills/maintenance/SKILL.md`   | `.agents/skills/brainkit/references/maintenance.md`   |
| `skills/onboarding/SKILL.md`    | `.agents/skills/brainkit/references/onboarding.md`    |

The transformation is structural only — files are copied and placed into the `references/` layout. Content is not modified. The root `SKILL.md` needs relative links to `references/*.md` that the CLI installer adds during installation (the source file's `## Available tools` and setup sections are replaced with references to supporting files and action-oriented instructions for CLI agents).

#### Dual-format skills (action-oriented language)

Skills are written with action-oriented language that works for both pi and CLI agents (see Decision #23):

- **Do**: "Add a brag entry to `02_areas/career/bragfile.md` in the format `- **YYYY-MM-DD**: description`"
- **Don't**: "Use `brain_add_brag` to add entries"

Pi's typed tools are registered separately in `tools.ts` — they match the actions described in skills but are not referenced by skills. This means:

- CLI agents read the skill, understand the convention, and use built-in file editing.
- Pi agents read the same skill AND have typed tools available — the tools match what the skill describes, adding deterministic reliability.

All skills have been updated to use action-oriented language per Decision #23.

#### Why action-oriented?

Skills describe conventions and domain knowledge. Tools are a separate execution layer. When skills use action-oriented language, any capable agent can follow them regardless of available tooling. The trade-off: pi's typed tools guarantee correct formatting, while CLI agents usually get it right but occasionally misformat. This is acceptable for the CLI path.

#### Version marker

When installing skills, the CLI writes a `.brainkit-version` file alongside the skills:

```
.agents/skills/brainkit/.brainkit-version   → "0.2.0"
.claude/skills/brainkit/.brainkit-version   → "0.2.0"
```

On subsequent runs, the CLI compares versions and shows "Skills updated from 0.1.0 to 0.2.0" so users know something changed.

### AGENTS.md generation

The CLI generates an `AGENTS.md` in the vault root. This is read by all supported providers (Claude Code, Copilot, OpenCode, Codex all read `AGENTS.md` from the project root).

#### Reusing `buildSystemPrompt`

The existing `buildSystemPrompt` function in `extensions/system-prompt.ts` is already pi-agnostic (no pi imports, only Node.js builtins). ~80% of its output is shared between modes — identity, vault structure, conventions, custom rules, project context, staleness reminders. Only two sections are pi-specific:

- **Section 3** (key files): References `brain_add_brag`, `brain_query_contacts` tool names
- **Section 6** (behavioral rules): Says "Use the brain\_\* tools"

Rather than maintaining a separate CLI template that drifts, the function is refactored to accept a mode parameter:

```typescript
type PromptMode = "pi" | "cli";

export function buildSystemPrompt(
  config: BrainkitConfig,
  vaultPath: string,
  options?: { cwd?: string; mode?: PromptMode },
): string;
```

When `mode: "cli"`:

- Section 3 uses action-oriented language: "Add entries to `02_areas/career/bragfile.md`" instead of "Use the `brain_add_brag` tool"
- Section 6 becomes: "Use your built-in file editing to manage vault files. Follow the conventions and formats described in the installed skills."

The CLI calls `buildSystemPrompt(config, vaultPath, { mode: "cli" })` and writes the output as a static `AGENTS.md` file.

#### Generated content

The `AGENTS.md` compiles:

1. User identity from `brainkit.toml` (name, role, expertise, context)
2. Vault structure description (PARA method)
3. Key files with action-oriented instructions (mode-dependent)
4. Conventions (naming, formatting, bold usage, tone)
5. Custom rules from config
6. Behavioral rules (mode-dependent: CLI tells agents to use built-in file editing)
7. Project context (if detectable from CWD)
8. Staleness reminders (if bragfile is stale at generation time)

### .gitignore handling

Installed skill directories are generated files. On first install, the CLI appends the relevant directories to the vault's `.gitignore` (creating it if needed). For example, if the user chose Copilot + Claude Code:

```
# brainkit CLI — generated skill files
.agents/skills/brainkit/
.claude/skills/brainkit/
```

The `AGENTS.md` is NOT gitignored — it should be committed so collaborators' agents can read it too.

The CLI checks for existing `.gitignore` entries before appending to avoid duplicates on re-runs.

### Error handling

Deferred to implementation. Key edge cases to handle: malformed `brainkit.toml`, Ctrl+C during setup, permission errors during skill installation.

## Implementation

### Package structure

```
brainkit/
  package.json          # Add bin field + build script
  cli/                  # CLI entry point
    index.ts            # Context-aware: init or update
    init.ts             # Interactive setup prompts
    install.ts          # Skill distribution + AGENTS.md generation
  extensions/           # Unchanged — pi-specific
  skills/               # Unchanged — shared source
```

### Build strategy

The CLI is compiled to ESM JavaScript via the TypeScript compiler and published with a `bin` field:

```json
{
  "bin": {
    "brainkit": "./dist/cli/index.js"
  }
}
```

The `dist/cli/index.js` file starts with `#!/usr/bin/env node`. When users run `npx @oribish/brainkit`, npm downloads the package and executes the compiled CLI entry point. No additional runtime dependencies (tsx, jiti, esbuild) are needed.

Build is added to the justfile:

```bash
just build-cli    # tsc --project cli/tsconfig.json
```

The project `.gitignore` should also include `dist/` since it's a build artifact.

### Shared code

The CLI imports from `extensions/vault.ts` for:

- `PARA`, `KEY_FILES`
- `readVaultConfig`
- `BrainkitConfig` type

No duplication of vault logic. `vault.ts` has no pi-specific imports — it only depends on Node.js builtins and `smol-toml`.

`vault.ts` exports both `readVaultConfig` and `writeVaultConfig`. The `BrainkitConfig` interface includes the optional `agents` section with `providers`.

The CLI imports `buildSystemPrompt` from `extensions/system-prompt.ts` with `mode: 'cli'` to generate action-oriented AGENTS.md content.

### README changes

The Install section becomes two options, with pi as the recommended path:

```markdown
## Install

### With pi (recommended)

Full experience: typed tools, custom UI, system prompt injection, auto-commit.

pi install git:github.com/oribarilan/brainkit

### With any agent (experimental)

Works with Claude Code, Copilot, OpenCode, Codex, and more.
Same vault and skills, without pi-specific extras.

> **Note**: CLI mode is in early development. The core experience works well,
> but some features (auto-commit, staleness reminders, auto-brag detection)
> are only available in the pi extension.

npx @oribish/brainkit
```

## Why not a separate package?

The skills are the same files. One package with two entry points (pi extension + CLI) avoids duplication and keeps everything in sync.
