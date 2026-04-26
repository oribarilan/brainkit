# Multi-vault support

Replaces the US-wl series (US-wl-1 through US-wl-9 and US-work-life-split). The work/life separation problem is solved by supporting multiple independent vaults under a shared brain directory, rather than sub-vaults with scope threading.

## Problem

Users want to separate work and personal content. The original US-wl design solved this with scoped sub-vaults and three scope-aware agents, threading a `VaultScope` parameter through every vault operation, prompt section, and plugin hook. That approach was disproportionate to the problem -- 9 user stories touching every layer of a ~1,400 line codebase, with unresolved API blockers.

## Design

### Brain directory

A "brain" is a directory (typically a git repo) containing one or more vaults. Each vault is a subdirectory with its own `brainkit.toml` and full PARA structure. The brain directory itself is not a vault.

```
~/brain/                  <- brain_path points here
  work/                   <- vault
    brainkit.toml
    01_projects/
    02_areas/
      career/
        bragfile.md
    03_resources/
      contacts.md
    04_archive/
  life/                   <- vault
    brainkit.toml
    01_projects/
    02_areas/
    03_resources/
      contacts.md
    04_archive/
```

Each vault is fully independent. Its own `brainkit.toml`, its own user config, its own features, its own contacts. No shared state between vaults. Duplication across vault configs (e.g., user name) is acceptable and expected.

### Global config

`~/.config/brainkit/config.toml`:

```toml
version = 1
brain_path = "~/brain"
```

`vault_path` is renamed to `brain_path`. The `BrainkitGlobalConfig` type changes accordingly:

```typescript
interface BrainkitGlobalConfig {
  version: number;
  brain_path: string;
}
```

No migration code. This is a greenfield rename (no external users). The implementing agent should update the developer's own `~/.config/brainkit/config.toml` during implementation.

### Vault discovery

New function in `core/vault.ts`:

```typescript
function discoverVaults(brainPath: string): string[];
```

Scans immediate children of `brainPath` for directories containing `brainkit.toml`. Returns vault names (directory names) sorted alphabetically. Does not recurse -- only one level deep.

**Error handling:** Throws if `brainPath` does not exist or is not a directory. Callers handle the error appropriately -- the CLI shows a clear error message, the plugin logs and falls back to empty state.

### Vault path handoff

The selected vault path is communicated from the CLI launcher to the plugin via the `BRAINKIT_VAULT_PATH` environment variable.

```
CLI launcher                          Plugin (opencode process)
┌─────────────────────┐               ┌──────────────────────────┐
│ readGlobalConfig()  │               │ init:                    │
│   -> brain_path     │               │   vaultPath =            │
│                     │               │     process.env           │
│ discoverVaults()    │               │     .BRAINKIT_VAULT_PATH │
│   -> ["work","life"]│               │     ?? fallback()        │
│                     │               │                          │
│ select vault        │               │ All hooks use cached     │
│   -> "work"         │               │   vaultPath              │
│                     │               │                          │
│ Set env:            │  spawn        │ tui/sidebar read same    │
│ BRAINKIT_VAULT_PATH │──────────────>│   env var for display    │
│ = brain_path/work   │               │                          │
└─────────────────────┘               └──────────────────────────┘
```

The env var is inherited by the spawned opencode process, which loads both server and TUI plugins in the same process tree. Both `server.ts` and `side.tsx` can read `process.env.BRAINKIT_VAULT_PATH`.

### Vault selection

Handled by the CLI launcher, before any harness is spawned:

- **0 vaults** -> fresh brain, run onboarding (creates first vault)
- **1 vault** -> open it directly, no prompt
- **2+ vaults** -> interactive prompt unless `--vault <name>` was passed

Interactive prompting uses Node's built-in `readline` (no new dependency). Before prompting, check `process.stdin.isTTY` -- if not a TTY and no `--vault` flag was passed, error with: "Multiple vaults found. Use --vault <name> to select one."

Once selected, the resolved path (`brainPath + "/" + vaultName`) is set as `BRAINKIT_VAULT_PATH` and passed downstream. From that point, every vault operation works exactly as it does today.

### CLI

The launcher supports harness aliases and the `--vault` flag:

```
brainkit                        # auto-detect harness, auto-select vault
brainkit --vault work           # auto-detect harness, explicit vault
brainkit oc                     # opencode harness, auto-select vault
brainkit oc --vault life        # opencode harness, explicit vault
brainkit opencode --vault work  # long form harness alias
```

`--vault` works in all positions (bare or after harness alias). Vault selection happens before harness launch. Invalid vault name errors with a list of available vaults.

No new subcommands. Creating a new vault is done inside the session via the agent.

### Core changes

Minimal:

- **`core/types.ts`**: `BrainkitGlobalConfig.vault_path` renamed to `brain_path`. No new types.
- **`core/vault.ts`**: `readGlobalConfig()` returns `brain_path`. Add `discoverVaults()`. All other functions unchanged -- they receive a resolved `vaultPath` and operate within it.
- **`core/prompt-sections.ts`**: No changes. `SectionContext.vaultPath` points to the selected vault.
- **`core/system-prompt.ts`**: No changes.
- **`core/migrations.ts`**: No changes.
- **`core/agent-prompts.ts`**: No changes. Thinker, Consultant, Librarian agents work within whichever vault was selected.

### Plugin changes

- **`opencode/server.ts`**: Reads `BRAINKIT_VAULT_PATH` once at plugin init and caches it in a closure variable. All hooks (`system.transform`, `session.idle`, compaction) use the cached `vaultPath`. Fallback when env var is absent: read `brain_path` from global config, call `discoverVaults()`, auto-select if single vault, log warning if multiple.

```typescript
export default ((api) => {
  // Resolve vault path once at init
  const vaultPath = resolveVaultPath();

  api.hook("experimental.chat.system.transform", (system) => {
    // uses cached vaultPath
  });
}) satisfies ServerPlugin;

function resolveVaultPath(): string | undefined {
  // 1. Env var (set by CLI launcher)
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return fromEnv;

  // 2. Fallback: discover from brain_path
  const globalConfig = readGlobalConfig();
  if (!globalConfig?.brain_path) return undefined;
  const vaults = discoverVaults(globalConfig.brain_path);
  if (vaults.length === 1) return path.join(globalConfig.brain_path, vaults[0]);

  // 3. Multiple or zero vaults without env var -- can't resolve
  return undefined;
}
```

- **`opencode/tui.tsx`**: Show the active vault name in the TUI (sidebar or header) so the user knows which vault they're in.
- **`opencode/side.tsx`**: Display active vault name alongside existing stats. Reads `BRAINKIT_VAULT_PATH` and extracts the vault name from the path basename.
- **`cli/copilot.ts`**: Rename `vault_path` references to `brain_path`. Pass selected vault path when generating `.agent.md` files.
- **`scripts/copilot-status.js`**: Rename `vault_path` references to `brain_path`.

### Onboarding

**First launch (0 vaults):**

1. Agent detects fresh brain (no vaults discovered)
2. Asks user to name their first vault, suggests "work"
3. Creates `brain_path/<name>/` with full PARA structure + `brainkit.toml`
4. Runs today's onboarding Q&A inside that vault
5. The "professional, personal, or both" scope question is removed

**Adding a vault later (from within a session):**

User says "I want to create a life vault." The agent creates `brain_path/life/` with PARA structure, writes a fresh `brainkit.toml`, and runs onboarding Q&A for it. Next launch, brainkit discovers the new vault and prompts.

### Skills

No changes. Skills describe PARA-relative paths (`02_areas/career/bragfile.md`, etc.). They operate within whichever vault is active. The `skills/brainkit/SKILL.md` root skill could mention that brainkit supports multiple vaults, but this is optional since the system prompt provides the vault context.

### config.user.scope removal

The `scope` field (`"professional" | "personal" | "both"`) is removed from `BrainkitConfig.user`. It was a config-level concept for filtering prompt content. With multi-vault, scope is determined by which vault you opened. The field is deleted from the type, references are removed from prompt sections and onboarding.

### Docs, specs, and README

Update all documentation to reflect multi-vault:

- **`docs/features.md`**: Add multi-vault as a feature
- **`docs/config.md`**: Update global config docs (`vault_path` -> `brain_path`), document `BRAINKIT_VAULT_PATH` env var, document `--vault` flag
- **`docs/onboarding.md`**: Update to reflect vault creation flow, remove scope question
- **`README.md`**: Update any references to vault setup, mention multi-vault support
- **`specs/02-architecture.md`**: Update brain/vault directory structure if referenced
- **`AGENTS.md`**: Update structure diagram and vault operations section

## What this replaces

The entire US-wl series (9 user stories) is replaced:

| US-wl                                     | Disposition                                              |
| ----------------------------------------- | -------------------------------------------------------- |
| US-wl-1 (path abstraction + scope type)   | Replaced. No `VaultScope`, no `resolveVaultPath`.        |
| US-wl-2 (scoped vault ops)                | Eliminated. Vault ops are unchanged.                     |
| US-wl-3 (scoped prompt)                   | Eliminated. Prompt builder sees one vault.               |
| US-wl-4 (remove config.user.scope)        | Kept, simplified. Field removed, no replacement needed.  |
| US-wl-5 (skills update)                   | Eliminated. Skills are unchanged.                        |
| US-wl-6 (OpenCode agents + server plugin) | Eliminated. No scope agents, no API blocker.             |
| US-wl-7 (onboarding)                      | Simplified. Creates one vault, not two sub-vaults.       |
| US-wl-8 (Copilot agents)                  | Eliminated. No scope agents for Copilot.                 |
| US-wl-9 (docs update)                     | Simplified. Docs mention multi-vault, no scope language. |

## Units of work

This design breaks into 3 units. Units 2, 3a, 3b, and 3c can run in parallel after Unit 1 completes.

```
Lane 1: Unit 1 ────> Unit 2
                ┌──> Unit 3a (scope removal)
Lane 2: Unit 1 ─┤
                └──> Unit 3b (TUI)
Lane 3: Unit 3c (onboarding, docs, README, specs) ──────>
```

### Unit 1: Global config + vault discovery

- Rename `vault_path` to `brain_path` in `BrainkitGlobalConfig` and `readGlobalConfig()`
- Rename `vault_path` references in `cli/copilot.ts` (lines 141, 146) and `scripts/copilot-status.js` (lines 26, 32, 41)
- Add `discoverVaults(brainPath)` to `core/vault.ts`
- Export from `core/index.ts`
- Update developer's own `~/.config/brainkit/config.toml` (`vault_path` -> `brain_path`)
- Tests: discovery with 0, 1, 2+ vaults; non-vault directories ignored; nested directories not recursed; throws on missing/invalid brain path

### Unit 2: CLI vault selection + --vault flag

- Update `cli/launch.ts` to use `brain_path` and call `discoverVaults()`
- Add `--vault <name>` flag parsing to `cli/index.ts`
- Interactive prompt for multi-vault selection using Node `readline`
- TTY guard: error with guidance if `!process.stdin.isTTY` and 2+ vaults without `--vault`
- Set `BRAINKIT_VAULT_PATH` env var before spawning harness
- Error handling for invalid vault names (show available vaults)
- Harness alias support: `brainkit oc --vault life`
- Tests: flag parsing, vault resolution, error cases, --vault without value

### Unit 3: Onboarding + scope removal + TUI + docs

Split into three independent sub-units:

**Unit 3a: Scope removal**

- Remove `config.user.scope` from `BrainkitConfig` in `core/types.ts`
- Remove scope references from `core/prompt-sections.ts` (lines 67, 76, 83, 224, 230)
- Update `core/__tests__/prompt-sections.test.ts` (lines 28, 82, 88) -- remove/update scope tests
- Tests: compile-time type check, prompt sections don't reference scope

**Unit 3b: TUI vault name**

- Update `opencode/server.ts` to use `BRAINKIT_VAULT_PATH` with closure caching and fallback
- Update `opencode/side.tsx` to display active vault name
- Tests: plugin vault resolution (env var present, env var absent with single vault fallback)

**Unit 3c: Onboarding + docs**

- Update onboarding skill to create named vault under `brain_path`
- Update `docs/features.md`, `docs/config.md`, `docs/onboarding.md`
- Update `README.md`
- Update `specs/02-architecture.md`, `AGENTS.md`

## Tests

**Unit 1:**

- `discoverVaults` returns vault names for directories containing `brainkit.toml`
- `discoverVaults` ignores directories without `brainkit.toml`
- `discoverVaults` ignores files (non-directories)
- `discoverVaults` returns empty array for empty brain directory
- `discoverVaults` returns sorted results
- `discoverVaults` throws when brain path does not exist
- `discoverVaults` throws when brain path is not a directory (e.g., a file)
- `readGlobalConfig` returns `brain_path`

**Unit 2:**

- `--vault work` resolves to `brain_path/work`
- `--vault nonexistent` errors with available vault list
- `--vault` without a value shows usage error
- Single vault auto-selects without prompt
- Flag works with and without harness alias
- Non-TTY stdin with 2+ vaults and no `--vault` flag errors with guidance

**Unit 3a:**

- `config.user.scope` removed from type (compile-time check)
- Prompt sections do not reference `config.user.scope`
- Existing scope tests in `prompt-sections.test.ts` updated (regression check)

**Unit 3b:**

- Plugin resolves vault path from `BRAINKIT_VAULT_PATH` env var when present
- Plugin falls back to `brain_path` + `discoverVaults` for single-vault case when env var absent
- `side.tsx` displays vault name extracted from path

**Unit 3c:**

- Onboarding creates vault directory with PARA structure

## Not in scope

- Cross-vault search or operations
- Vault renaming or deletion
- Vault-level git configuration (the brain is one repo, vaults don't have independent git)
- Vault templates or presets
- Migration code for existing configs (manual update only)
- Async fs migration for vault.ts (pre-existing tech debt, unrelated)
