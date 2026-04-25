# Work/life sub-vault split

## Problem

In a flat PARA vault, personal and professional content sit side by side. When preparing for a performance review, personal brag entries can leak in. When doing personal planning, work projects are noise. The user runs separate sessions for work and life, and the agent should match which mental mode they're in.

## Design

### Vault structure

```
vault/
  brainkit.toml
  AGENTS.md
  work/
    01_projects/
    02_areas/
      career/
        bragfile.md
    03_resources/
    04_archive/
    contacts.md
  life/
    01_projects/
    02_areas/
    03_resources/
    04_archive/
    contacts.md
```

Two full PARA trees. Each has its own contacts file at the sub-vault root (not inside `03_resources/`). Bragfile lives in `work/02_areas/career/bragfile.md` only. Config stays at vault root. Two separate contacts files (people don't span).

Contacts live at the sub-vault root (`work/contacts.md`, `life/contacts.md`) rather than inside `03_resources/` for simplicity. Health checks and `allowedRootEntries` must account for this.

### Scope type

```typescript
type VaultScope = "all" | "work" | "life";
```

This is a session-level concept, not a config-level concept. The active agent determines the scope. `config.user.scope` is removed (see below).

### Path abstraction

All scope-aware path resolution goes through a single function:

```typescript
function resolveVaultPath(vaultPath: string, scope: VaultScope, relativePath: string): string
```

- `scope: "work"` resolves to `<vaultPath>/work/<relativePath>`
- `scope: "life"` resolves to `<vaultPath>/life/<relativePath>`
- `scope: "all"` is **only valid for read operations** that merge results (e.g., `searchContacts`). Write operations with `scope: "all"` must throw.

Every vault operation (`readBragfile`, `appendBragEntry`, `readContacts`, `addContact`, `runHealthChecks`, etc.) uses `resolveVaultPath` instead of composing paths inline. This keeps scope-prefix logic in one place.

### Agents

Three primary agents, cycled with Tab in OpenCode or selected via `/agent` in Copilot CLI:

| Agent | System prompt scope | Bragfile | Contacts | Use case |
|---|---|---|---|---|
| `bk` (default) | Full vault, both sub-vaults | work bragfile | both files | General use, cross-scope questions |
| `work` | `work/` only | yes | work contacts only | Focused work sessions, performance reviews |
| `life` | `life/` only | no | life contacts only | Personal planning, family, hobbies |

The launcher stays dumb. No `--work`/`--life` flags. Agent selection happens inside the session.

**Write routing for `bk` agent:** When the `bk` agent needs to write (add contact, log brag), the system prompt instructs it to ask the user which sub-vault to target. Reads merge both sub-vaults.

### Scope replaces config.user.scope

The existing `config.user.scope` field (`"professional" | "personal" | "both"`) is removed. Agent selection is the sole scope mechanism. The `buildIdentity()` function no longer checks `config.user.scope`; it receives scope from `SectionContext` based on the active agent.

### OpenCode implementation

The TUI plugin registers three primary agents via config. Each has a different `prompt` that calls `buildSystemPrompt` with a `scope` parameter. The server plugin's `system.transform` hook checks which agent is active and injects the scoped system prompt.

**Blocker:** The server plugin's `system.transform` hook receives `(system: string[]) => string[]` with no agent context. Before implementing US-6, investigate whether OpenCode's plugin API exposes the active agent identifier in hooks or events. If it doesn't, the design needs to change (e.g., per-agent prompt registration at TUI layer instead of `system.transform`).

### Brag detection scoping

The `session.idle` brag detection hook (auto-detection of accomplishment keywords) only fires when the `work` or `bk` agent is active. In the `life` agent, personal achievements should not trigger work bragfile suggestions. This requires agent awareness in the `session.idle` handler.

### Copilot CLI implementation

Three `.agent.md` files installed in the vault: `bk.agent.md`, `work.agent.md`, `life.agent.md`. Each has a different system prompt scoped to the right sub-vault.

### System prompt builder

`buildSystemPrompt` gains a `scope` parameter: `"all" | "work" | "life"`. Default is `"all"`.

- `"all"`: describes both sub-vaults, both contacts files, work bragfile
- `"work"`: only `work/` PARA, work contacts, bragfile, work-focused behavioral rules
- `"life"`: only `life/` PARA, life contacts, no bragfile, life-focused behavioral rules

`SectionContext` gains a `scope: VaultScope` field. Each `build*` function filters paths and content based on scope. Core receives scope as a plain parameter; the plugin layer maps agent to scope.

### Skills strategy

Skills stay scope-relative. Paths inside skills (e.g., `02_areas/career/bragfile.md`) remain unchanged and describe the PARA structure relative to the current sub-vault. The system prompt establishes which sub-vault the agent operates in, so skills don't need to know about the split.

Only the root brainkit skill (`skills/brainkit/SKILL.md`) needs updating to describe the dual sub-vault structure at the vault level.

### Onboarding

The agent creates both sub-vault PARA structures during setup. Phase 2 (professional life) populates `work/`. Phase 3 (personal life) populates `life/`. Contacts from each phase go to the respective contacts file.

## Impact

Everything below needs to change. This is a foundational refactor, broken into 9 user stories (see `specs/US-wl-*` files).

### Core logic
- `vault.ts` — add `resolveVaultPath()`, update `KEY_FILES` usage, all vault operations gain scope parameter
- `prompt-sections.ts` — `SectionContext` gains scope, each section builder filters to the right sub-vault
- `types.ts` — add `VaultScope` type, remove `config.user.scope`
- `runHealthChecks` — dual-level checks: root validation, then PARA within each sub-vault
- `isVaultFresh`, `detectVaultState` — operate on scoped paths

### Skills (all 7)
- Skills stay scope-relative (paths unchanged within skills)
- System prompt establishes sub-vault context
- Only `skills/brainkit/SKILL.md` needs structural updates

### OpenCode plugin
- `server.ts` — system prompt injection needs to determine which agent is active and inject the right scoped prompt; brag detection scoped to work/bk agents
- `tui.tsx` — register three primary agents (bk, work, life) with different prompts and colors
- `side.tsx` — sidebar stats: show scoped or aggregate data depending on active agent

### Copilot CLI
- Launcher installs three `.agent.md` files
- Three scoped system prompts generated

### Onboarding
- Creates both sub-vault PARA structures
- Routes professional setup to `work/`, personal to `life/`

### Auto-commit
- No change. Commits the whole vault regardless of scope.

### Docs
- All 8 feature docs need path updates and sub-vault awareness
- README philosophy section may need updating

### Tests

Test requirements for new scoped paths (priority order):

**P0 — Must have before merge:**
- `resolveVaultPath()` returns correct paths for all three scopes; rejects invalid scope; rejects `"all"` for write contexts; handles path traversal attempts
- Each `build*()` prompt section function with `scope: "work"` only includes work paths; `scope: "life"` excludes bragfile; `scope: "all"` includes both

**P1 — Should have:**
- `readBragfile` / `readContacts` route to scoped paths
- `readContacts` with `scope: "all"` reads and merges both files
- `runHealthChecks` validates both sub-vault PARA structures; reports per-sub-vault results
- `detectVaultState` / `isVaultFresh` work with new dual-tree structure

**P2 — Nice to have:**
- `searchContacts` across both files in `"all"` scope handles duplicate entries
- Agent-to-scope mapping in plugin layer

## User stories

This refactor is broken into 9 user stories, ordered by dependency:

| US | Description | Depends on | Files |
|---|---|---|---|
| US-wl-1 | Path abstraction + scope type | — | `specs/US-wl-1-path-abstraction.md` |
| US-wl-2 | Scoped vault operations | US-1 | `specs/US-wl-2-scoped-vault-ops.md` |
| US-wl-3 | Scoped system prompt | US-1 | `specs/US-wl-3-scoped-prompt.md` |
| US-wl-4 | Remove config.user.scope | US-3 | `specs/US-wl-4-remove-scope-config.md` |
| US-wl-5 | Skills update | US-3 | `specs/US-wl-5-skills-update.md` |
| US-wl-6 | OpenCode agents + server plugin | US-1, US-3 | `specs/US-wl-6-opencode-agents.md` |
| US-wl-7 | Onboarding for dual vaults | US-2 | `specs/US-wl-7-onboarding.md` |
| US-wl-8 | Copilot CLI agents | US-3 | `specs/US-wl-8-copilot-agents.md` |
| US-wl-9 | Docs update | US-2, US-3 | `specs/US-wl-9-docs.md` |

### Execution order

```
US-1 ──┬── US-2 ──┬── US-7
       │          └── US-9
       └── US-3 ──┬── US-4
                  ├── US-5
                  ├── US-6 (blocked on API investigation)
                  └── US-8
```

## Not in scope

- **Migration from flat vault** — existing users with flat PARA need a migration path (separate US)
- **Backward compatibility** — whether the split is mandatory or opt-in (decision needed before release)
- **Cross-scope operations** — moving a project from `work/` to `life/`
- **Shared resources** — resources that belong to neither sub-vault
- **Custom agents** — user-defined agents beyond the three primary ones
- **Copilot CLI deep integration** — `.agent.md` generation details (covered in US-wl-8)

## Open questions

1. **Backward compatibility:** Is the split mandatory? Can a user opt out and keep a flat vault? If not, what happens to existing users?
2. **Agent API:** Does OpenCode's plugin API expose the active agent identifier in `system.transform` hooks? If not, agent-to-scope mapping needs an alternative design.
