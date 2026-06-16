# US-all-vaults

## Goal

Add an "all vaults" mode that loads context from every vault under the brain directory into a single session. The agent sees a dual-persona prompt with per-vault identity blocks, reads from all vaults, and routes writes to the contextually appropriate vault (asking when ambiguous).

## Background

Today each launch targets exactly one vault. Users with two or more vaults (e.g., work and personal) must pick one, losing access to the other's context. "All vaults" merges them into a single session so the agent knows both sides of the user's life and can operate across vaults.

Designed for 2-4 vaults. Prompt size grows linearly with vault count; no hard cap, but the builder should warn (log, not block) when more than 5 vaults are loaded.

## Design

### CLI & entry point

**Picker** (`cli/launch.ts:promptVaultSelection`): When 2+ vaults exist, prepend an "All vaults" option to the picker with a distinctive prefix (e.g., `+ All vaults`) so it stands apart from vault names. If a vault is literally named `all`, skip it from the picker list (the user can still open it with `--vault` by its full path, but the picker avoids the visual collision).

**`--vault all` flag** (`cli/launch.ts:selectVault`): `"all"` is a reserved vault name (case-insensitive: `all`, `All`, `ALL` all match). `selectVault` checks for the reserved name before checking discovered vault names. If someone names a vault "all", the flag takes precedence (document this as a reserved name). Emit a warning at launch when a vault named "all" (any case) is discovered.

**Env vars**: When "all" is selected the CLI sets:

- `BRAINKIT_ALL_VAULTS=1` -- signals multi-vault mode

It does not set `BRAINKIT_VAULT_PATH`. The absence of that var combined with `BRAINKIT_ALL_VAULTS=1` is the signal. The plugin reads `brain_path` from `readGlobalConfig()` -- no new `BRAINKIT_BRAIN_PATH` env var. The global config is the single source of truth for the brain directory. (The plugin already calls `readGlobalConfig()` in its fallback path.)

**Return type**: `selectVault` returns a discriminated union:

```typescript
type VaultSelection =
  | { mode: "single"; vaultPath: string; brainPath: string }
  | { mode: "all"; brainPath: string }
  | { mode: "onboarding" };
```

This replaces the current `{ vaultPath: string | undefined; brainPath: string | undefined }`. The previous design used `vaultPath: undefined` for both onboarding and all-vaults mode, which is ambiguous -- every downstream consumer (`launchOpenCode`, `launchCopilot`, `launchClaude`) uses `vaultPath === undefined` to detect onboarding. The discriminated union eliminates this collision.

**Harness launch signature**: The `Harness` interface changes from `launch: (args: string[], vaultPath?: string) => void` to accept a `LaunchTarget`:

```typescript
type LaunchTarget = { mode: "single"; vaultPath: string } | { mode: "all"; brainPath: string } | { mode: "onboarding" };

interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[], target: LaunchTarget) => void;
}
```

`cli/index.ts` maps `VaultSelection` to `LaunchTarget` and passes it through `launchHarness` / `detectAndLaunch`. Each launcher pattern-matches on `target.mode`.

**Harness gating**: `--vault all` is only supported on OpenCode for the initial PR. When `target.mode === "all"` reaches `launchCopilot` or `launchClaude`, they error immediately: `"All-vaults mode is not yet supported for <harness>. Use --vault <name> to pick one."` This prevents the silent-onboarding bug where `vaultPath: undefined` would trigger the setup flow.

### Plugin resolution

**`resolveVaultPath` becomes `resolveVaultContext`**. The `VaultContext` type and `resolveVaultContext` function live in `core/` (not `opencode/server.ts`) so all harnesses can share them. `opencode/server.ts` calls through to the core function.

```typescript
// core/types.ts
type VaultContext =
  | { mode: "single"; vaultPath: string }
  | { mode: "all"; vaults: Array<{ name: string; path: string; config: BrainkitConfig }> }
  | { mode: "none" };
```

Resolution order:

1. `BRAINKIT_ALL_VAULTS=1` -> read `brain_path` from `readGlobalConfig()`, call `discoverVaults()`, read each config -> `{ mode: "all", vaults }`. If any vault's config is unreadable, skip that vault and log a warning (don't abort the whole session for one bad config).
2. `BRAINKIT_VAULT_PATH` set -> `{ mode: "single", vaultPath }`.
3. Fallback discovery (no env vars) -> auto-select if 1 vault, else `{ mode: "none" }`.

Hooks dispatch to `buildSystemPrompt` (single) or `buildMultiVaultPrompt` (all) based on mode.

### Multi-vault prompt builder

New function in `core/system-prompt.ts`:

```typescript
buildMultiVaultPrompt(
  vaults: Array<{ name: string; path: string; config: BrainkitConfig }>,
  options?: { cwd?: string; mode?: PromptMode }
): string
```

Prompt structure:

1. **Multi-vault preamble** (new): "You have access to multiple brainkit vaults" + vault name/path table.
2. **Per-vault identity blocks**: `buildIdentity` per vault, labeled by vault name (e.g., `## Vault: work`). Includes role, expertise, tone, descriptions, custom context. **Tone is per-vault here** -- each identity block carries its own tone directive (e.g., "direct tone for this vault").
3. **Per-vault key files**: `buildKeyFiles` per vault with absolute paths.
4. **Per-vault custom rules**: `buildCustomRules` per vault, labeled.
5. **Shared sections** (once): `buildVaultStructure`, `buildConventions` (tone-neutral -- omits the tone line, since tone is per-vault in the identity blocks), `buildBehavioralRules`.
6. **Write routing section** (new): Choose the appropriate vault based on context. Use the tone of the vault you're writing into. If ambiguous, ask the user.
7. **Per-vault brag reminder**: `buildBragReminder` per vault, only for stale ones. Cap at 2 reminders; if more vaults are stale, aggregate into a single line listing them.
8. **Per-vault onboarding/profile nudge**: Run per vault, each short-circuits if not applicable. Cap at 1 fresh-vault nudge; if multiple vaults are fresh, combine into a single "These vaults are fresh: ..." section.
9. **Project context**: `buildProjectContext` checks `cwd` against each vault's `01_projects/`. If the same project name exists in multiple vaults, list all matches with a note about ambiguity.

### Compaction

In "all" mode, emit one combined condensed block:

```
## Brainkit Vault Context (Condensed -- All Vaults)
### `work`
- User: Ori (Staff Engineer)
- Path: ~/brain/work
- Features: bragfile, contacts
- Tone: direct

### `personal`
- User: Ori
- Path: ~/brain/personal
- Features: bragfile
- Tone: casual
```

Vault names rendered as inline code to defend against markdown-special characters in names.

### Session idle

- **Brag detection**: No change to detection logic. Toast stays generic -- the agent knows which vault to target from routing instructions.
- **Auto-commit**: Prerequisite refactor -- `core/auto-commit.ts` currently uses a single module-level `commitTimer`. Calling `scheduleAutoCommit` for vault A then vault B clears A's timer; only B gets committed. Refactor to a `Map<string, Timer>` keyed by vault path. `flushAutoCommit` becomes `flushAllAutoCommits` (no args) -- iterates and flushes all tracked vaults. The single-vault code path is unaffected (one entry in the map). This refactor lands as a prerequisite PR before the main all-vaults work.

### TUI sidebar

`opencode/side.tsx` reads `BRAINKIT_VAULT_PATH` directly. In all-vaults mode that var is unset, so the sidebar would show "No vault configured."

For the initial PR: accept the degradation. The sidebar shows "All vaults" as the vault name with no per-vault stats. Follow-up: render stacked per-vault summaries (abbreviated stats, one block per vault). This is a TUI-only concern and doesn't block the core feature.

### Edge cases

- `"all"` is reserved (case-insensitive). Warn if a vault named "all" (any case) is discovered.
- A vault literally named `all` is skipped from the picker list but remains accessible by full path.
- 1 vault + `--vault all`: enters multi-vault mode with one vault. Functionally identical to single-vault, no special-casing.
- 0 vaults + `--vault all`: error -- "No vaults found. Run brainkit to set up your first vault." (Not onboarding -- the user explicitly asked for all-vaults.)
- "All vaults" picker option only shown when 2+ vaults exist.
- Non-TTY: `--vault all` works. No interactive prompt needed.
- Other harnesses (Copilot CLI, Claude Code): `--vault all` errors cleanly ("not yet supported for this harness"). Core builders are shared; harness wiring is a follow-up.
- Partial vault failure: if one vault's `brainkit.toml` is malformed, skip it with a warning. The session loads the remaining vaults.
- Project context collision: if `cwd` matches a project in multiple vaults, list all matches with an ambiguity note.
- Two vaults in the same git repo: `scheduleAutoCommit` called for each vault path runs against the same `.git`. Harmless (second commit is a no-op) but wasteful. Accepted.

## Definition of Done

- [x] `selectVault` returns `VaultSelection` discriminated union (not optional fields)
- [x] `Harness.launch` accepts `LaunchTarget` (not `vaultPath?: string`)
- [x] `--vault all` accepted by CLI, sets `BRAINKIT_ALL_VAULTS=1` (no `BRAINKIT_BRAIN_PATH`)
- [x] `--vault all` with Copilot/Claude errors clearly ("not yet supported")
- [x] Vault picker shows "All vaults" option when 2+ vaults exist
- [x] Reserved name `"all"` is case-insensitive
- [x] `VaultContext` type lives in `core/types.ts`
- [x] `resolveVaultContext()` returns correct `VaultContext` for each env var combination
- [x] `resolveVaultContext()` skips vaults with unreadable configs (warns, doesn't abort)
- [x] `buildMultiVaultPrompt` produces per-vault identity blocks (with per-vault tone), shared conventions (tone-neutral), and routing instructions
- [x] Compaction hook emits condensed multi-vault block
- [x] Auto-commit refactored to per-vault `Map<string, Timer>` (prerequisite PR)
- [x] `flushAllAutoCommits` flushes all tracked vaults
- [x] Brag reminder fires per vault, capped at 2
- [x] TUI sidebar shows "All vaults" label (degraded, no per-vault stats)
- [x] Edge cases handled: 0 vaults error, 1 vault, reserved name warning, partial failure
- [x] Tests cover all acceptance criteria above
- [x] Existing single-vault code path is unaffected (no regressions)

## Cross-Cutting Concerns

- The existing single-vault path must remain untouched. "All" mode is additive.
- `VaultContext` type is the new contract between plugin resolution and hooks. Lives in `core/types.ts` since both `server.ts`, the prompt builder, and future harness launchers depend on it.
- Tone is per-vault (in identity blocks), not shared. The conventions section is tone-neutral.
- Write routing is prompt-driven (system prompt instructions), not code-enforced. The agent decides where to write based on context and asks when unclear.
- The auto-commit refactor (singleton timer -> per-vault map) is a prerequisite that ships separately. It has no behavioral change for single-vault mode.
- Copilot/Claude launchers have 3-4 touch points each for future all-vaults support: spawn `cwd` (probably `brainPath`), prompt generation (`buildMultiVaultPrompt` instead of `buildSystemPrompt`), env vars, and auto-commit/hook scripts. The core interfaces are designed so this follow-up is mechanical.
