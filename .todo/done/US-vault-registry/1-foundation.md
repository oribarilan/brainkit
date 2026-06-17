# Foundation: types, expandTilde, listVaults, validateRegistry

## Context

Establishes the new API surface for the vault registry without removing any existing code. After this task, both the old (`discoverVaults` + `brain_path`) and new (`listVaults` + `vaults[]`) paths coexist — nothing breaks.

**Value delivered**: The building blocks every subsequent task depends on are in place, tested, and exported.

## Related Files

- `core/types.ts` — `BrainkitGlobalConfig` type update
- `core/vault.ts` — `expandTilde()`, `listVaults()`, `validateRegistry()`; `VaultEntry` type
- `core/index.ts` — export new symbols
- `core/__tests__/vault-registry.test.ts` — new test file

## Dependencies

- None (first task in the sequence)

## Acceptance Criteria

### Type update

- [x] `BrainkitGlobalConfig` in `core/types.ts` has `vaults: Array<{ path: string; name?: string }>` as a required field
- [x] `brain_path` field is made optional (`brain_path?: string`) — not yet removed (that's task 3)
- [x] No compile errors from existing code that reads `brain_path` (it's optional, not deleted)

### expandTilde

- [x] `expandTilde(p: string): string` exported from `core/vault.ts` (or a new `core/paths.ts`)
- [x] Handles: `"~"` → homedir, `"~/foo"` → `homedir/foo`, `"~\\foo"` → `homedir\\foo` (Windows)
- [x] Passes through absolute paths unchanged (`/home/bob/x` → `/home/bob/x`)
- [x] Passes through `~user/foo` unchanged (does NOT mangle it — this is NOT the current user's home)
- [x] Does NOT use the buggy `replace(/^~/, os.homedir())` pattern

### listVaults

- [x] `listVaults(): VaultEntry[]` exported from `core/vault.ts`
- [x] `VaultEntry` type: `{ name: string; path: string; resolvedPath: string; exists: boolean }`
- [x] Reads global config via `readGlobalConfig()`
- [x] Returns empty array if config is null or has no `vaults`
- [x] Resolves `~` in paths using `expandTilde()`
- [x] Derives `name` from `path.basename(resolvedPath)` when `name` is not explicit
- [x] Sets `exists` via `fs.existsSync(resolvedPath)`
- [x] **Never throws** — catches errors internally and returns empty array
- [x] Handles v1 configs gracefully (no `vaults` field → empty array)

### validateRegistry

- [x] `validateRegistry(entries: VaultEntry[]): string[]` exported from `core/vault.ts`
- [x] Returns array of error message strings (empty = valid)
- [x] Detects name collisions (two entries with same derived `name`)
- [x] Error message for collision names the conflicting paths and suggests adding explicit `name` fields
- [x] Does NOT throw — returns messages for the CLI to handle

### Tests

- [x] Unit tests for `expandTilde`: home expansion, passthrough, `~user` passthrough, Windows backslash
- [x] Unit tests for `listVaults`: empty config, no vaults field, single vault, multiple vaults, name derivation, explicit name override, non-existent path sets `exists: false`
- [x] Unit tests for `validateRegistry`: no collisions returns empty, collision returns message, multiple collisions
- [x] All new tests pass (`just test`)

## Verification

- [x] `just check` passes (lint + typecheck + tests)
- [x] `expandTilde("~/brain/personal")` resolves correctly in a test
- [x] `listVaults()` with a real v2 config returns resolved entries
- [x] `listVaults()` with a v1 config (no `vaults` field) returns `[]`
- [x] `validateRegistry()` with duplicate names returns error messages

## Deviations

- Tests use real filesystem (via `BRAINKIT_CONFIG_DIR` env var) instead of mocking `readGlobalConfig`, because `listVaults` calls `readGlobalConfig` internally within the same module and `vi.mock` doesn't intercept intra-module calls.
- Had to fix all test files and production code that creates `BrainkitGlobalConfig` literals to include the now-required `vaults: []` field. This pulled some work from Task 3 forward (config literal fixes, explicit brain_path null checks), but was necessary to keep `just check` green.
- Also fixed `!globalConfig.brain_path` boolean expressions to use explicit `=== undefined || === ""` checks to satisfy `strict-boolean-expressions` lint rule after making `brain_path` optional.

## Notes

- `brain_path` stays as optional (not removed) so existing code doesn't break. Task 3 removes it.
- `listVaults` must be resilient — the plugin calls it on every message. Throwing would crash the session.
- Keep `discoverVaults` fully intact and exported — it's still called by consumers until task 3.
