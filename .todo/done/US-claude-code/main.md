# US-claude-code

## Goal

Add Claude Code (the `claude` binary) as a third supported brainkit harness alongside OpenCode and Copilot CLI. Achieve full feature parity where Claude Code's extensibility model allows; explicitly document gaps where it does not.

Design spec: `specs/US-claude-code.md`.

## Definition of Done

- [x] `brainkit claude` and `brainkit cc` launch Claude Code with brainkit plugin loaded and brainkit's system prompt active
- [x] Bare `brainkit` auto-detects `claude` alongside `opencode` and `copilot`
- [x] User's `~/.claude/` is never read or written; brainkit-side config lives under `~/.config/brainkit/claude/`. Verified by an automated test (`cli/__tests__/claude-isolation.test.ts`).
- [x] All seven existing skills (brainkit + para + bragfile + contacts + meeting-notes + maintenance + onboarding) are available to the agent inside Claude Code via the staged `plugin/skills/` directory; the hand-authored `doctor` skill ships in the plugin template
- [x] `/brainkit:doctor` slash command runs vault health checks (hand-authored `doctor` skill in `claude/skills/doctor/SKILL.md` instructs Claude to invoke `runHealthChecks(vaultPath)` from `core/vault.ts`)
- [x] Brainkit-branded theme is active by default (rose `#E8A0BF` on the `claude` token + status colors via `error`/`success`/`warning`); statusline shows live vault stats (vault name + brag count + staleness + contact count)
- [x] `SessionEnd` hook auto-commits vault changes (`claude/scripts/auto-commit.mjs`)
- [x] `PreCompact` hook injects vault identity into compaction summaries (`claude/scripts/precompact.mjs`)
- [x] First-time users get the onboarding flow at `$CONFIG_DIR/onboarding/CLAUDE.md` (shared workspace with Copilot at `~/.config/brainkit/onboarding/`, different filename per harness avoids conflict — the `~/.config/brainkit/onboarding/claude/` per-harness dir from the original spec was deemed unnecessary; narrow concurrent-onboarding race accepted as known limitation)
- [x] Minimum supported Claude Code version pinned (`MIN_CLAUDE_VERSION = "2.1.109"` inline in `cli/claude.ts` mirroring `cli/copilot.ts`'s `MIN_COPILOT_VERSION` pattern; warns and proceeds if older)
- [x] Auth re-prompt behavior documented for users (README.md "First launch with Claude Code" section)
- [x] Uninstall path documented (README.md: `rm -rf ~/.config/brainkit/claude/`)
- [x] `just check` passes (321+ tests, lint clean, prettier clean, package integrity clean)
- [ ] CI's `test-windows` job passes (will be verified when this branch's PR is opened)
- [x] `AGENTS.md` and `README.md` mention the new harness

## Task Priority

1. `smoke-test-claude-extensibility.md` — Manually verify the 7 open questions before writing code. De-risks everything downstream. Several design assumptions depend on its findings; if any fails, the design is revised here, not after building dependent code.
2. `extract-skill-installer.md` — Refactor `cli/install-skills.ts` into reusable `core/skill-installer.ts`. Existing Copilot tests must keep passing. Unblocks Claude skill generation.
3. `add-claude-onboarding-mode.md` — Add `"claude"` mode to `core/onboarding-prompt.ts`. Small, isolated.
4. `extract-staleness-helper.md` — Move staleness color/threshold logic from `opencode/side.tsx` and `scripts/copilot-status.js` into `core/`. Avoids triplicate-divergence when adding the Claude statusline.
5. `pin-claude-version.md` — Add an inline `MIN_CLAUDE_VERSION` constant to `cli/claude.ts` (mirroring `cli/copilot.ts`'s `MIN_COPILOT_VERSION` pattern) with a documented minimum version. Warning at launch if older.
6. `scaffold-claude-plugin.md` — Create `claude/` plugin TEMPLATE: manifest, theme, doctor skill, empty hooks file, placeholder scripts. Loadable via `--plugin-dir` even though scripts don't do real work yet. Add `claude/` to `package.json` files. NO `settings.json` in the plugin (only `agent`/`subagentStatusLine` would be honored).
7. `implement-plugin-scripts.md` — Real `auto-commit.mjs`, `precompact.mjs`, `statusline.mjs` using `core/vault.ts` + the staleness helper. Wire `hooks/hooks.json` (SessionEnd + PreCompact). NO `inject-context.mjs` / SessionStart hook (cut from v1 — no real value beyond per-launch system-prompt regeneration).
8. `implement-claude-launcher.md` — `cli/claude.ts`: stage plugin into `~/.config/brainkit/claude/plugin/` (version-marker for fast no-op), generate skills into staging, write `settings.json` + `system-prompt.txt`, spawn with `cwd: vaultPath` (no `--add-dir`). Onboarding workspace branch under `~/.config/brainkit/onboarding/claude/`.
9. `register-claude-harness.md` — Wire `launchClaude` into `cli/launch.ts` HARNESSES, add `claude`/`cc` aliases, update auto-detection.
10. `claude-isolation-test.md` — Automated test asserting `~/.claude/` is never touched and `<pkgRoot>/claude/` is never written to (not just `~/.claude/`). Non-negotiable per AGENTS.md.
11. `update-docs.md` — Update `AGENTS.md`, `README.md`. Include auth re-prompt behavior section and uninstall instructions (`rm -rf ~/.config/brainkit/claude/`).

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.claude/`. All brainkit state under `~/.config/brainkit/claude/` via `CLAUDE_CONFIG_DIR`. **Reference implementation:** `cli/copilot.ts` (the `COPILOT_HOME` flow, especially the `$COPILOT_HOME setup` section ~lines 398–542). Mirror its structure — populate config dir first, spawn with isolated env. No legacy-vault migration is needed for Claude (it has never shipped a vault-writing version).
- **Plugin staging required:** `<pkgRoot>/claude/` is read-only at runtime (npm node_modules can be on pnpm hard-links, owned by root, wiped on reinstall). Always copy template into `~/.config/brainkit/claude/plugin/` and operate there. **The staging-into-`~/.config/brainkit/<harness>/` pattern is now battle-tested in production via Copilot** — the design risk is on Claude-specific `--plugin-dir` semantics, not the staging model itself.
- **Auth re-prompt is expected:** users will need to authenticate Claude Code separately under `CLAUDE_CONFIG_DIR`. Do NOT auto-copy credentials. Document clearly in `update-docs` (match the tone of the Copilot v0.9.0 README/CHANGELOG note).
- **Reuse existing helpers:** `vaultIsGitRepo()` (in `cli/copilot.ts`) and `BRAINKIT_PROMPT_SENTINEL` (in `core/system-prompt.ts`) already exist. If `vaultIsGitRepo()` is needed by Claude code paths, extract it to `core/` rather than re-importing from `cli/copilot.ts`.
- **No new runtime dependencies.** Plugin scripts are plain Node ESM importing from `core/`.
- **Cross-platform paths.** Use `node:path` and `node:os`. Hook scripts get `+x` bit on copy into staging. Windows CI must pass.
- **Script extension:** `.mjs` (Node ESM).
- **Reuse > duplicate:** skill installer and staleness helper are extracted to `core/`. Existing Copilot/OpenCode tests must keep passing after refactor.
- **Smoke test first:** task 1 is mandatory before tasks 6+ start. Tasks 2, 3, 4, 5 can run in parallel after smoke test (they're independent and don't depend on smoke-test findings).

## Side fix split out

`fix-copilot-status-script-path` (the `dist/cli/copilot-status.js` path bug) was originally in this US but moved to `.todo/backlog/` — unrelated to Claude integration, ship as a separate PR.

## Tasks deferred to follow-ups

- **Brag/accomplishment toast on Claude** — pending smoke test #6 (does `UserPromptSubmit` stdout reach the user?). Logic exists in `core/hooks.ts`; if smoke test confirms reachability, ~30 lines of script.
- **In-session auto-commit cadence** — Claude is SessionEnd-only (Copilot pattern). OpenCode does 30s debounced in-session via timer. Acceptable divergence.
- **Marketplace publication** — `--plugin-dir` is enough for v1 via the brainkit launcher. Marketplace useful only for users who run `claude` directly without going through `brainkit`.
- **Custom subagents** — Claude has built-ins; brainkit domain doesn't justify ours.
