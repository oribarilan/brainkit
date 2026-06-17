# US-vault-registry

## Goal

Replace implicit vault discovery (scan subdirectories of `brain_path`) with an explicit vault registry in `config.toml`. Vaults are listed by absolute or `~`-prefixed path, can live anywhere on the filesystem, and the registry is the single source of truth for what vaults exist.

## Background

Today `discoverVaults()` scans immediate children of `brain_path` for directories containing `brainkit.toml`. This forces all vaults to live under one parent directory. Users who want a vault in a work-managed directory, a shared mount, or simply a different location have no path forward.

The all-vaults feature (shipped in v0.16.0) compounds this: `resolveVaultContext()` constructs vault paths as `path.join(brainPath, name)`, making the parent-child assumption structural.

A full registry removes the implicit scanning entirely. Existing users are migrated automatically on first launch after upgrade.

## Design

### Config schema (version 2)

```toml
version = 2
default_harness = "opencode"
skip_versions = []

[[vaults]]
path = "~/brain/personal"

[[vaults]]
path = "~/work/eng-vault"
name = "work"               # optional; defaults to basename of path
```

**Fields:**

- `brain_path` is deleted — not renamed. The registry is the source of truth; there is no "default location" field. Onboarding suggests `~/brain` as a hardcoded default in the prompt, not from config.
- `[[vaults]]` is an ordered array of vault entries. Each has a required `path` (absolute or `~`-prefixed) and optional `name` (display name; defaults to `path.basename(path)`).
- `version` bumps from 1 to 2.

### `BrainkitGlobalConfig` type change

```typescript
export interface BrainkitGlobalConfig {
  version: number;
  default_harness?: string;
  skip_versions?: string[];
  vaults: Array<{ path: string; name?: string }>;
}
```

### Core API changes

**Add:** `expandTilde(p: string): string` — shared utility in `core/`. Correctly handles only `~` or `~/...` (and `~\...` on Windows), not `~user/...`. Replaces the 3+ inline `replace(/^~/, os.homedir())` calls that are subtly buggy (they mangle `~user/foo` paths).

```typescript
export function expandTilde(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
```

**Add:** `listVaults(): VaultEntry[]` — reads global config, expands tildes, derives names from basename where not explicit. Returns empty array if no config or no vaults. **Never throws** — callers like the plugin must not crash over a config issue.

```typescript
export interface VaultEntry {
  name: string; // explicit or derived from basename
  path: string; // raw form from config (may contain ~)
  resolvedPath: string; // absolute, expanded
  exists: boolean; // fs.existsSync at resolve time
}
```

**Add:** `validateRegistry(entries: VaultEntry[]): string[]` — returns error messages (name collisions, missing paths). Called by CLI at launch to hard-error. Plugin never calls this.

**Remove from public API:** `discoverVaults(brainPath: string): string[]` — kept as a private/unexported helper for the migration to call "one last time." Removed from `core/index.ts` exports. Not deleted from source.

**Modify:** `resolveVaultContext()` — uses `listVaults()` instead of `brain_path` + `discoverVaults`. Resolution:

1. `BRAINKIT_VAULT_PATH` set → `{ mode: "single", vaultPath }`
2. Registry has 1 vault → `{ mode: "single", vaultPath }`
3. `BRAINKIT_ALL_VAULTS=1` → `{ mode: "all", vaults }` (reads from registry, not scanning)
4. No config / no vaults → `{ mode: "none" }`

Filters out non-existent vault paths silently (logs debug warning). If all paths are invalid, returns `{ mode: "none" }`.

**Modify:** `selectVault()` in CLI — picker populated from `listVaults()`. `--vault <name>` matches registry names. `--vault all` uses all registered vaults. Calls `validateRegistry()` at startup, hard-errors on collisions.

### Validation tiers

The split between `listVaults()` (resilient) and `validateRegistry()` (strict) is deliberate:

- **Plugin (runtime):** calls `listVaults()` only. Skips invalid entries with warnings. Never crashes the session.
- **CLI (launch-time):** calls `listVaults()` then `validateRegistry()`. Can hard-error before spawning the harness.

### Vault name uniqueness

Registry entries must have unique names (after `name ?? basename(path)` resolution). Uniqueness is enforced by `validateRegistry()` in the CLI, not by `listVaults()`. The CLI errors at launch with a clear message telling the user to add explicit `name` fields.

Name collisions cannot occur from migration (all pre-migration vaults are siblings under one directory, so basenames are unique). Collisions only arise from manual post-migration additions.

### Onboarding changes

When onboarding creates a new vault:

1. Ask the user where it should live (suggest `~/brain/<vault-name>` as the default)
2. Create the vault directory + PARA structure
3. **Register the vault** by appending to `[[vaults]]` in `config.toml`

The onboarding prompt in `core/onboarding-prompt.ts` currently instructs the agent to write `version = 1` and `brain_path = "..."`. This must be updated to emit v2 format with `[[vaults]]` entries. The onboarding skill's "Create the vault directory under the brain directory" wording becomes "Create the vault directory at the chosen path."

### All-vaults simplification

With a registry, "all vaults" is just "iterate the registered list." The `BRAINKIT_ALL_VAULTS` env var is still set by the CLI to signal multi-vault mode to the plugin. Its semantics change: from "scan `brain_path`" to "use all registered vaults." The plugin calls `listVaults()` to fulfill it.

`brainPath` is removed from `LaunchTarget` and `VaultSelection` types — it's vestigial with a registry. The all-vaults `LaunchTarget` becomes `{ mode: "all" }` (no payload needed; the plugin reads the registry directly).

## Migration

### Strategy: automatic, silent, on first CLI launch

No separate migration command. No user action required. The migration runs early in CLI startup via a dedicated `maybeMigrateGlobal()` called before `selectVault()`.

### Separate migration pipeline (not reusing vault migrations)

The existing `migrateConfig()` in `core/migrations.ts` is vault-config-specific — it runs from `readVaultConfig()` on vault `brainkit.toml` files only. Both config kinds use `version: 1`, and the shared `migrations[]` array has no notion of config kind. Pushing a global migration into this array would corrupt vault configs.

The global config migration is a standalone `migrateGlobalConfig()` function in a new `core/global-migration.ts`. It's a single v1→v2 transform — no generic pipeline needed (YAGNI for pre-1.0). The vault migration pipeline in `migrations.ts` stays unchanged.

`readGlobalConfig()` applies `migrateGlobalConfig()` as a read-only in-memory transform (so the plugin always sees v2 shape). The CLI additionally writes the result back to disk on first launch.

### Detection

Old format: `version === 1` AND has `brain_path` AND does NOT have `[[vaults]]`.

### Migration logic

1. Back up `config.toml` to `config.toml.v1.bak`
2. Read `brain_path` (raw, preserving `~` if present)
3. Resolve `~` for filesystem scanning only
4. Call `discoverVaults(resolvedBrainPath)` one last time
5. Build `[[vaults]]` entries, **preserving `~`**: if `brain_path` was `~/brain`, store entries as `~/brain/personal`, not `/Users/alice/brain/personal`. If `brain_path` was already absolute, store that form.
6. Delete `brain_path` from config (not rename)
7. Set `version = 2`
8. Write atomically: `config.toml.tmp` → `fs.renameSync` → `config.toml`

If `brain_path` does not exist on disk, leave `[[vaults]]` empty. The user hits onboarding on next launch.

If `discoverVaults` finds zero vaults, write an empty `[[vaults]]` array.

### Edge cases

- **Config doesn't exist at all** — not a migration case; user hits normal onboarding.
- **Config already at version 2** — no-op.
- **`brain_path` with `~`** — resolve for scanning, but preserve tilde in stored `[[vaults]]` paths.
- **Windows paths** — stored as-is; `path.resolve` handles normalization at runtime.
- **Concurrent launches** — two processes both detect v1 and both write v2. Safe: migration is deterministic/idempotent, both produce identical content. With atomic rename, the last write wins with correct data.
- **Comment loss** — `smol-toml` `stringify` does not preserve comments or field ordering. The migration rewrites the file and drops any hand-written comments. Acceptable for pre-1.0 (configs are almost always agent-generated). Document in changelog.

### Why not a separate `brainkit migrate` command

Brainkit deliberately has no subcommands. The CLI is a thin launcher. Automatic migration on startup is the established pattern (vault configs already auto-migrate in `readVaultConfig()`). The global config migration follows the same principle: transparent, silent, no user ceremony.

## Affected code

| File                                      | Change                                                                                                                                                                                                                                           | Severity if missed                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `core/types.ts`                           | Remove `brain_path`, add `vaults` to `BrainkitGlobalConfig`                                                                                                                                                                                      | Compile error                                        |
| `core/vault.ts`                           | Remove `discoverVaults` from exports, add `expandTilde()`, add `listVaults()`, add `validateRegistry()`                                                                                                                                          | —                                                    |
| `core/vault-context.ts`                   | Rewrite `resolveVaultContext()` to use `listVaults()` instead of `brain_path` + `discoverVaults`                                                                                                                                                 | **Plugin crash on every message**                    |
| `core/global-migration.ts`                | New file: `migrateGlobalConfig()` standalone function                                                                                                                                                                                            | —                                                    |
| `core/onboarding-prompt.ts`               | Update prompt text from v1 (`version = 1`, `brain_path`) to v2 (`version = 2`, `[[vaults]]`)                                                                                                                                                     | **New users get broken config**                      |
| `cli/launch.ts`                           | `selectVault()` uses `listVaults()` + `validateRegistry()`; add `maybeMigrateGlobal()` call; fix 3× `{ version: 1, brain_path: "" }` default literals (lines 383, 435, 493) to v2 shape; remove `brainPath` from `VaultSelection`/`LaunchTarget` | **Runtime crash** (defaults), type error (brainPath) |
| `cli/copilot.ts`                          | Remove `brain_path` fallback (line 685); use selected vault from `target.vaultPath`                                                                                                                                                              | **Runtime crash**                                    |
| `cli/claude.ts`                           | Remove `brain_path` fallback (line 353); use selected vault from `target.vaultPath`                                                                                                                                                              | **Runtime crash**                                    |
| `cli/self-update.ts`                      | Fix `{ version: 1, brain_path: "" }` default literal (line 305) to v2 shape                                                                                                                                                                      | Writes v1 config to disk                             |
| `cli/index.ts`                            | Update `VaultSelection` → `LaunchTarget` mapping (drop `brainPath`)                                                                                                                                                                              | Type error                                           |
| `opencode/server.ts`                      | No change needed — already uses `resolveVaultContext()`, which gets rewritten upstream                                                                                                                                                           | —                                                    |
| `skills/onboarding/SKILL.md`              | "Create the vault directory under the brain directory" → "at the chosen path"                                                                                                                                                                    | —                                                    |
| `skills/brainkit/SKILL.md`                | Update setup flow to mention registration                                                                                                                                                                                                        | —                                                    |
| `core/__tests__/vault-context.test.ts`    | Rewrite: mock `listVaults()` instead of `discoverVaults`                                                                                                                                                                                         | Test failure                                         |
| `cli/__tests__/vault-selection.test.ts`   | Rewrite: mock `listVaults()`, update `VaultSelection` shape                                                                                                                                                                                      | Test failure                                         |
| `cli/__tests__/harness-detection.test.ts` | Update `{ version: 1, brain_path }` mocks to v2 shape                                                                                                                                                                                            | Test failure                                         |
| `cli/__tests__/default.test.ts`           | Update mocks to v2 shape                                                                                                                                                                                                                         | Test failure                                         |
| `cli/__tests__/self-update.test.ts`       | Update mocks and `skip_versions` assertions to v2 shape                                                                                                                                                                                          | Test failure                                         |
| `cli/__tests__/copilot.test.ts`           | Update mocks                                                                                                                                                                                                                                     | Test failure                                         |
| `cli/__tests__/claude.test.ts`            | Update mocks                                                                                                                                                                                                                                     | Test failure                                         |
| `cli/__tests__/claude-isolation.test.ts`  | Update mocks                                                                                                                                                                                                                                     | Test failure                                         |
| `cli/__tests__/reset.test.ts`             | Update TOML literals (`brain_path`)                                                                                                                                                                                                              | Test failure                                         |
| `core/__tests__/vault-discovery.test.ts`  | Delete or convert to migration-path test (tests now-private function)                                                                                                                                                                            | Test failure                                         |

## Definition of Done

- [x] `config.toml` schema uses `[[vaults]]` array as source of truth for vault locations
- [x] `BrainkitGlobalConfig` type updated; `brain_path` removed entirely, `vaults` required
- [x] `expandTilde()` utility added, replacing all inline `replace(/^~/, ...)` calls
- [x] `listVaults()` reads registry, returns `VaultEntry[]` with resolved paths, never throws
- [x] `validateRegistry()` enforces name uniqueness, called by CLI only
- [x] `discoverVaults()` removed from public API (kept private for migration)
- [x] `resolveVaultContext()` uses `listVaults()` instead of scanning
- [x] `selectVault()` uses `listVaults()` for picker and `--vault` matching
- [x] `brainPath` removed from `VaultSelection` and `LaunchTarget` types
- [x] `copilot.ts` and `claude.ts` `brain_path` fallbacks replaced
- [x] All `{ version: 1, brain_path: "" }` default literals updated to v2 shape
- [x] `onboarding-prompt.ts` emits v2 config format
- [x] Onboarding registers new vaults in `config.toml` after creation
- [x] Automatic migration: v1 config silently upgraded to v2 on first launch
- [x] Migration uses separate pipeline (not vault `migrateConfig`)
- [x] Migration uses atomic write (temp + rename) and creates `.v1.bak` backup
- [x] Migration preserves `~` from original `brain_path` in stored vault paths
- [x] Migration handles: missing brain dir, zero vaults, tilde paths, already-migrated configs
- [x] All-vaults mode works with registry (no behavioral regression)
- [x] Single-vault mode works with registry (no regression)
- [x] Skills updated to remove brain-directory-as-parent assumptions
- [x] Existing tests updated; new tests for migration, `listVaults`, `validateRegistry`
- [x] `just check` passes (lint + typecheck + tests)

## Task Priority

1. `1-foundation.md` — Types, `expandTilde()`, `listVaults()`, `validateRegistry()`. Establishes the new API surface. Can coexist with existing code (nothing removed yet).
2. `2-global-migration.md` — Separate `migrateGlobalConfig()`, atomic write, backup, `maybeMigrateGlobal()` wiring. Calls `discoverVaults` internally (function still exists). Wire into CLI startup. Wire into `readGlobalConfig()` as read-only transform.
3. `3-rewire-consumers.md` — `resolveVaultContext()` → `listVaults()`. `selectVault()` → registry. `copilot.ts`/`claude.ts` → drop `brain_path` fallback. Default config literals → v2. Remove `brainPath` from types. Update ALL test mocks.
4. `4-onboarding.md` — Update `onboarding-prompt.ts` to emit v2 config. Update skill markdown. Registration appends `[[vaults]]`.
5. `5-cleanup.md` — Remove `discoverVaults` from `core/index.ts` exports (keep private for migration). Delete/convert `vault-discovery.test.ts`. Final test sweep.

## Cross-Cutting Concerns

### Backward compatibility

Pre-1.0, forward-only migrations. Downgrade is unsupported. No deprecated aliases, no `brain_path` kept for compat.

### Interaction with US-shared-vaults

Shared vaults are a vault property (`features.shared = true` in `brainkit.toml`), not a registry concern. The registry just lists paths. A shared vault is registered the same way as a personal vault. No conflict.

### Tilde handling

Store paths preserving `~` as the user provides them. Resolve at runtime via `expandTilde()`. The migration preserves `~` from the original `brain_path` — if `brain_path` was `~/brain`, vault entries become `~/brain/personal`, not `/Users/alice/brain/personal`.

The naive `replace(/^~/, os.homedir())` pattern (currently used inline in `vault-context.ts` and `launch.ts`) is subtly buggy — it mangles `~user/...` paths. `expandTilde()` replaces all instances with a correct implementation.

### `BRAINKIT_VAULT_PATH` env var

Still supported as an override (useful for testing, CI, one-off launches). Bypasses the registry entirely. Existing behavior, unchanged.

### `BRAINKIT_ALL_VAULTS` env var

Kept as a signal from CLI → plugin. Semantics change from "scan `brain_path` for vaults" to "use all registered vaults." The plugin calls `listVaults()` to fulfill it.

### `discoverVaults` lifetime

"Remove `discoverVaults` from codebase" in the Definition of Done means: remove from public API (`core/index.ts` exports). The function survives as a private/unexported helper called only by the v1→v2 migration. Task 5 handles this after all consumers are rewired.

### Edge cases: missing and broken vault paths

| Scenario                               | Plugin behavior                     | CLI behavior                                              |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| Registered path doesn't exist on disk  | Skip silently, log warning          | Warn; hard-error if user selected it via `--vault <name>` |
| All registered paths missing           | Return `{ mode: "none" }`           | Enter onboarding                                          |
| Path exists but has no `brainkit.toml` | Skip (not configured)               | Show in picker as `(not configured)`                      |
| `--vault all` with mixed valid/broken  | Use valid subset, warn about broken | Error if zero valid remain                                |

### Name derivation

`name` field is optional. When omitted, `path.basename(resolved_path)` is used. Examples:

- `path = "~/brain/personal"` → name = `"personal"`
- `path = "~/work/eng-vault"` → name = `"eng-vault"`
- `path = "~/brain/personal"` + `name = "home"` → name = `"home"`

### smol-toml round-tripping

`smol-toml` handles `[[vaults]]` arrays-of-tables correctly. Add a round-trip test (`parseToml(stringifyToml(...))`) to confirm `~` paths and array-of-tables survive serialization.
