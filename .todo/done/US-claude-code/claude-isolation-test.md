# claude-isolation-test

## Context

AGENTS.md § Harness Config Isolation states: "Brainkit must **never** modify the user's normal harness configuration." For Claude Code that means `~/.claude/` is never read or written by `brainkit claude`. Additionally, brainkit must never write into `<pkgRoot>/claude/` at runtime — that path is read-only on common npm install configurations (pnpm, sudo, etc.). Both are non-negotiable and should be enforced by automated tests.

**Value delivered:** Permanent automated guarantees that brainkit's Claude integration honors the isolation rules. Catches regressions before they ship.

## Related Files

- `AGENTS.md` § Harness Config Isolation
- `cli/claude.ts`
- `cli/__tests__/claude.test.ts`

## Dependencies

- `implement-claude-launcher.md`

## Acceptance Criteria

- [ ] **Test 1 (`~/.claude/` isolation):** sets `HOME` to a tmpdir, calls launcher setup helpers (everything up to but excluding the actual `spawn`), asserts no file or directory is created or modified under `<tmpdir>/.claude/`. Confirms files ARE created under `<tmpdir>/.config/brainkit/claude/`.
- [ ] **Test 2 (`<pkgRoot>` is not mutated):** snapshots the file tree under `<pkgRoot>/claude/` before invoking launcher setup, runs the launcher (with HOME pointing at a tmpdir), asserts the `<pkgRoot>/claude/` tree is byte-identical after. Catches accidental writes to the read-only template.
- [ ] **Test 3 (staging dir contains expected layout):** after launcher setup, `<tmpdir>/.config/brainkit/claude/plugin/` exists with the manifest, theme, hand-authored doctor skill, generated other skills, hooks, scripts, and `.brainkit-version` marker.
- [ ] Tests run cross-platform (Windows path separators, Unix path separators).
- [ ] Tests are fast (no real network, no real `claude` binary spawn).
- [ ] Failure messages are explicit, e.g. "brainkit must never read or write under ~/.claude/. See AGENTS.md § Harness Config Isolation." and "brainkit must never write to <pkgRoot>/claude/ — it is read-only at runtime."

## Verification

- **Automated:** tests pass locally (`just test`) and in CI (`test-windows` job included).
- **Ad-hoc:** intentionally introduce a violation (e.g. add `fs.writeFileSync(path.join(os.homedir(), '.claude', 'test'), ...)` in `cli/claude.ts`), confirm the test fails with the explicit message. Revert. Same for a write to `<pkgRoot>/claude/`.

## Notes

Test 2 (snapshot of `<pkgRoot>/claude/`) is the test future contributors will be most thankful for. The "stage into `~/.config/brainkit/claude/plugin/`" pattern is non-obvious; without this test, someone WILL eventually write directly into the template "for simplicity" and brainkit will break for pnpm users silently.

**Reference precedent:** `cli/__tests__/copilot.test.ts` already contains analogous isolation tests for `COPILOT_HOME` (the `~/.copilot/` is never touched assertions). Mirror that structure.

**No legacy-vault migration test needed** — unlike the Copilot v0.9.0 work, Claude Code has never shipped a vault-writing version of brainkit. There are no legacy files in user vaults to migrate. If that ever changes, add a migration test then.
