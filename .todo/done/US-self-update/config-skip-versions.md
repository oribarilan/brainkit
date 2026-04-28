# Task: config-skip-versions

## Context

The "Skip this version" feature needs a place to persist skipped versions across launches. Add `skip_versions?: string[]` to the global config type so it's stored in `~/.config/brainkit/config.toml`.

**Value delivered**: Global config supports version skip list; existing config read/write continues working.

## Related Files

- `core/types.ts` — `BrainkitGlobalConfig` type
- `core/vault.ts` — `readGlobalConfig()` / `writeGlobalConfig()`

## Dependencies

- None

## Acceptance Criteria

- [ ] `BrainkitGlobalConfig` in `core/types.ts` has `skip_versions?: string[]`
- [ ] Existing configs without `skip_versions` parse correctly (field is optional)
- [ ] Writing a config with `skip_versions = ["0.7.0"]` produces valid TOML that roundtrips correctly
- [ ] `just check` passes

## Verification

- **Automated**: Add a unit test in `core/__tests__/` that roundtrips a config with `skip_versions` through `smol-toml` parse/stringify
- **Ad-hoc**: `just lint` — no type errors

## Scope Estimate

Small
