# protect-copilot-settings-from-overwrite

## Context

`generateCopilotSettings` in `cli/copilot.ts` rewrites `~/.config/brainkit/copilot/settings.json` from scratch on every `brainkit copilot` launch. Any user-added keys (e.g., a custom MCP server entry, a theme preference, additional hooks) are silently clobbered on the next launch.

Today this is benign because `~/.config/brainkit/copilot/settings.json` is not documented as user-editable. But the path _looks_ like a user config dir (under `~/.config/`), so it's a foot-gun if a user discovers and edits it. No one has reported the issue — this is preventative.

**Value delivered:** Closes a small foot-gun in the Copilot isolation model. Either makes the brainkit-managed nature of the file explicit (cheap, documentation-only) or actually preserves user additions (slightly more code, more user-friendly).

## Related Files

- `cli/copilot.ts` — `generateCopilotSettings` (the function that overwrites)
- `cli/__tests__/copilot.test.ts` — would gain a test asserting user additions are preserved (option 2) or that the marker comment is present (option 1)

## Dependencies

- None.

## Acceptance Criteria

Pick **one** of the three approaches below; the AC list is the union.

### Option 1: Document the overwrite (cheapest, no behavior change)

- [ ] `generateCopilotSettings` writes a top-level `_brainkitNote` (or similar) key into `settings.json` whose value is "Managed by brainkit — do not edit; changes will be overwritten on next `brainkit copilot` launch."
- [ ] Update `specs/10-copilot-cli.md` § "Config isolation" to call out that `settings.json` is brainkit-managed.

### Option 2: Read-merge-write (preserves user additions)

- [ ] `generateCopilotSettings` reads existing `settings.json` if present, merges with brainkit-owned keys (`companyAnnouncements`, `statusLine`, `hooks`), and writes the result. User-added keys are preserved.
- [ ] Brainkit-owned keys are documented as a constant list in the source so future additions don't accidentally clobber a user key with the same name.
- [ ] New test: pre-populate `settings.json` with `{ "userKey": "preserved" }`, run `launchCopilot`, assert `userKey` survives and brainkit keys are present.

### Option 3: Split files (most architecturally clean)

- [ ] Write brainkit-owned config to a dedicated file (e.g., `brainkit.json`) and confirm Copilot CLI imports it. Verify via smoke test against current Copilot CLI version.
- [ ] User's `settings.json` left untouched.
- [ ] Update spec + changelog.

## Verification

- **Automated:** new test in `cli/__tests__/copilot.test.ts` (per chosen option).
- **Ad-hoc:** add a custom key to `settings.json`, run `brainkit copilot`, confirm the key survives (option 2/3) or that the doc comment is present (option 1).

## Notes

- **Recommendation:** ship option 1 if/when a user trips on this; only build option 2 if there's a real signal users want to extend the file.
- The OpenCode side has the same dynamic with `~/.config/brainkit/opencode.json` — also fully brainkit-managed, no user-add story. Whatever pattern wins here should likely apply there too.
- Surfaced during second-pass pre-release review of US-copilot-isolation. P2 finding from oracle review (`.todo/done/US-copilot-isolation/`); deferred deliberately.
- Cohort context: 2 known beta testers; neither is likely to hit this organically. Bump priority if a third user reports it.
