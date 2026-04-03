# CLI Specification

## Overview

Brainkit has a single command: `brainkit`. It runs an interactive TUI that handles both initial setup and subsequent feature management. There are no subcommands.

```bash
brainkit          # Run the interactive TUI
brainkit --help   # Show help
brainkit --version # Show version
```

## Behavior

### First run (no brainkit.toml found)

Full onboarding experience:

1. **Welcome screen** — Brief explanation of what brainkit does.
2. **Feature selection** — Show all available features with toggles. PARA structure is always enabled and not shown as a toggle. Recommended features are pre-selected.
3. **Personalization** — If any feature that contributes to AGENTS.md is enabled, ask:
   - Your name (text)
   - Your role (text, e.g., "Senior Backend Engineer")
   - Areas of expertise (text, comma-separated)
   - Vault scope (select: "professional only", "personal only", "both")
   - Preferred tone (select: "direct and technical", "casual and friendly", "concise and minimal")
   - Additional context (text, optional)
4. **Provider selection** — Which AI agent providers to generate config for. `.agents/` is always included.
5. **Summary** — Show what will be created, ask for confirmation.
6. **Install** — Write brainkit.toml, install skill files, generate AGENTS.md, create .gitignore.
7. **Next steps** — Tell the user to run `/doctor` in their AI agent to complete vault setup.

### Subsequent runs (brainkit.toml exists)

Update/feature management experience:

1. **Version check** — Compare installed brainkit version with config version.
   - If npm has a newer version: show notice "brainkit vX.Y.Z available — run `npm update -g brainkit`"
   - If installed version is newer than config version: show new features available since last run.
2. **Feature dashboard** — Show all features with current status (enabled/disabled/new).
   - Enabled features show a checkmark.
   - New features (added in versions after the user's last run) are highlighted.
   - User can toggle features on/off.
3. **Personalization review** — Option to update user info (name, role, etc.).
4. **Apply changes** — Update brainkit.toml, install/remove skill files, regenerate AGENTS.md.
5. **Next steps** — If new features were enabled that require setup, remind user to run `/doctor`.

> For routine config changes (adding rules, updating personalization, toggling features), users can also use the `/config` agent skill instead of re-running the CLI. The CLI remains the authoritative full-rebuild option.

## TUI Design

The TUI uses a polished interactive prompt library (like @clack/prompts) for a modern, delightful experience.

### Feature Selection Screen

```
  brainkit v1.0.0

  Select features for your second brain:

  PARA structure is always enabled.

  ◉ Bragfile             Running log of accomplishments
  ◉ Contacts Index       People lookup and cross-reference
  ◉ Meeting Notes        Process and file meeting notes
  ○ Self-Review          Draft self-reviews from bragfile + notes
  ○ Vault Health Check   Validate vault structure and conventions

  ↑/↓ to navigate, space to toggle, enter to confirm
```

### Personalization Screen

```
  Tell us about yourself (used to personalize AGENTS.md):

  ┌ Your name
  │ Ori Bar-ilan
  └

  ┌ Your role
  │ AI/ML Software Engineer
  └

  ┌ Areas of expertise (comma-separated)
  │ AI/ML, security, distributed-systems
  └

  ┌ Vault scope
  │ ● professional only  ○ personal only  ○ both
  └

  ┌ Preferred tone
  │ ● direct and technical  ○ casual and friendly  ○ concise and minimal
  └

  ┌ Additional context (optional)
  │ I use this brain to capture engineering decisions, meeting notes,
  │ and references for the systems I build.
  └
```

### Summary Screen

```
  Ready to set up your second brain!

  Foundation:
    ✓ PARA Structure (always enabled)

  Features:
    ✓ Bragfile
    ✓ Contacts Index
    ✓ Meeting Notes

  Files to create:
    brainkit.toml
    AGENTS.md
    .gitignore
    .agents/skills/brainkit/SKILL.md
    .agents/skills/brainkit-doctor/SKILL.md
    .agents/skills/brainkit-add-brag/SKILL.md
    .agents/skills/brainkit-process-notes/SKILL.md
    .agents/skills/brainkit-query-contacts/SKILL.md
    .claude/skills/brainkit/SKILL.md

  Proceed? (Y/n)
```

### Completion Screen

```
  ✓ brainkit.toml created
  ✓ AGENTS.md generated
  ✓ .gitignore created
  ✓ 5 skills installed

  Next steps:
    1. Open your AI agent (Copilot, Claude Code, Cursor, etc.)
    2. Run /doctor to initialize your vault structure
    3. Start capturing knowledge!

  Tip: Run `brainkit` again at any time to manage features.
```

## Non-Interactive Mode

For scripting and CI, brainkit supports a `--non-interactive` flag (future consideration). In this mode, it reads from brainkit.toml without prompting. This is not required for v1 but the architecture should not preclude it.

## Error Handling

| Scenario | Behavior |
|---|---|
| brainkit.toml exists but is invalid | Show parse error with line number, suggest fixing manually |
| brainkit.toml version newer than CLI | Error: "This vault was configured with brainkit vX.Y.Z but you have vA.B.C. Run `npm update -g brainkit`." |
| No write permission | Error with clear message |
| .gitignore already exists | Merge (append missing entries), don't overwrite |
| Skill directory already exists | Overwrite skill files (they're managed by brainkit) |
| User cancels (Ctrl+C) | Clean exit, no partial writes |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Config parse error |
