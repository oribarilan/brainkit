# harness-version-check

## Context

Brainkit may rely on newer OpenCode/Copilot CLI features while the user runs a stale version. After harness selection, brainkit should check if the harness is up to date and suggest updating before launching.

**Value delivered**: Users are nudged to update their harness when brainkit needs newer features, preventing confusing failures from version mismatches.

## Related Files

- `cli/launch.ts` — harness selection and launch logic
- `cli/copilot.ts` — copilot launcher
- `cli/index.ts` — CLI entry point

## Research (completed)

### Version commands

| Harness  | Get version          | Parse                                   | Latest via npm                     | Update command     |
| -------- | -------------------- | --------------------------------------- | ---------------------------------- | ------------------ |
| OpenCode | `opencode --version` | Bare semver (`1.14.25`)                 | `npm view opencode-ai version`     | `opencode upgrade` |
| Copilot  | `copilot --version`  | Parse from `"GitHub Copilot CLI X.Y.Z"` | `npm view @github/copilot version` | `copilot update`   |

### When to check (not every launch — zero cost normally)

- **During onboarding** — no `config.toml` exists
- **When brainkit version changed** — compare current version against `<configDir>/last-brainkit-version` marker file (same pattern as `.brainkit-version` in `install-skills.ts`)

### UX

- If outdated: clack `confirm()` suggesting the harness's own update command
- If user declines: continue launching anyway
- If check fails (network error, npm not available): silently skip

## Dependencies

- None

## Acceptance Criteria

- [ ] On first run (onboarding), brainkit checks the harness version against npm registry
- [ ] On brainkit version change (marker file mismatch), brainkit checks the harness version
- [ ] On normal launches (no version change), no version check occurs (zero latency cost)
- [ ] If harness is outdated, clack `confirm()` shows current vs latest version and the update command
- [ ] If user confirms update, brainkit prints the update command and exits (user runs it themselves)
- [ ] If user declines, launch continues normally
- [ ] If version check fails (network, npm missing), launch continues silently
- [ ] Marker file `<configDir>/last-brainkit-version` is written/updated after a successful check
- [ ] Works for both OpenCode and Copilot CLI

## Verification

- **Ad-hoc**: Set `BRAINKIT_CONFIG_DIR` to a temp dir (no marker file), run `just run` — should trigger version check. Run again — should skip (marker matches). Bump brainkit version in marker file — should trigger again.

## Notes

- Both harnesses have auto-update on by default, so most users won't see this. It's a safety net for users who disabled auto-update or installed via methods that don't auto-update.
- The npm registry check adds ~500ms-1s, which is why it's gated to special occasions only.
- OpenCode's GitHub repo redirects (`sst/opencode` → `anomalyco/opencode`), so use npm registry not GitHub API.
