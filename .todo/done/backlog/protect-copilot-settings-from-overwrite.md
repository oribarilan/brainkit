# protect-copilot-settings-from-overwrite

## Context

Every `brainkit copilot` launch unconditionally rewrites four things under `~/.config/brainkit/copilot/`:

- `copilot-instructions.md` (via `writeCopilotInstructions`)
- `settings.json` (via `generateCopilotSettings`)
- `hooks/scripts/auto-commit.js` (via `installCopilotHooks`)
- `skills/brainkit/` tree (via `installSkills`)

Two problems:

1. **Inefficiency.** Most launches change nothing. We pay disk I/O on every invocation rewriting identical content.
2. **Latent bug: Copilot CLI may write to its own `settings.json` at runtime.** If a user adds an MCP server, approves a tool, sets a theme, etc. from inside Copilot, those mutations land in `$COPILOT_HOME/settings.json`. On the next `brainkit copilot` launch, `generateCopilotSettings` clobbers them. The user re-adds → brainkit clobbers again → infinite frustration loop with no obvious culprit.

Concern #1 is pure waste. Concern #2 is a real bug waiting for the first user who uses Copilot's runtime config commands inside a brainkit session.

The other three files (instructions, auto-commit script, skills) Copilot CLI does **not** mutate at runtime, so they only need the idempotent-skip treatment, not merge logic.

**Value delivered:** Eliminates per-launch I/O waste and prevents silent loss of user-driven Copilot config changes (MCP servers, approved tools, etc.) on subsequent launches.

## Related Files

- `cli/copilot.ts` — `writeCopilotInstructions`, `generateCopilotSettings`, `installCopilotHooks`
- `cli/install-skills.ts` — `installSkills` (already version-gated; verify it actually skips)
- `cli/__tests__/copilot.test.ts` — adds tests for skip-on-unchanged + merge-preserves-user-keys

## Dependencies

- None.

## Acceptance Criteria

### Idempotent writes (fixes inefficiency)

- [ ] `writeCopilotInstructions`: read existing file; if content byte-equal to what would be written, skip the write.
- [ ] `installCopilotHooks`: same — skip write when `auto-commit.js` content is unchanged.
- [ ] `installSkills`: confirm it already short-circuits when target version matches source version. If not, fix it.

### Read-merge-write for `settings.json` (fixes latent bug + inefficiency)

- [ ] `generateCopilotSettings` reads existing `settings.json` if present, merges brainkit-owned keys (`companyAnnouncements`, `statusLine`, `hooks`) on top of existing content, preserves all other keys, writes only if the merged result differs from what's on disk.
- [ ] Brainkit-owned keys are declared as a single `const` in the source so the merge boundary is explicit and future-proof.
- [ ] Malformed existing `settings.json` (invalid JSON) → log a warning, fall back to overwrite. Don't crash the launch.

## Verification

- **Automated:** new tests in `cli/__tests__/copilot.test.ts`:
  - Pre-populate `settings.json` with `{ "userKey": "preserved", "hooks": { "userHook": [...] } }`. Run `launchCopilot`. Assert `userKey` survives, brainkit `hooks.agentStop` / `hooks.sessionEnd` are present, and `userHook` is preserved (key-level merge inside `hooks`, not whole-object replace).
  - Run `launchCopilot` twice on a clean state. Assert second run performs zero writes (spy on `fs.writeFileSync` or check mtime).
  - Pre-populate `settings.json` with invalid JSON. Run `launchCopilot`. Assert it logs a warning, overwrites, and doesn't throw.
- **Ad-hoc:** add a custom top-level key to `settings.json`, run `brainkit copilot`, confirm the key survives.

## Notes

- `hooks` merge strategy needs a decision: append brainkit hook entries to existing user arrays under `agentStop` / `sessionEnd`, or replace? Lean toward append (preserves user hooks) but verify Copilot's behavior with multiple hook entries first.
- The OpenCode side has the same per-launch rewrite pattern — apply the same idempotent-skip treatment there once this lands.
- Surfaced during second-pass pre-release review of US-copilot-isolation. Original framing was "user manually edits the file" (low priority); reframed after realizing Copilot CLI itself can mutate `settings.json` at runtime.
