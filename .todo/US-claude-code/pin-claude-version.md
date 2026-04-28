# pin-claude-version

## Context

Brainkit pins minimum supported versions of OpenCode and Copilot in `core/harness-version.ts`. Claude Code has no equivalent yet. Without it, a Claude version upgrade can break brainkit silently (hooks JSON schema, settings.json keys, `--plugin-dir` semantics, theme schema, etc. are all version-dependent).

**Value delivered:** Brainkit warns users on launch if their Claude Code version is older than the minimum brainkit was tested against. Catches breakage early.

## Related Files

- `core/harness-version.ts`
- `core/__tests__/harness-version.test.ts` (or wherever the existing tests live)
- `cli/launch.ts` — version check is invoked here

## Dependencies

- `smoke-test-claude-extensibility.md` (need to know what version was used during smoke testing — that becomes the minimum)

## Acceptance Criteria

- [ ] `core/harness-version.ts` includes a `claude` entry with `binary: "claude"`, the version-detection command (likely `claude --version`), version-string parser, and a `minVersion` constant.
- [ ] `minVersion` is set to the version used during smoke testing (recorded in that task's notes).
- [ ] On launch of `brainkit claude`, if the installed Claude version is older than `minVersion`, brainkit prints a warning (does NOT block — warns and proceeds, matching OpenCode/Copilot behavior).
- [ ] Test coverage: version parser handles real Claude `--version` output format (capture during smoke test); minimum-version comparison correct for older / equal / newer.
- [ ] If `claude --version` fails (binary missing, permission denied), check is silent — no warning, no error.

## Verification

- **Automated:** new tests in `core/__tests__/harness-version.test.ts` covering the Claude entry.
- **Ad-hoc:** simulate older version (mock the parser output) and confirm warning prints. Simulate equal or newer and confirm no warning.

## Notes

Match the existing pattern from OpenCode/Copilot entries — don't invent a new shape. If the existing module structure makes adding a new entry harder than it should be, file a follow-up to refactor; don't expand this task's scope.
