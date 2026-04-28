# pin-claude-version

## Context

Brainkit warns Copilot users when their installed version is below a smoke-tested floor (`MIN_COPILOT_VERSION = "1.0.37"` in `cli/copilot.ts`, with an inline check that warns and proceeds). Claude Code needs the equivalent: without it, a Claude version upgrade can break brainkit silently (hooks JSON schema, settings.json keys, `--plugin-dir` semantics, theme schema, etc. are all version-dependent).

**Note on architecture:** `cli/harness-version.ts` is a *different* concern — it handles npm-update-prompt UX (suggesting `copilot update` when a newer version exists). The minVersion floor lives inline in each launcher (`cli/copilot.ts` warns at v < 1.0.37). Claude follows the inline pattern.

**Value delivered:** Brainkit warns users on launch if their Claude Code version is older than the minimum brainkit was tested against. Catches breakage early.

## Related Files

- `cli/copilot.ts` — reference: `MIN_COPILOT_VERSION` const + inline `claude --version` parse + warn-and-proceed
- `cli/claude.ts` — Claude launcher (where the new `MIN_CLAUDE_VERSION` constant + check live)
- `cli/__tests__/copilot.test.ts` — reference for how the version check is tested
- `cli/__tests__/claude.test.ts` — new tests added here

## Dependencies

- `smoke-test-claude-extensibility.md` (need to know what version was used during smoke testing — that becomes the minimum)
- `implement-claude-launcher.md` (the constant + check live in `cli/claude.ts`, which doesn't exist until that task lands; this task can be implemented concurrently and integrated into the launcher PR)

## Acceptance Criteria

- [ ] `cli/claude.ts` exports a `MIN_CLAUDE_VERSION` constant set to the version used during smoke testing (recorded in that task's notes).
- [ ] `cli/claude.ts` includes an inline version check (mirroring `cli/copilot.ts`) that runs `claude --version`, parses the version string, and prints a warning if older than `MIN_CLAUDE_VERSION` — does NOT block, warns and proceeds.
- [ ] If `claude --version` fails (binary missing, permission denied, parse fails), check is silent — no warning, no error.
- [ ] Test coverage in `cli/__tests__/claude.test.ts`: version parser handles real Claude `--version` output format (capture during smoke test); minimum-version comparison correct for older / equal / newer / parse-failure.
- [ ] Reuses `isOlderThan` from `cli/version-utils.ts` (already used by Copilot's check) — do not reimplement semver comparison.

## Verification

- **Automated:** new tests in `cli/__tests__/claude.test.ts` covering the version warn behavior. `just test` passes.
- **Ad-hoc:** simulate older version (mock the parser output) and confirm warning prints. Simulate equal or newer and confirm no warning. Confirm a missing `claude` binary produces no error.

## Notes

Match the existing inline pattern from `cli/copilot.ts` exactly — don't invent a new shape. If after looking at both Copilot and (eventually) Claude there's an obvious abstraction worth extracting (e.g. `checkMinHarnessVersion(binary, minVersion, displayName)`), file a follow-up; don't expand this task's scope.

The `cli/harness-version.ts` module (npm-update-prompt) is a *separate* concern and can be extended in a follow-up to also surface Claude in update prompts — it is NOT required for this task's DoD.
