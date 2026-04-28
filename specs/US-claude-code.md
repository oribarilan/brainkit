# US-claude-code — Claude Code CLI Integration

Status: Approved design (post-review revision), ready for implementation
Date: 2026-04-28 (revised same day after oracle + opencode-comparison review)

## Goal

Add Claude Code (the `claude` binary) as a third supported harness, alongside OpenCode and Copilot CLI. Achieve full feature parity where Claude Code's extensibility model allows, and explicitly document gaps where it does not.

## Why This Approach

Claude Code's extensibility model is closer to OpenCode's than to Copilot's:

- **Real plugin system** — `.claude-plugin/plugin.json` with native skills, agents, hooks, MCP, and themes loadable from a directory via `--plugin-dir`.
- **Config isolation via env var** — `CLAUDE_CONFIG_DIR` redirects all settings, credentials, plugins, and project history. This is the direct analog of `OPENCODE_CONFIG` and is the mechanism that satisfies brainkit's harness-isolation rule (AGENTS.md).
- **Native skills format** — `skills/<name>/SKILL.md` with YAML frontmatter, exactly the shape brainkit already authors.

We adopt the OpenCode template (real plugin + env-var-redirected config dir) instead of the Copilot template (vault-scoped files). The vault stays clean. The user's `~/.claude/` stays untouched.

## Definition of Done (story-level)

- [ ] `brainkit claude` and `brainkit cc` launch Claude Code with the brainkit plugin loaded and brainkit's system prompt active
- [ ] Bare `brainkit` auto-detects `claude` alongside `opencode` and `copilot`
- [ ] The user's `~/.claude/` directory is never read or written; all brainkit-side config lives under `~/.config/brainkit/claude/`. Verified by an automated test.
- [ ] All seven existing skills (`brainkit`, `para`, `bragfile`, `contacts`, `meeting-notes`, `maintenance`, `onboarding`) are available to the agent inside Claude Code with content matching the canonical `skills/` directory
- [ ] `/brainkit:doctor` slash command runs vault health checks
- [ ] Brainkit-branded theme is active by default (within Claude's limited theme schema — brand color + status colors only); statusline shows live vault stats (vault name, brag count + staleness, contact count)
- [ ] `SessionEnd` hook auto-commits vault changes to git
- [ ] `PreCompact` hook injects vault identity into the compaction summary so the agent doesn't drift after auto-summary (mirrors OpenCode's `experimental.session.compacting`)
- [ ] First-time users (no global config) get the onboarding flow via a brainkit-owned workspace under `~/.config/brainkit/onboarding/`
- [ ] Brainkit pins a minimum supported Claude Code version in `core/harness-version.ts`; older versions trigger a warning at launch
- [ ] Auth/credential re-prompt behavior is documented for users (they will need to authenticate Claude Code separately under `CLAUDE_CONFIG_DIR`)
- [ ] Uninstall path is documented (`rm -rf ~/.config/brainkit/claude/` removes all brainkit-side state for Claude)
- [ ] `just check` passes (lint + typecheck + format + tests)
- [ ] CI's `test-windows` job passes — paths and spawn behavior work cross-platform
- [ ] Documentation updated: `AGENTS.md` mentions the new harness; `README.md` lists `brainkit claude` as a supported invocation

## Architecture Overview

```
brainkit/
├── claude/                                   NEW — Claude Code plugin TEMPLATE (read-only at runtime)
│   ├── .claude-plugin/plugin.json
│   ├── skills/
│   │   └── doctor/SKILL.md                   hand-authored, /brainkit:doctor (user-invocable)
│   ├── hooks/hooks.json                      SessionEnd + PreCompact
│   ├── scripts/
│   │   ├── auto-commit.mjs                   SessionEnd → git auto-commit
│   │   ├── precompact.mjs                    PreCompact → vault identity into summary
│   │   └── statusline.mjs                    vault stats statusline
│   └── (no themes/ — theme is launcher-written into CLAUDE_CONFIG_DIR; see runtime layout)
├── cli/
│   ├── claude.ts                             NEW — analog of cli/copilot.ts
│   ├── launch.ts                             register claude harness
│   └── index.ts                              register aliases: claude, cc
├── core/
│   ├── onboarding-prompt.ts                  add "claude" mode
│   ├── skill-installer.ts                    NEW — extracted shared skill installer
│   └── harness-version.ts                    add Claude entry
└── package.json                              add claude/ to "files"
```

**Runtime layout** (created/managed by `cli/claude.ts`):

```
~/.config/brainkit/claude/                   CLAUDE_CONFIG_DIR
├── settings.json                            theme + statusLine + companyAnnouncements (regenerated each launch)
├── system-prompt.txt                        buildSystemPrompt() output (regenerated each launch)
├── themes/
│   └── brainkit.json                        launcher-written user theme (referenced by settings.json `theme`)
├── plugin/                                  STAGING COPY of the plugin (writable)
│   ├── .claude-plugin/plugin.json           copied from <pkgRoot>/claude
│   ├── skills/
│   │   ├── doctor/SKILL.md                  copied from template
│   │   ├── brainkit/SKILL.md                generated from canonical skills/
│   │   ├── para/SKILL.md                    generated
│   │   ├── bragfile/SKILL.md                generated
│   │   ├── contacts/SKILL.md                generated
│   │   ├── meeting-notes/SKILL.md           generated
│   │   ├── maintenance/SKILL.md             generated
│   │   └── onboarding/SKILL.md              generated
│   ├── hooks/hooks.json                     copied from template
│   ├── scripts/*.mjs                        copied from template (with +x bit)
│   └── .brainkit-version                    skip-marker for fast no-op on repeat launches
└── onboarding/                              ONLY when no vault yet
    └── CLAUDE.md                            buildOnboardingPrompt("claude")
```

`~/.config/brainkit/onboarding/` (shared with Copilot — Claude writes `CLAUDE.md`, Copilot writes `AGENTS.md`, no filename conflict).

## Component Specifications

### CLI surface

```
brainkit                  → auto-detect (now scans for opencode | copilot | claude)
brainkit claude [args]    → explicit Claude Code
brainkit cc [args]        → short alias
```

Registers in the `HARNESSES` array in `cli/launch.ts`:

```ts
{ name: "Claude Code", binaries: ["claude"], aliases: ["claude", "cc"], launch: launchClaude }
```

### Config isolation + plugin staging (the critical change vs. v1 plan)

Brainkit's Claude config dir: **`~/.config/brainkit/claude/`**.

The launcher spawns `claude` with `CLAUDE_CONFIG_DIR=<that dir>` set. Claude Code redirects `settings.json`, `credentials.json`, `agents/`, `skills/`, `commands/`, `plugins/`, `projects/`, and `CLAUDE.md` into that directory.

**Plugin staging:** the `claude/` directory in the npm package is treated as a **read-only template**. On every launch, the launcher:

1. Ensures `~/.config/brainkit/claude/plugin/` exists.
2. Compares `.brainkit-version` in the staging dir against the installed package version. If unchanged, skip steps 3–4 (fast path).
3. Copies the entire `<pkgRoot>/claude/` tree into the staging dir.
4. Generates skills from canonical `skills/` into the staging dir's `skills/` (overlays on top of the hand-authored `skills/doctor/` from the template — no whitelist needed, both copy cleanly).
5. Writes `.brainkit-version` marker.
6. Writes (always regenerated) `~/.config/brainkit/claude/{settings.json,system-prompt.txt}`.

This eliminates the showstopper risk of writing into `node_modules` (read-only on pnpm, owned by root on `sudo npm i -g`, wiped on every reinstall).

Spawn command:

```bash
CLAUDE_CONFIG_DIR=~/.config/brainkit/claude \
BRAINKIT_VAULT_PATH=<vault> \
  claude \
    --plugin-dir ~/.config/brainkit/claude/plugin \
    --append-system-prompt-file ~/.config/brainkit/claude/system-prompt.txt
```

Notes vs. v1:

- **`cwd: vaultPath`** (mirrors Copilot's `copilot.ts:219`) — Claude treats the vault as the project, creating one stable `$CLAUDE_CONFIG_DIR/projects/<vault-hash>/` entry instead of scattering entries based on whatever shell pwd the user happened to be in.
- **`--add-dir <vault>` is dropped.** Redundant when `cwd: vaultPath`.
- **`--plugin-dir` points at the staging copy**, not `<pkgRoot>/claude`.

### The plugin (`claude/` template)

**`.claude-plugin/plugin.json`** — standard manifest: `name: "brainkit"`, version pulled from `package.json` at build/publish time, description, repo, license.

**`skills/doctor/SKILL.md`** — hand-authored, lives in the template (committed to repo). Frontmatter:

```yaml
---
name: doctor
description: Diagnose vault health and configuration
disable-model-invocation: true
user-invocable: true
---
```

Body matches OpenCode's `/doctor` invocation in `opencode/tui.tsx:108-118`. Becomes `/brainkit:doctor` once plugin is enabled.

**Other skills** are generated at launch from canonical `skills/` via `core/skill-installer.ts` (extracted from `cli/install-skills.ts`). One standalone Claude skill per source skill — Claude auto-invokes by description, no manual reference linking required (cleaner than Copilot's pattern). Each generated skill gets Claude-native frontmatter:

```yaml
---
name: brainkit
description: Brainkit core conventions and setup flow
disable-model-invocation: false
---
```

**`hooks/hooks.json`:**

```json
{
  "hooks": {
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/auto-commit.mjs" }] }],
    "PreCompact": [{ "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/scripts/precompact.mjs" }] }]
  }
}
```

**No `SessionStart` hook in v1** — `--append-system-prompt-file` is regenerated on each launch (each `claude` spawn is a fresh process, no daemon mode), so there is no actual staleness gap to close. Adding a SessionStart hook would duplicate the same vault data already in the system prompt for marginal benefit. Defer until a real signal exists that needs per-session refresh distinct from per-launch.

**`scripts/auto-commit.mjs`** — equivalent to Copilot's `auto-commit.js`. `git add -A && git commit -m "brainkit: auto-save <ISO date>"` in the vault dir, no-op if no changes. Silent failure if git is missing or vault isn't a repo.

**`scripts/precompact.mjs`** — mirrors `opencode/server.ts:61-86`. Reads `BRAINKIT_VAULT_PATH`, prints a short markdown block (user, vault name, path, features, tone) to stdout. This becomes part of the compaction summary so the agent retains brainkit identity after auto-summary. Trivial (~10 lines).

**`scripts/statusline.mjs`** — reads JSON from stdin (Claude session info), reads vault stats from `BRAINKIT_VAULT_PATH`, prints single-line: `🧠 <vault> | <bragCount> brags (<staleness>) | <contactCount> contacts`. ANSI colors for staleness (green ≤7d / yellow ≤14d / red, matching `opencode/side.tsx`'s thresholds and `scripts/copilot-status.js`'s coloring). Statusline staleness helper extracted to `core/` so OpenCode sidebar, Copilot status, and Claude statusline all share the same logic.

All scripts reuse `core/vault.ts` — no business logic in scripts.

**No `themes/` in the plugin (v1).** Smoke test confirmed Claude Code's plugin theme registration path (`theme: "custom:<plugin>:<slug>"` in settings, plugin-shipped `themes/<slug>.json`) does not auto-apply via launcher-written settings and is more complex than the user-themes path. Instead, the launcher writes the theme JSON directly to `$CLAUDE_CONFIG_DIR/themes/brainkit.json` and sets `theme: "brainkit"` in `$CLAUDE_CONFIG_DIR/settings.json` — this auto-applies on launch and decouples theme from plugin lifecycle. See § Launcher-written user settings.

**Brand-able tokens are limited.** Smoke test confirmed `claude` token works (table borders, headers, accents). Background/text tokens (`background`, `bg`, `surface`, `panel`, `text`, etc.) do NOT paint terminal background or default text color — Claude Code respects host terminal colors. Brand comes through via accent + status (`success`/`error`) + diff + syntax tokens only.

**No `settings.json` in the plugin.** Per Claude Code docs, only `agent` and `subagentStatusLine` plugin settings are honored. Anything else (theme, statusLine command, companyAnnouncements) goes in the launcher-written user `settings.json`. Putting them in the plugin would be dead config.

### Launcher-written user settings (`~/.config/brainkit/claude/settings.json`)

Regenerated on each launch:

```json
{
  "theme": "brainkit",
  "statusLine": {
    "type": "command",
    "command": "${CLAUDE_PLUGIN_ROOT}/scripts/statusline.mjs",
    "padding": 2
  },
  "companyAnnouncements": ["<single, well-chosen tip — Claude only ever shows entry 0>"],
  "enabledPlugins": { "brainkit": true }
}
```

`theme: "brainkit"` references `$CLAUDE_CONFIG_DIR/themes/brainkit.json`, which the launcher also writes (the brainkit theme JSON itself). Format confirmed: bare `"brainkit": true`. Single-entry `companyAnnouncements` confirmed (Claude always displays entry 0).

### System prompt strategy

**Single layer:** `--append-system-prompt-file ~/.config/brainkit/claude/system-prompt.txt`. Launcher writes that file from `buildSystemPrompt(config, vaultPath, { mode: "cli" })` on each launch. Fresh per spawn. Same content as OpenCode's `experimental.chat.system.transform` and Copilot's `AGENTS.md`. No SessionStart hook (see hooks section).

`PromptMode` stays `"cli"` — confirmed there's no per-harness mode in `core/system-prompt.ts`. Claude reuses the existing CLI mode.

### UI parity (honest about limits)

| OpenCode                               | Claude Code                                               | Status                                                                       |
| -------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `brainkit` theme (~50 tokens)          | user theme at `$CLAUDE_CONFIG_DIR/themes/brainkit.json`   | Accent + status + diff + syntax only; bg/text host-controlled                |
| Sidebar with vault stats               | Statusline with vault stats                               | Functional parity (one line vs panel)                                        |
| Brain ASCII home logo                  | none available                                            | Skipped — no slot exists                                                     |
| Custom prompt placeholders / hints     | none available                                            | Skipped — no slot exists                                                     |
| Rotating tips at home (9, 8s rotation) | `companyAnnouncements` (single entry confirmed)           | Degraded — Claude always shows entry 0; ship one well-chosen tip             |
| `/doctor` slash command                | `/brainkit:doctor` skill                                  | Full parity                                                                  |
| Accomplishment toast                   | UserPromptSubmit hook (deferred)                          | Deferred — re-evaluate after smoke test confirms whether stdout reaches user |
| Auto-commit                            | `SessionEnd` hook                                         | End-of-session only, vs OpenCode's debounced in-session (Copilot pattern)    |
| Compaction identity                    | `PreCompact` hook                                         | Full parity                                                                  |

### Onboarding

When `selectVault()` returns undefined (no vault yet):

1. Launcher creates `~/.config/brainkit/onboarding/` workspace (shared with Copilot — different filenames avoid conflict; concurrent-onboarding race accepted as known limitation).
2. Writes `~/.config/brainkit/onboarding/CLAUDE.md` with `buildOnboardingPrompt("claude")`.
3. Spawns `claude` from that cwd with `--prompt "Let's set up my first brainkit vault!"`.
4. Cleans up the onboarding workspace on next successful (vault-found) launch (same pattern as Copilot — `cleanupOnboardingWorkspace`).

Adds a `"claude"` mode to `core/onboarding-prompt.ts` with closing instruction "When done, exit and re-run `brainkit claude` from your terminal."

This diverges from OpenCode's pattern (which swaps system prompt mid-session via the `experimental.chat.system.transform` hook). Claude has no per-turn system-prompt swap mechanism — `--append-system-prompt-file` is set at launch and not changeable from inside a session — so we use the Copilot workspace pattern instead.

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.claude/`. All brainkit state goes under `~/.config/brainkit/claude/` via `CLAUDE_CONFIG_DIR`. Verified by an automated test.
- **Plugin staging is required:** `<pkgRoot>/claude/` is read-only at runtime. All writes go into `~/.config/brainkit/claude/plugin/`. Never write into `node_modules`.
- **Auth re-prompt:** users running `brainkit claude` for the first time will be prompted to authenticate Claude Code, even if they're already authenticated globally. Document this. Do NOT auto-copy `~/.claude/credentials.json` (that would violate isolation).
- **No new runtime dependencies.** Plugin scripts are plain Node ESM importing from `core/`.
- **Cross-platform paths.** Use `node:path` and `node:os` everywhere. Hook scripts need a `#!/usr/bin/env node` shebang and an executable bit on Unix (set on copy into staging). Windows invocation behavior verified during smoke test and Windows CI.
- **Script extension:** use `.mjs` (Node ESM).
- **Skill installer reuse:** extract the existing `installSkills()` from `cli/install-skills.ts` into `core/skill-installer.ts` with a per-target options object. Both Copilot and Claude consume it. Existing Copilot tests must keep passing unchanged.
- **Statusline staleness logic:** extract to `core/` so OpenCode sidebar, Copilot status, and Claude statusline share one implementation. Avoids drift in thresholds/colors.
- **Disclosed disk usage:** Claude Code auto-fetches the official Anthropic plugin marketplace (~4.4 MB) into `$CLAUDE_CONFIG_DIR/plugins/marketplaces/claude-plugins-official/` on first launch. Network call required on first launch with a fresh `CLAUDE_CONFIG_DIR`. Not an isolation violation (stays inside our isolated dir). Document in user-facing README.
- **Verify before plumbing.** Smoke-test resolved all seven design unknowns against Claude Code 2.1.109. See § Smoke Test Findings below.

## Smoke Test Findings (Claude Code 2.1.109)

1. **`--plugin-dir` from staged config-dir copy** — ✅ PASS. Plugin loads correctly, staged plugin tree is byte-identical after session, `~/.claude/` untouched. **One discovery:** Claude auto-fetches the official Anthropic marketplace into `$CLAUDE_CONFIG_DIR/plugins/marketplaces/claude-plugins-official/` on first launch (~4.4 MB, network call required). Not an isolation violation (stays inside our isolated dir). Should be disclosed in user docs.
2. **`enabledPlugins` exact key format** — Bare `"brainkit": true` works. The `@<suffix>` form (e.g. `"brainkit@local"`, `"brainkit@brainkit"`) is interpreted as a marketplace reference and FAILS to load when no such marketplace exists. `--plugin-dir`-loaded plugins appear under their bare name as "inline" plugins. Original assumption (`brainkit@local`) was wrong; design now uses bare name.
3. **Theme registration via launcher-written settings** — Plugin themes path (`plugin/themes/<slug>.json` + `theme: "<slug>"`) does NOT work. The plugin theme is not registered, not even visible in `/theme`. **Working path:** write the theme directly into `$CLAUDE_CONFIG_DIR/themes/brainkit.json` (user-themes path) and `theme: "brainkit"` in settings — this auto-applies on launch and decouples theme from plugin lifecycle. Per docs, plugin themes use `theme: "custom:<plugin>:<slug>"` settings key, but the user-themes path is simpler and more aligned with brainkit's existing harness-config-isolation pattern. **Token catalog limits:** `claude` token works (table borders, headers, accents). Background/text tokens (`background`, `bg`, `surface`, `panel`, `text`, etc.) do NOT paint terminal background or default text color — Claude Code respects host terminal colors. Brand can come through via accent + status + diff + syntax tokens only. Original assumption (plugin themes auto-apply) was wrong; design switched to user-themes path.
4. **`companyAnnouncements`** — Always shows entry 0 (no cycling, no randomization). Ship one well-chosen announcement; entries 1+ are wasted. Original assumption (TBD cycling) resolved as "always-first"; design ships one entry.
5. **Cross-platform script invocation** — macOS/Linux: `${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs` invoked via shebang works. Statusline receives rich JSON: `session_id, transcript_path, cwd, model, workspace, version, output_style, cost, context_window, exceeds_200k_tokens`. **Implication:** statusline can use `cwd` for vault path — no need for `BRAINKIT_VAULT_PATH` env var for the statusline script (still needed for hook scripts like auto-commit/precompact). Windows behavior not tested locally; defer to CI.
6. **`UserPromptSubmit` stdout visibility** — Stdout is injected as system context for the model, NOT shown to the user in the TUI. Cannot use `UserPromptSubmit` for user-facing toasts. Brag-detection toast feature remains deferred (matches plan). Original assumption (TBD) resolved as agent-context-only.
7. **`PreCompact` stdout-as-summary behavior** — ✅ PASS. Stdout is incorporated into the compaction summary visible to both user (success log line) and model (summary content). Ship `precompact.mjs` as planned. Matches original assumption.

## Task Breakdown

See `.todo/US-claude-code/main.md` for prioritized tasks.

## Out of Scope

- Custom subagents (Claude Code has built-in `Explore`, `Plan`, `general-purpose`; brainkit's domain doesn't justify ours).
- Replacing Claude Code's TUI via the Agent SDK (huge scope, requires API key, loses Claude Code's TUI features).
- Marketplace publication (deferred — `--plugin-dir` from the npm package is sufficient for v1; marketplace can be added later for users who run `claude` directly).
- Accomplishment-detection toasts (deferred pending smoke test #6 — logic exists in `core/hooks.ts`, but ship depends on whether `UserPromptSubmit` stdout reaches the user).
- MCP servers (no brainkit feature currently needs one).
- In-session auto-commit cadence parity with OpenCode's 30s debounce (we use SessionEnd-only, matching Copilot).
- Auto-copying global Claude credentials into the brainkit config dir (would violate isolation).
- `fix-copilot-status-script-path` (split into a separate backlog task — unrelated to Claude integration).
