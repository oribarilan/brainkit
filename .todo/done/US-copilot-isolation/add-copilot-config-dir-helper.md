# add-copilot-config-dir-helper

## Context

Add a `getCopilotConfigDir()` helper to `core/vault.ts` that returns the path to brainkit's isolated Copilot config dir (`~/.config/brainkit/copilot/`). Centralizes the path so all callers — launcher, migration, tests — derive it the same way.

Follows the existing `getConfigDir()` pattern in `core/vault.ts:50`.

**Value delivered:** A single source of truth for the Copilot config dir path. Unblocks every other task in this US.

## Related Files

- `core/vault.ts` — has `getConfigDir()` (line 50); add `getCopilotConfigDir()` alongside
- `core/index.ts` — re-exports `getConfigDir`; add `getCopilotConfigDir` to the same export block
- `core/__tests__/cross-platform.test.ts` — has cross-platform tests for `getConfigDir`; mirror them for the new helper

## Dependencies

- None.

## Acceptance Criteria

- [ ] `core/vault.ts` exports `getCopilotConfigDir(): string` returning `path.join(getConfigDir(), "copilot")`
- [ ] `core/index.ts` re-exports `getCopilotConfigDir`
- [ ] Cross-platform test cases in `core/__tests__/cross-platform.test.ts` mirror the existing `getConfigDir` tests:
  - On macOS/Linux: returns `<homedir>/.config/brainkit/copilot`
  - On Windows: returns the platform-appropriate path with correct separators
  - With `BRAINKIT_CONFIG_DIR=/custom/dir` env var: returns `/custom/dir/copilot`
- [ ] `just lint` passes
- [ ] `just test` passes (existing tests unchanged + new tests added)

## Verification

- **Automated:** new test cases in `core/__tests__/cross-platform.test.ts` exercise the helper on all three platforms (the existing test file already mocks `os.platform()` per case).
- **Ad-hoc:** `just test core/__tests__/cross-platform.test.ts` shows new cases passing.

## Notes

This is intentionally trivial. The whole point is to avoid scattering `path.join(getConfigDir(), "copilot")` across the codebase. Once the helper exists, every other task in the US uses it.
