# US-wl-4: Remove config.user.scope

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-3
**Unblocks:** nothing (cleanup)

## Goal

Remove the `config.user.scope` field from the config type and all references. Agent selection is the sole scope mechanism.

## Changes

### `core/types.ts`

Remove from `BrainkitConfig.user`:

```typescript
// Remove this field:
scope?: "professional" | "personal" | "both";
```

The `work` and `personal` description fields stay (they hold user-provided descriptions used by the system prompt):

```typescript
user: {
  name: string;
  role?: string;
  expertise?: string;
  tone?: string;
  // scope field removed
  work?: { description?: string };
  personal?: { description?: string };
  customization?: { rules?: string[] };
};
```

### `core/prompt-sections.ts`

- `buildIdentity()` — remove `config.user.scope` checks (lines 82-83). These are now handled by `ctx.scope` (done in US-wl-3).
- `buildProfileNudge()` — remove the nudge for missing `scope` field (lines 229-233).

### `core/migrations.ts`

Add a migration that strips `scope` from existing configs (non-breaking migration):

```typescript
{
  version: <next>,
  breaking: false,
  migrate: (config) => {
    if (config.user?.scope) {
      delete config.user.scope;
    }
    return config;
  },
}
```

### `opencode/server.ts`

- Remove `Scope: ${vaultConfig.user.scope ?? "professional"}` from the compaction hook (line 49). Replace with scope derived from active agent context (or remove if agent context isn't available yet).

### `skills/onboarding/SKILL.md`

- Remove any question about "professional, personal, or both" scope during onboarding Q&A. The dual sub-vault structure replaces this question.

## Tests

- `core/__tests__/prompt-sections.test.ts` — remove or update tests that assert on `config.user.scope` behavior
- `core/__tests__/migrations.test.ts` — add test for scope removal migration
- Verify no runtime references to `config.user.scope` remain (grep check)

## Acceptance criteria

- [ ] `scope` field removed from `BrainkitConfig` type
- [ ] Migration strips `scope` from existing configs
- [ ] No runtime code references `config.user.scope`
- [ ] Profile nudge no longer asks about scope
- [ ] Onboarding no longer asks scope question
- [ ] All tests pass
