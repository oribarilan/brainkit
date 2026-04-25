# US-wl-3: Scoped system prompt

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-1
**Unblocks:** US-wl-4, US-wl-5, US-wl-6, US-wl-8

## Goal

Make the system prompt builder scope-aware so each agent gets a system prompt describing only the relevant sub-vault.

## Changes

### `core/prompt-sections.ts`

**`SectionContext`** gains a `scope` field:

```typescript
export type SectionContext = {
  config: BrainkitConfig;
  vaultPath: string;
  mode: PromptMode;
  scope: VaultScope;  // new
  cwd?: string;
};
```

**Section builder changes:**

- `buildPreamble(ctx)` — no scope filtering needed (vault path is the same regardless)
- `buildIdentity(ctx)` — currently checks `config.user.scope`. Replace with `ctx.scope`: show work context when scope is `"work"` or `"all"`, show personal context when scope is `"life"` or `"all"`
- `buildVaultStructure(ctx)` — describe the dual sub-vault PARA structure. When scope is `"work"` or `"life"`, only describe that sub-vault's PARA tree. When `"all"`, describe both.
- `buildKeyFiles(ctx)` — scope-filter which key files are mentioned. `"work"`: bragfile + work contacts. `"life"`: life contacts only (no bragfile). `"all"`: all key files across both sub-vaults.
- `buildConventions(ctx)` — no scope filtering needed
- `buildBehavioralRules(ctx)` — add scope-specific rules. Work scope: "focus on professional context." Life scope: "focus on personal context, do not suggest bragfile entries." All: "you have access to both sub-vaults."
- `buildProjectContext(ctx)` — `detectProjectContext()` should look in `<scope>/01_projects/` instead of top-level `01_projects/`
- `buildBragReminder(ctx)` — only include when scope is `"work"` or `"all"`
- `buildOnboarding(ctx)` — no scope filtering (onboarding creates both sub-vaults)
- `buildProfileNudge(ctx)` — remove scope-related nudges (scope field is being removed in US-wl-4)

### `core/system-prompt.ts`

`buildSystemPrompt` gains `scope` in options:

```typescript
export function buildSystemPrompt(
  config: BrainkitConfig,
  vaultPath: string,
  options?: { cwd?: string; mode?: PromptMode; scope?: VaultScope },
): string
```

Default scope is `"all"`. Passes scope into `SectionContext`.

## Tests

File: `core/__tests__/prompt-sections.test.ts` (extend existing)

- `buildIdentity` with `scope: "work"` includes work description, excludes personal
- `buildIdentity` with `scope: "life"` includes personal description, excludes work
- `buildIdentity` with `scope: "all"` includes both
- `buildVaultStructure` with `scope: "work"` describes only `work/` PARA tree
- `buildKeyFiles` with `scope: "life"` does not mention bragfile
- `buildKeyFiles` with `scope: "work"` includes bragfile and work contacts
- `buildBragReminder` with `scope: "life"` returns empty string
- `buildBehavioralRules` with `scope: "life"` includes "do not suggest bragfile entries"
- `buildProjectContext` with `scope: "work"` looks in `work/01_projects/`

## Acceptance criteria

- [ ] `SectionContext` includes `scope: VaultScope`
- [ ] `buildSystemPrompt` accepts optional `scope` parameter
- [ ] All section builders respect scope
- [ ] `buildBragReminder` suppressed for `"life"` scope
- [ ] `buildBehavioralRules` includes scope-specific guidance
- [ ] Existing prompt section tests updated and passing
- [ ] New scope-specific tests passing
