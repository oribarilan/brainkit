# US-wl-6: OpenCode agents + server plugin

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-1, US-wl-3
**Unblocks:** nothing

## Goal

Register three scope-based agents (bk, work, life) in the OpenCode TUI plugin and update the server plugin to inject scope-appropriate system prompts and scope brag detection.

## Blocker

**Before implementing:** Investigate whether OpenCode's plugin API exposes the active agent identifier in:
- `system.transform` hook callback
- `session.idle` event callback
- Any other accessible API surface

If the API does NOT expose agent context:
- Option A: Register per-agent system prompts at TUI layer (each agent's config includes its own prompt)
- Option B: Store active scope in a plugin-level variable, updated on agent switch event

Do not proceed with implementation until the API question is resolved.

## Changes

### `opencode/tui.tsx`

Register three agents via `api.agent()` (or equivalent API):

```typescript
// bk — default agent, full vault scope
api.agent({
  name: "bk",
  description: "Full vault access (work + life)",
  // prompt or system injection depends on API investigation
});

// work — focused work scope
api.agent({
  name: "work", 
  description: "Work sub-vault only",
});

// life — focused life scope
api.agent({
  name: "life",
  description: "Life sub-vault only",
});
```

Each agent should have a distinct visual identity (color, label) in the TUI.

Handle existing agents: the current Thinker, Consultant, and Librarian agents (from `core/agent-prompts.ts`) are role-based, not scope-based. Decision needed:
- Keep them as additional agents alongside bk/work/life?
- Retire them?
- Make them scope-aware (each role x scope combination)?

This should be a conscious choice during implementation, not an accident.

### `opencode/server.ts`

**System prompt injection** — update `system.transform` hook to determine active agent and inject the scoped system prompt:

```typescript
api.hook("experimental.chat.system.transform", (system) => {
  const scope = getActiveScope(); // depends on API investigation
  const prompt = buildSystemPrompt(vaultConfig, globalConfig.vault_path, { scope });
  // ... inject prompt
});
```

**Brag detection scoping** — update `session.idle` brag detection to only fire when the active agent is `bk` or `work`:

```typescript
api.event("session.idle", async (event) => {
  const scope = getActiveScope();
  if (scope === "life") return; // skip brag detection for life agent
  // ... existing brag detection logic
});
```

**Compaction hook** — update scope reference from `config.user.scope` to active agent scope.

### `opencode/side.tsx`

Update sidebar to show scope-appropriate stats:
- `work` agent: work brag count, work contacts count
- `life` agent: life contacts count (no brag stats)
- `bk` agent: aggregate stats (total brags, total contacts across both)

## Tests

No existing tests for the plugin layer. Testing depends on API investigation results. At minimum:
- Agent-to-scope mapping function should be unit tested
- Verify brag detection does not fire for life scope

## Open questions

1. How does the plugin API expose the active agent? (blocker)
2. What happens to the existing Thinker/Consultant/Librarian agents?
3. Should each agent have a distinct TUI color/theme?

## Acceptance criteria

- [ ] Three agents registered and selectable in OpenCode TUI
- [ ] System prompt varies by active agent scope
- [ ] Brag detection suppressed for life agent
- [ ] Sidebar stats reflect active scope
- [ ] API investigation documented (which approach was used)
