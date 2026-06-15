# US-all-vaults

## Goal

Add an "all vaults" mode that loads context from every vault under the brain directory into a single session. The agent sees a dual-persona prompt with per-vault identity blocks, reads from all vaults, and routes writes to the contextually appropriate vault (asking when ambiguous).

## Background

Today each launch targets exactly one vault. Users with two or more vaults (e.g., work and personal) must pick one, losing access to the other's context. "All vaults" merges them into a single session so the agent knows both sides of the user's life and can operate across vaults.

## Design

### CLI & entry point

**Picker** (`cli/launch.ts:promptVaultSelection`): When 2+ vaults exist, prepend an "All vaults" option to the picker with a distinctive prefix (e.g., `+ All vaults`) so it stands apart from vault names.

**`--vault all` flag** (`cli/launch.ts:selectVault`): `"all"` is a reserved vault name. `selectVault` checks for the literal `"all"` before checking discovered vault names. If someone names a vault "all", the flag takes precedence (document this as a reserved name).

**Env vars**: When "all" is selected the CLI sets:
- `BRAINKIT_ALL_VAULTS=1` -- signals multi-vault mode
- `BRAINKIT_BRAIN_PATH=<path>` -- so the plugin can discover vaults itself

It does not set `BRAINKIT_VAULT_PATH`. The absence of that var combined with `BRAINKIT_ALL_VAULTS=1` is the signal.

**Return type**: `selectVault` returns `{ vaultPath: undefined, brainPath, allVaults: true }` in "all" mode -- new `allVaults` field on the existing return type.

### Plugin resolution

**`resolveVaultPath` becomes `resolveVaultContext`** (`opencode/server.ts`). Returns a discriminated union:

```typescript
type VaultContext =
  | { mode: "single"; vaultPath: string }
  | { mode: "all"; vaults: Array<{ name: string; path: string; config: BrainkitConfig }> }
  | { mode: "none" }
```

Resolution order:
1. `BRAINKIT_ALL_VAULTS=1` -> read `BRAINKIT_BRAIN_PATH`, call `discoverVaults()`, read each config -> `{ mode: "all", vaults }`.
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
2. **Per-vault identity blocks**: `buildIdentity` per vault, labeled by vault name (e.g., `## Vault: work`). Includes role, expertise, tone, descriptions, custom context.
3. **Per-vault key files**: `buildKeyFiles` per vault with absolute paths.
4. **Per-vault custom rules**: `buildCustomRules` per vault, labeled.
5. **Shared sections** (once): `buildVaultStructure`, `buildConventions` (uses first vault's tone -- alphabetical order from `discoverVaults()`), `buildBehavioralRules`.
6. **Write routing section** (new): Choose the appropriate vault based on context. If ambiguous, ask the user.
7. **Per-vault brag reminder**: `buildBragReminder` per vault, only for stale ones.
8. **Per-vault onboarding/profile nudge**: Run per vault, each short-circuits if not applicable.
9. **Project context**: `buildProjectContext` checks `cwd` against each vault's `01_projects/`.

### Compaction

In "all" mode, emit one combined condensed block:

```
## Brainkit Vault Context (Condensed -- All Vaults)
### work
- User: Ori (Staff Engineer)
- Path: ~/brain/work
- Features: bragfile, contacts
- Tone: direct

### personal
- User: Ori
- Path: ~/brain/personal
- Features: bragfile
- Tone: casual
```

### Session idle

- **Brag detection**: No change to detection logic. Toast stays generic -- the agent knows which vault to target from routing instructions.
- **Auto-commit**: Call `scheduleAutoCommit` for each vault path.

### Edge cases

- `"all"` is reserved. Warn if a vault named "all" is discovered.
- 1 vault + `--vault all`: enters multi-vault mode with one vault. Functionally identical to single-vault, no special-casing.
- 0 vaults + `--vault all`: returns onboarding state.
- "All vaults" picker option only shown when 2+ vaults exist.
- Non-TTY: `--vault all` works. No interactive prompt needed.
- Other harnesses (Copilot CLI, Claude Code): share `core/` builders, wiring is a follow-up.

## Definition of Done

- [ ] `--vault all` accepted by CLI, sets `BRAINKIT_ALL_VAULTS=1` + `BRAINKIT_BRAIN_PATH`
- [ ] Vault picker shows "All vaults" option when 2+ vaults exist
- [ ] `resolveVaultContext()` returns correct `VaultContext` for each env var combination
- [ ] `buildMultiVaultPrompt` produces per-vault identity blocks, shared conventions, and routing instructions
- [ ] Compaction hook emits condensed multi-vault block
- [ ] Auto-commit runs for each vault in "all" mode
- [ ] Brag reminder fires per vault, only for stale ones
- [ ] Edge cases handled: 0 vaults, 1 vault, reserved name warning
- [ ] Tests cover all acceptance criteria above
- [ ] Existing single-vault code path is unaffected (no regressions)

## Cross-Cutting Concerns

- The existing single-vault path must remain untouched. "All" mode is additive.
- `VaultContext` type is the new contract between plugin resolution and hooks -- design it carefully since both `server.ts` and the prompt builder depend on it.
- Conventions tone: in "all" mode, use the first vault's tone for the shared conventions section. Per-vault identity sections carry their own tone context.
- Write routing is prompt-driven (system prompt instructions), not code-enforced. The agent decides where to write based on context and asks when unclear.
