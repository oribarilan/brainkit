# Cleanup: remove dead code, final test sweep

## Acceptance Criteria

- [x] `discoverVaults` no longer exported from `core/index.ts`
- [x] `discoverVaults` still exists in `core/vault.ts` (used by `core/global-migration.ts`)
- [x] No production code outside `global-migration.ts` calls `discoverVaults`
- [x] `vault-discovery.test.ts` kept (imports directly from `../vault.js`)
- [x] All mock configs in CLI test files updated to v2 format (no `brain_path`)
- [x] `reset.test.ts` TOML literals updated to v2 format
- [x] smol-toml round-trip test added for `[[vaults]]`
- [x] `just check` passes
- [x] No `brain_path` in production code (only migration + test files)
- [x] No `discoverVaults` in `core/index.ts`
- [x] No remaining `replace(/^~/` in production code
