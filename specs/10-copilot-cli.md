# Copilot CLI harness

## Overview

Add GitHub Copilot CLI as a second harness alongside OpenCode. The brainkit CLI launcher gains a `copilot` entry in its harness registry. Users run `brainkit copilot` (or `brainkit cp`) to get a brainkit-infused Copilot experience. Running `copilot` directly remains vanilla — brainkit files live in the vault, not in `~/.copilot/`.

The integration uses skills + hooks. No MCP server, no custom typed tools. The agent uses Copilot's built-in file tools guided by brainkit skills, same as OpenCode.

## Isolation model

Brainkit installs all its files into the vault directory, not into `~/.copilot/`. Copilot discovers them because the launcher sets CWD to the vault path when spawning.

- `brainkit copilot` → CWD = vault, Copilot reads `.agents/skills/brainkit/`, `.github/hooks/`, `AGENTS.md`, `.github/copilot/settings.json` → infused experience
- `copilot` from any other directory → no brainkit files → vanilla
- `copilot` from inside the vault → picks up brainkit files naturally, which is correct

The user's `~/.copilot/` (auth tokens, model preferences, personal config) is never touched.

## Launcher

A new `copilot` entry in the `HARNESSES` array in `cli/launch.ts`:

```typescript
{
  name: "Copilot CLI",
  binaries: ["copilot"],
  aliases: ["copilot", "cp"],
  launch: launchCopilot,
}
```

The `launchCopilot` function:

1. Read global config (`~/.config/brainkit/config.toml`) to get vault path
2. Read vault config (`brainkit.toml`) from the vault using `readVaultConfigSimple()` (matches OpenCode's precedent — migration warnings are not surfaced in the launcher)
3. Install skills to `<vault>/.agents/skills/brainkit/`
4. Generate `AGENTS.md` at vault root
5. Install hooks to `<vault>/.github/hooks/`
6. Write Copilot settings to `<vault>/.github/copilot/settings.json`
7. Update `<vault>/.gitignore` with generated file entries
8. Spawn `copilot` with CWD = vault path, forwarding remaining args

If no vault is configured (no global config or missing vault path), the launcher should print a message telling the user to run `brainkit opencode` first to set up a vault, then exit. Vault setup is agent-guided and only works inside a harness session — the launcher can't do it.

Detection priority when both harnesses are installed: the existing `detectAndLaunch` behavior lists available harnesses and lets the user pick. No automatic preference.

## Skill installation

Skills are copied from the npm package's `skills/` directory into the vault following the Agent Skills standard:

```
<vault>/.agents/skills/brainkit/
├── SKILL.md                    # Root skill (from skills/brainkit/SKILL.md)
├── references/
│   ├── para.md                 # From skills/para/SKILL.md
│   ├── bragfile.md             # From skills/bragfile/SKILL.md
│   ├── contacts.md             # From skills/contacts/SKILL.md
│   ├── meeting-notes.md        # From skills/meeting-notes/SKILL.md
│   ├── maintenance.md          # From skills/maintenance/SKILL.md
│   └── onboarding.md           # From skills/onboarding/SKILL.md
└── .brainkit-version           # Version marker
```

### Root SKILL.md transformation

The root `SKILL.md` gets YAML frontmatter added and its content adapted for the Agent Skills format:

```yaml
---
name: brainkit
description: >
  Personal second brain vault using the PARA method. Use when working with
  notes, bragfile entries, contacts, meeting notes, or vault organization.
---
```

Relative links to `references/*.md` are added so agents load sub-skills on demand. The transformed root skill should include a reference list like:

```markdown
## Reference skills

- [PARA method](references/para.md) — vault organization
- [Bragfile](references/bragfile.md) — accomplishment tracking
- [Contacts](references/contacts.md) — people index
- [Meeting notes](references/meeting-notes.md) — structured notes
- [Maintenance](references/maintenance.md) — vault health
- [Onboarding](references/onboarding.md) — first-run guidance
```

### Sub-skill transformation

Sub-skills (`skills/para/SKILL.md`, `skills/bragfile/SKILL.md`, etc.) are copied into `references/` with their YAML frontmatter stripped. They become reference documents, not standalone skills.

### Version marker

A `.brainkit-version` file is written containing the current package version. On subsequent runs, the launcher compares this against the package version and reinstalls skills if different. If versions match, skills are not reinstalled (avoids unnecessary file writes).

### Source resolution

The skills source directory is resolved relative to the npm package root. Since `skills/` is listed in the `files` field in `package.json`, it's available on disk after `npm install` or `npx`. The launcher resolves the package root by walking up from `__dirname` to find the nearest `package.json` with `name: "@2brain/brainkit"`.

## AGENTS.md generation

The launcher calls `buildSystemPrompt(config, vaultPath, { mode: "cli" })` and writes the output to `<vault>/AGENTS.md`.

Content is identical to what OpenCode's system prompt injection produces: user identity, PARA structure, key files with action-oriented instructions, conventions, custom rules, behavioral rules, staleness reminders, onboarding nudge, and profile nudge.

The AGENTS.md is regenerated on every `brainkit copilot` launch to pick up fresh staleness data and any config changes. It is not gitignored — it should be committed so any agent working in the vault can read it.

The `cwd` option is not passed to `buildSystemPrompt` since CWD is the vault root (project detection compares `path.basename(cwd)` against `01_projects/` entries, and the vault root won't match). Project context activates naturally if the user navigates into a project subdirectory during the session.

## Hooks

The launcher writes `<vault>/.github/hooks/hooks.json` and a companion shell script:

```
<vault>/.github/hooks/
├── hooks.json
└── scripts/
    └── auto-commit.sh
```

### hooks.json

```json
{
  "hooks": [
    {
      "event": "agentStop",
      "command": ".github/hooks/scripts/auto-commit.sh",
      "description": "Auto-commit vault changes after agent turns"
    },
    {
      "event": "sessionEnd",
      "command": ".github/hooks/scripts/auto-commit.sh",
      "description": "Commit any remaining vault changes on session end"
    }
  ]
}
```

### auto-commit.sh

```bash
#!/usr/bin/env bash
# Only commit if this is a git repo with uncommitted changes
git rev-parse --git-dir > /dev/null 2>&1 || exit 0
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0
git add -A 2>/dev/null || exit 0
git commit -m "brainkit: auto-save $(date +%Y-%m-%d)" > /dev/null 2>&1 || true
```

No debouncing — each `agentStop` triggers a commit attempt. The script is idempotent (skips if no changes). This is simpler than OpenCode's in-process timer and arguably better: every agent turn that changes files gets committed, and `sessionEnd` catches stragglers.

### What's not hooked

No `sessionStart` hook for context injection — the static AGENTS.md handles that.

No brag detection hook — Copilot hooks don't expose message content. The bragfile skill guides the agent to offer capture when accomplishments come up in conversation. This is a scoped gap: the skill-guided approach works but is less reliable than OpenCode's programmatic scanning.

## Visual touches

### companyAnnouncements

Written to `<vault>/.github/copilot/settings.json`:

```json
{
  "companyAnnouncements": [
    "mention an accomplishment and I'll offer to capture it",
    "I can create meeting notes from any conversation",
    "ask me about your vault stats",
    "I can search your vault for anything",
    "I organize using the PARA method",
    "I'll remind you if your bragfile gets stale",
    "ask me to check vault health"
  ]
}
```

Copilot picks one randomly at startup. Not as rich as OpenCode's 8-second rotating tips, but it's the only mechanism available.

### statusLine

A Node script that reads vault state and prints a one-liner for Copilot's footer bar. Added to the same settings.json:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node <resolved-path>/scripts/copilot-status.js"
  }
}
```

The script imports from `@2brain/brainkit-core` and prints something like:

```
🧠 Ori's vault · 12 brags · last: 3d ago · 8 contacts
```

With staleness color coding where the terminal supports it (green/yellow/red based on days since last brag entry, same thresholds as the OpenCode sidebar: green ≤7d, yellow ≤14d, red >14d).

The script path is resolved at install time to point at the actual location within the npm package or global install. Note: the `statusLine` config format (`{ "type": "command", "command": "..." }`) should be verified against Copilot CLI docs early in implementation — it's the least-documented part of this spec. If the format differs, the fix is cosmetic, not architectural.

## .gitignore handling

The launcher appends entries to `<vault>/.gitignore` (creating it if needed):

```
# brainkit — generated files
.agents/skills/brainkit/
.github/hooks/
.github/copilot/
```

`AGENTS.md` is intentionally not gitignored — it should be committed.

The launcher checks for existing entries before appending to avoid duplicates on re-runs. It looks for each exact line in the existing content; if found, it's skipped.

## Scoped gaps

Three capabilities have no Copilot CLI equivalent. Each is documented in the relevant feature doc.

### Auto-brag detection

OpenCode scans user messages for accomplishment keywords at `session.idle` and shows a toast. Copilot hooks don't expose message content and don't have a toast API. The bragfile skill instructs the agent to offer capture when accomplishments come up, which is less reliable but functional.

### Compaction resilience

OpenCode injects condensed vault identity during context compaction via `experimental.session.compacting`. Copilot has no compaction hook. If Copilot compacts context, vault awareness may degrade. The AGENTS.md file remains on disk and Copilot may re-read it, but this behavior is undocumented.

### Dynamic system prompt

OpenCode rebuilds the system prompt every turn, so staleness reminders, onboarding nudges, and profile nudges reflect the current vault state. Copilot reads AGENTS.md once (at launch or when the file changes). If the user adds their first brag entry mid-session, the staleness reminder in AGENTS.md won't disappear until the next launch. In practice this rarely matters — staleness doesn't change within a session, and onboarding is a one-time flow.

## Feature doc updates

Each `docs/<feature>.md` gets a Copilot CLI column in its harness implementation table:

| Feature                       | Copilot CLI implementation                                               |
| ----------------------------- | ------------------------------------------------------------------------ |
| **PARA** (structure, filing)  | Skills in `.agents/skills/brainkit/` + AGENTS.md in vault root           |
| **PARA** (project detection)  | Not at launch; works if user navigates into a project subdir             |
| **Bragfile** (entries)        | Skills guide agent to use built-in file editing                          |
| **Bragfile** (staleness)      | Static in AGENTS.md, refreshed at launch                                 |
| **Bragfile** (auto-detection) | Not supported — skill-guided fallback                                    |
| **Bragfile** (stats)          | `statusLine` script shows brag count + staleness in footer               |
| **Contacts** (all ops)        | Skills guide agent to use built-in file editing                          |
| **Contacts** (count)          | `statusLine` script shows contact count in footer                        |
| **Meeting notes**             | Skills guide agent; AGENTS.md provides conventions                       |
| **Doctor**                    | User asks "check my vault" — maintenance skill guides agent              |
| **Onboarding**                | Static "Fresh Vault Detected" in AGENTS.md if vault is fresh at launch   |
| **Auto-commit**               | `agentStop` + `sessionEnd` hooks run `auto-commit.sh`                    |
| **Compaction**                | Not supported — no equivalent hook                                       |
| **TUI**                       | Not applicable — `companyAnnouncements` for tips, `statusLine` for stats |

## Implementation scope

New files:

- `cli/copilot.ts` — Copilot launcher (skill installation, AGENTS.md generation, hooks, config, spawn)
- `cli/install-skills.ts` — shared skill installation logic (usable by future harnesses too)
- `scripts/copilot-status.js` — statusLine script for Copilot footer
- `scripts/auto-commit.sh` — hook script for git auto-commit

Modified files:

- `cli/launch.ts` — add Copilot to `HARNESSES` array
- `cli/index.ts` — update help text with `copilot`/`cp` aliases
- `docs/*.md` — add Copilot CLI column to all 8 harness implementation tables
- `docs/features.md` — mention Copilot CLI support
- `README.md` — add Copilot CLI to install section
- `package.json` — add `scripts/` to `files` field if not already included

No changes to `core/` or `opencode/` — the Copilot integration is purely additive and uses existing core functions.
