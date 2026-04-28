# Task: extract-version-utils

## Context

`harness-version.ts` contains `isOlderThan()` and `getLatestNpmVersion()` which the self-update module also needs. Extract them into a shared utility so both modules can import them without duplication.

**Value delivered**: Shared version utilities available for any module; harness version check keeps working with updated imports.

## Related Files

- `cli/harness-version.ts` — source of the functions to extract
- `cli/__tests__/harness-version.test.ts` — existing tests that import these functions

## Dependencies

- None

## Acceptance Criteria

- [ ] `cli/version-utils.ts` exists with `isOlderThan()` and `getLatestNpmVersion()` exported
- [ ] `cli/harness-version.ts` imports both from `./version-utils.js` instead of defining them locally
- [ ] `cli/__tests__/harness-version.test.ts` passes without changes (or with updated imports)
- [ ] `cli/__tests__/version-utils.test.ts` exists with the `isOlderThan` tests (moved or duplicated from harness-version tests)
- [ ] `just check` passes

## Verification

- **Automated**: `just test` — all existing harness-version tests pass; new version-utils tests pass
- **Ad-hoc**: `just lint` — no type errors or unused imports

## Scope Estimate

Small
