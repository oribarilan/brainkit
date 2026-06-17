# Rewire consumers to use registry

## Context

The big switchover: every consumer of `brain_path` and `discoverVaults` moves to `listVaults()` and the registry. After this task, `brain_path` and `discoverVaults` are dead code in production (still present in migration and tests).

**Value delivered**: The entire codebase runs on the vault registry. Old scanning is dead.

## Acceptance Criteria

### resolveVaultContext rewrite

- [x] Uses `listVaults()` instead of `brain_path` + `discoverVaults`
- [x] `BRAINKIT_VAULT_PATH` still takes precedence (now highest priority)
- [x] `BRAINKIT_ALL_VAULTS=1` reads from registry via `listVaults()` (filters to `exists: true`)
- [x] Skips non-existent vault paths silently
- [x] Returns `{ mode: "none" }` if all paths invalid or no vaults
- [x] No longer imports or calls `discoverVaults`
- [x] No longer reads `brain_path` from config

### Type changes

- [x] `brain_path` removed from `BrainkitGlobalConfig` (deleted entirely)
- [x] `brainPath` removed from `VaultSelection` type
- [x] `brainPath` removed from `LaunchTarget` type (all-vaults becomes `{ mode: "all" }` with no payload)

### selectVault rewrite

- [x] Uses `listVaults()` to get available vaults
- [x] Calls `validateRegistry()` — hard-errors on name collisions
- [x] `--vault <name>` matches against `VaultEntry.name`
- [x] `--vault all` uses all valid registered vaults
- [x] No-vaults case → onboarding
- [x] 1 vault → auto-select
- [x] 2+ vaults → interactive picker (sourced from registry)

### copilot.ts and claude.ts

- [x] `brain_path` fallback branch removed
- [x] Explicit `target.mode === "onboarding"` handling
- [x] No direct `readGlobalConfig().brain_path` access remains

### Default config literals

- [x] All `{ version: 1, brain_path: "", vaults: [] }` → `{ version: 2, vaults: [] }`
- [x] cli/launch.ts (3 locations), cli/self-update.ts (1 location)

### cli/index.ts

- [x] VaultSelection → LaunchTarget mapping simplified (types now identical, direct assignment)

### Inline tilde expansion replaced

- [x] All `replace(/^~/, os.homedir())` calls removed (code using it was rewritten)

### Tests

- [x] `vault-context.test.ts` rewritten: mocks `listVaults` instead of `discoverVaults`
- [x] `vault-selection.test.ts` rewritten for new shapes (no `brainPath`)
- [x] `default.test.ts` updated (removed `brain_path`, updated `discoverVaults` → `listVaults`)
- [x] `harness-detection.test.ts` mocks updated to v2 config shape
- [x] `self-update.test.ts` mocks updated to v2 config shape
- [x] `global-migration.test.ts` type error fixed (cast through unknown)
- [x] All tests pass (466 tests)

## Verification

- [x] `just check` passes (lint + typecheck + tests + format + package integrity)
- [x] No remaining `brain_path` in production code
- [x] No remaining `discoverVaults` calls in production code (except `global-migration.ts`)
- [x] No remaining inline `replace(/^~/, os.homedir())`
