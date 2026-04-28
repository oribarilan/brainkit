# US-claude-code

## Goal

Add Claude Code (the `claude` binary) as a third supported brainkit harness alongside OpenCode and Copilot CLI. Achieve full feature parity where Claude Code's extensibility model allows; explicitly document gaps where it does not.

Design spec: `specs/US-claude-code.md`.

## Definition of Done

- [ ] `brainkit claude` and `brainkit cc` launch Claude Code with brainkit plugin loaded and brainkit's system prompt active
- [ ] Bare `brainkit` auto-detects `claude` alongside `opencode` and `copilot`
- [ ] User's `~/.claude/` is never read or written; brainkit-side config lives under `~/.config/brainkit/claude/`. Verified by an automated test.
- [ ] All seven existing skills are available to the agent inside Claude Code
- [ ] `/brainkit:doctor` slash command runs vault health checks
- [ ] Brainkit-branded theme is active by default (brand color + status colors only); statusline shows live vault stats
- [ ] `SessionEnd` hook auto-commits vault changes
- [ ] `PreCompact` hook injects vault identity into compaction summaries
- [ ] First-time users get the onboarding flow via per-harness workspace `~/.config/brainkit/onboarding/claude/`
- [ ] Minimum supported Claude Code version pinned in `core/harness-version.ts`
- [ ] Auth re-prompt behavior documented for users
- [ ] Uninstall path documented
- [ ] `just check` passes
- [ ] CI's `test-windows` job passes
- [ ] `AGENTS.md` and `README.md` mention the new harness

## Task Priority

1. `smoke-test-claude-extensibility.md` — Manually verify the 7 open questions before writing code. De-risks everything downstream. Several design assumptions depend on its findings; if any fails, the design is revised here, not after building dependent code.
2. `extract-skill-installer.md` — Refactor `cli/install-skills.ts` into reusable `core/skill-installer.ts`. Existing Copilot tests must keep passing. Unblocks Claude skill generation.
3. `add-claude-onboarding-mode.md` — Add `"claude"` mode to `core/onboarding-prompt.ts`. Small, isolated.
4. `extract-staleness-helper.md` — Move staleness color/threshold logic from `opencode/side.tsx` and `scripts/copilot-status.js` into `core/`. Avoids triplicate-divergence when adding the Claude statusline.
5. `pin-claude-version.md` — Add Claude entry to `core/harness-version.ts` with a documented minimum version. Warning at launch if older.
6. `scaffold-claude-plugin.md` — Create `claude/` plugin TEMPLATE: manifest, theme, doctor skill, empty hooks file, placeholder scripts. Loadable via `--plugin-dir` even though scripts don't do real work yet. Add `claude/` to `package.json` files. NO `settings.json` in the plugin (only `agent`/`subagentStatusLine` would be honored).
7. `implement-plugin-scripts.md` — Real `auto-commit.mjs`, `precompact.mjs`, `statusline.mjs` using `core/vault.ts` + the staleness helper. Wire `hooks/hooks.json` (SessionEnd + PreCompact). NO `inject-context.mjs` / SessionStart hook (cut from v1 — no real value beyond per-launch system-prompt regeneration).
8. `implement-claude-launcher.md` — `cli/claude.ts`: stage plugin into `~/.config/brainkit/claude/plugin/` (version-marker for fast no-op), generate skills into staging, write `settings.json` + `system-prompt.txt`, spawn with `cwd: vaultPath` (no `--add-dir`). Onboarding workspace branch under `~/.config/brainkit/onboarding/claude/`.
9. `register-claude-harness.md` — Wire `launchClaude` into `cli/launch.ts` HARNESSES, add `claude`/`cc` aliases, update auto-detection.
10. `claude-isolation-test.md` — Automated test asserting `~/.claude/` is never touched and `<pkgRoot>/claude/` is never written to (not just `~/.claude/`). Non-negotiable per AGENTS.md.
11. `update-docs.md` — Update `AGENTS.md`, `README.md`. Include auth re-prompt behavior section and uninstall instructions (`rm -rf ~/.config/brainkit/claude/`).

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.claude/`. All brainkit state under `~/.config/brainkit/claude/` via `CLAUDE_CONFIG_DIR`.
- **Plugin staging required:** `<pkgRoot>/claude/` is read-only at runtime (npm node_modules can be on pnpm hard-links, owned by root, wiped on reinstall). Always copy template into `~/.config/brainkit/claude/plugin/` and operate there.
- **Auth re-prompt is expected:** users will need to authenticate Claude Code separately under `CLAUDE_CONFIG_DIR`. Do NOT auto-copy credentials. Document clearly in `update-docs`.
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
