# Global config migration (v1 → v2)

## Context

Adds automatic, silent migration of the global `config.toml` from v1 (with `brain_path`) to v2 (with `[[vaults]]` registry). Uses a SEPARATE migration pipeline from the vault config migrations — the existing `migrateConfig()` in `core/migrations.ts` is vault-specific and must not be reused (both config kinds use `version: 1`, and the shared pipeline has no concept of config kind).

**Value delivered**: Existing users transparently upgrade to the registry format on first launch. No user action required.

## Related Files

- `core/global-migration.ts` — new file: `migrateGlobalConfig()` and `maybeMigrateGlobal()`
- `core/vault.ts` — `readGlobalConfig()` applies migration as read-only transform
- `cli/index.ts` — `maybeMigrateGlobal()` wired into CLI startup before `selectVault()`
- `core/__tests__/global-migration.test.ts` — new test file (15 tests)

## Dependencies

- Task 1 (foundation) — needs updated `BrainkitGlobalConfig` type with `vaults` field ✅

## Acceptance Criteria

### Separate pipeline

- [x] New file `core/global-migration.ts` (not modifying `core/migrations.ts`)
- [x] `migrateGlobalConfig(raw: Record<string, unknown>): BrainkitGlobalConfig` — single function, not a generic pipeline
- [x] Does NOT push anything into the vault `migrations[]` array
- [x] Vault `migrateConfig()` and `CURRENT_SCHEMA_VERSION` are untouched

### Detection

- [x] Detects v1: `version === 1` (or missing) AND `brain_path` exists AND no `vaults` field
- [x] Returns config unchanged if already v2 (or higher)
- [x] Returns config unchanged if v1 without `brain_path` (edge case: manually created partial config)

### Migration logic

- [x] Reads `brain_path` raw (preserving `~`)
- [x] Resolves `~` for filesystem scanning only (via `expandTilde`)
- [x] Calls `discoverVaults(resolvedBrainPath)` to find existing vault directories
- [x] Builds `[[vaults]]` entries preserving `~` from original: if `brain_path` was `~/brain`, entries are `~/brain/personal`, not `/Users/alice/brain/personal`
- [x] If `brain_path` was already absolute, entries use that absolute form
- [x] Deletes `brain_path` from output (not renamed to `default_location`)
- [x] Sets `version = 2`
- [x] Preserves `default_harness` and `skip_versions` if present

### Safety

- [x] Atomic write: writes to `config.toml.tmp` then `fs.renameSync` to `config.toml`
- [x] Backup: copies `config.toml` to `config.toml.v1.bak` before rewrite
- [x] Idempotent: running twice produces same result (safe for concurrent launches)

### Edge cases

- [x] `brain_path` doesn't exist on disk → `[[vaults]]` is empty array, migration still completes
- [x] `discoverVaults` finds zero vaults → empty `[[vaults]]` array
- [x] Config doesn't exist at all → not a migration case, no-op
- [x] Config has no `version` field → treated as v1

### readGlobalConfig integration

- [x] `readGlobalConfig()` in `core/vault.ts` applies `migrateGlobalConfig()` as an in-memory transform on the parsed result (so the plugin always sees v2 shape even before CLI writes)
- [x] `readGlobalConfig()` does NOT write to disk — read-only transform

### CLI wiring

- [x] `maybeMigrateGlobal()` function in `core/global-migration.ts`
- [x] Called early in CLI startup, before `selectVault()` (wired in `cli/index.ts`)
- [x] Reads raw config, detects v1, writes v2 (with atomic write + backup)
- [x] Logs nothing on success (silent migration)
- [x] Does not crash on migration failure — catches all errors

### Tests

- [x] v1 config with `brain_path` and 2 discovered vaults → v2 with correct `[[vaults]]`
- [x] v1 config with `brain_path = "~/brain"` → entries preserve tilde (`~/brain/work`)
- [x] v1 config with absolute `brain_path` → entries use absolute paths
- [x] v1 config with non-existent `brain_path` → v2 with empty vaults
- [x] v1 config with zero discovered vaults → v2 with empty vaults
- [x] Already v2 → no-op (unchanged)
- [x] v1 without `brain_path` → minimal migration (add empty `vaults`, bump version)
- [x] `default_harness` and `skip_versions` are preserved through migration
- [x] Round-trip test: `parseToml(stringifyToml(migratedConfig))` preserves `[[vaults]]` and `~` paths

## Verification

- [x] `just check` passes (468 tests, lint clean, typecheck clean)
- [x] Backup `.v1.bak` created on migration (tested)
- [x] Atomic write works (tested)
- [x] Vault `migrateConfig` pipeline unaffected (existing tests still pass)

## Deviations

- `maybeMigrateGlobal()` placed in `core/global-migration.ts` rather than `cli/launch.ts` since it's core migration logic. Wired into `cli/index.ts` directly.
- Circular import between `vault.ts` and `global-migration.ts` is safe because all exports are function declarations (hoisted in ESM).
