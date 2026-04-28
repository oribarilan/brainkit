# extract-skill-installer

## Context

`cli/install-skills.ts` writes Anthropic Agent Skills format into `<vault>/.agents/skills/brainkit/` for Copilot. The Claude Code plugin needs a similar generator with a different layout (one standalone skill per directory: `skills/<name>/SKILL.md`) and Claude-native frontmatter (`disable-model-invocation`, `user-invocable`).

The Claude generator writes into the **staging plugin directory** (`~/.config/brainkit/claude/plugin/skills/`), not into `<pkgRoot>/claude/skills/`. Critical: `<pkgRoot>` is read-only when brainkit is npm-installed (pnpm hard-links, sudo-owned, wiped on reinstall).

We extract shared logic into `core/skill-installer.ts` with a per-target options object.

**Value delivered:** Reusable skill installer that both harnesses depend on. No behavior change for Copilot. Foundation for Claude skill generation that doesn't write into `node_modules`.

## Related Files

- `cli/install-skills.ts` — current Copilot installer
- `cli/__tests__/install-skills.test.ts` — must keep passing unchanged
- `cli/copilot.ts` — currently calls `installSkills`; must keep working
- `skills/` — canonical source

## Dependencies

- `smoke-test-claude-extensibility.md` (smoke test confirms staging dir layout / `--plugin-dir` semantics; if the fallback Option D is chosen, the target dir options change)

## Acceptance Criteria

- [ ] New module `core/skill-installer.ts` with an exported `installSkills(options)` function. Options include: source skills dir, target dir, layout strategy (`"copilot-flat"` vs `"claude-per-dir"`), frontmatter transform function, version marker filename.
- [ ] `cli/install-skills.ts` becomes a thin wrapper that calls `core/skill-installer.ts` with Copilot options, preserving its current public signature.
- [ ] Existing Copilot tests in `cli/__tests__/install-skills.test.ts` pass unchanged.
- [ ] No new runtime dependencies.
- [ ] Module is cross-platform (uses `node:path`, no hardcoded separators).
- [ ] Function is target-agnostic — caller specifies absolute target path, installer doesn't assume vault or `<pkgRoot>` or `$CLAUDE_CONFIG_DIR`. Caller (Claude launcher) passes `<configDir>/plugin/skills/`.

## Verification

- **Automated:** `just test` runs the full suite including `install-skills.test.ts`. All pass.
- **Automated (new):** add unit test in `core/__tests__/skill-installer.test.ts` covering the `claude-per-dir` layout with a mock frontmatter transform. Verifies one `SKILL.md` per source skill, frontmatter rewritten correctly, version marker written, target dir is whatever the caller passed (no hardcoding).
- **Ad-hoc:** `just lint` passes (typecheck includes the new module).

## Notes

Don't add a Claude consumer in this task — that comes in `implement-claude-launcher.md`. This task is the refactor only.

The hand-authored `doctor` skill in the template (`<pkgRoot>/claude/skills/doctor/`) gets copied into the staging dir by the launcher's plain `cp -r` step BEFORE the installer runs. Both can write to `staging/skills/` cleanly — `cp` puts `doctor/` there, installer puts the others. No whitelist / preservation logic needed.
