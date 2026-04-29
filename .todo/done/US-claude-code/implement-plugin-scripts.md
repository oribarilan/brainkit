# implement-plugin-scripts

## Context

Replace stub scripts from `scaffold-claude-plugin` with real implementations:

- `auto-commit.mjs` — `SessionEnd` hook, mirrors Copilot's auto-commit pattern
- `precompact.mjs` — `PreCompact` hook, mirrors OpenCode's `experimental.session.compacting` (vault identity into summary so agent doesn't drift after auto-summary)
- `statusline.mjs` — vault stats line at the bottom of the TUI

NO `inject-context.mjs` / SessionStart hook — cut from v1. `--append-system-prompt-file` is regenerated per launch (each `claude` spawn = fresh process), so there's no actual staleness gap to close. Adding SessionStart would duplicate the same vault data already in the system prompt for marginal benefit.

**Value delivered:** Functional `SessionEnd` auto-commit, `PreCompact` identity preservation, and live vault stats statusline. Brings Claude to behavioral parity with OpenCode for these three concerns.

## Related Files

- `claude/scripts/auto-commit.mjs`, `precompact.mjs`, `statusline.mjs`
- `core/vault.ts` — source for vault stats helpers
- `core/skill-installer.ts` — N/A here, but reused upstream
- `scripts/copilot-status.js` — reference for statusline format (after extract-staleness-helper lands)
- `opencode/server.ts:61-86` — reference for precompact content
- `cli/copilot.ts` § `auto-commit.js` inline — reference for auto-commit
- `core/<staleness-helper>` — from `extract-staleness-helper.md`

## Dependencies

- `scaffold-claude-plugin.md`
- `extract-staleness-helper.md` (statusline reuses the helper)
- `smoke-test-claude-extensibility.md` (Q5 — script invocation; Q7 — PreCompact stdout-as-summary behavior)

## Acceptance Criteria

- [ ] **`auto-commit.mjs`** runs in the vault dir (`cwd` from `BRAINKIT_VAULT_PATH`). Stages all changes, commits with message `brainkit: auto-save <ISO date>`. No-op if no changes. Silent failure if git missing or vault isn't a repo (exit 0). Never blocks session end. Never produces error output to TUI.
- [ ] **`precompact.mjs`** reads `BRAINKIT_VAULT_PATH`. If absent, exits 0 silently. When valid: prints a compact markdown block (user, vault name, path, features, tone) — content matching `opencode/server.ts:69-80`. Stdout becomes part of the compaction summary (verified by smoke test Q7).
- [ ] **`statusline.mjs`** reads JSON from stdin (Claude session info), reads vault stats from `BRAINKIT_VAULT_PATH`, prints single-line: `🧠 <vault> | <bragCount> brags (<staleness>) | <contactCount> contacts`. ANSI staleness colors via the shared `core/` helper (green ≤7d / yellow ≤14d / red).
- [ ] All three scripts cross-platform (`node:path`, `node:os`, `node:child_process` with `shell: process.platform === "win32"` where needed).
- [ ] All three scripts import from `core/` rather than duplicating logic. ESM imports use `.js` suffix (matches existing `core/` convention).
- [ ] Each script handles missing `BRAINKIT_VAULT_PATH` gracefully (exit 0, no error output).
- [ ] `claude/hooks/hooks.json` includes `SessionEnd` → auto-commit, `PreCompact` → precompact. NO `SessionStart`.

## Verification

- **Automated:** unit tests for any extracted formatting/logic functions in `core/__tests__/`. Each script's main entry is testable by spawning as subprocess with controlled env vars and a tmpdir vault.
- **Ad-hoc:** launch `claude --plugin-dir <repo>/claude` with `BRAINKIT_VAULT_PATH` set to a real test vault. Confirm:
  - statusline shows the expected vault stats line at the bottom
  - making a change to a vault file then exiting produces a `brainkit: auto-save ...` commit
  - triggering compaction (`/compact`) results in a post-compact summary that includes the vault identity block

## Notes

The auto-commit script needs careful failure-mode handling — never block session end, never produce error output that pollutes the TUI.

If smoke test Q7 reveals `PreCompact` stdout is NOT incorporated into the summary (only logged), update spec and consider whether `Stop` or another mechanism can substitute. Don't ship a hook that doesn't do what it claims.
