# Streamlined first-run onboarding

## Problem

When a new user runs `brainkit` with no existing vault or configuration, the CLI hard-exits at `cli/launch.ts:152-155` with "No brain configured." The harness never launches, the agent never loads, and the user gets a dead end.

Even if the user manually creates `~/.config/brainkit/config.toml`, the server plugin silently returns when `readVaultConfigSimple()` throws (no `brainkit.toml`), so no brainkit system prompt is injected. The agent behaves like vanilla OpenCode.

The onboarding skill exists (`skills/onboarding/SKILL.md`) and the "Fresh Vault Detected" path exists in `prompt-sections.ts`, but neither can activate because both require a `brainkit.toml` that doesn't exist yet. Chicken-and-egg.

The first-run experience should be: run `brainkit`, start talking, the agent guides you through everything.

## Design

### Overview

Remove the hard exit. Launch the harness immediately with no vault. The server plugin detects the missing vault and injects a self-contained onboarding system prompt. The agent guides the user conversationally through setup, creates all files mid-conversation, and the plugin transitions to the normal system prompt automatically.

### CLI changes

**`cli/launch.ts` -- `selectVault()`**

When `readGlobalConfig()` returns `null` (no `config.toml`), return undefined paths instead of calling `process.exit(1)`:

```typescript
// Before
if (globalConfig === null || !globalConfig.brain_path) {
  console.error("  [brainkit] No brain configured...");
  process.exit(1);
}

// After
if (globalConfig === null || !globalConfig.brain_path) {
  return { vaultPath: undefined, brainPath: undefined };
}
```

Return type changes from `{ vaultPath: string; brainPath: string }` to `{ vaultPath: string | undefined; brainPath: string | undefined }`.

**`cli/index.ts`**

Pass the potentially-undefined `vaultPath` through to the harness launcher. `launchOpenCode()` already handles this -- when `vaultPath` is `undefined`, it doesn't set `BRAINKIT_VAULT_PATH`. No functional change needed, just the type flow.

### Server plugin changes

**`opencode/server.ts`**

Two changes:

**A) Dynamic vault path resolution.**

`resolveVaultPath()` is currently called once at init (line 40) and cached in a closure variable. After the agent creates `config.toml` and `brainkit.toml` mid-conversation, the cached `undefined` is stale.

Move resolution into the hooks so it re-resolves on each call:

```typescript
// Before
const server: Plugin = async () => {
  const vaultPath = resolveVaultPath();  // once, cached
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (!vaultPath) return;  // stuck forever after onboarding
      ...
    },
  };
};

// After
const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const vaultPath = resolveVaultPath();  // fresh each call
      if (!vaultPath) {
        output.system.push(ONBOARDING_PROMPT);
        return;
      }
      // normal prompt injection
      ...
    },
  };
};
```

The cost is negligible -- reading a small TOML file and checking a directory per message.

Compaction and idle hooks also call `resolveVaultPath()` per-call but keep their early return on `!vaultPath` -- they're irrelevant during onboarding.

**B) Onboarding prompt injection.**

When `resolveVaultPath()` returns `undefined`, inject a self-contained onboarding prompt. This prompt cannot reference the onboarding skill (skills load via the normal system prompt, which isn't available yet). It must carry all the knowledge the agent needs.

### Onboarding prompt content

A constant string in `server.ts` covering:

**What to ask (one topic at a time, conversational, not a checklist):**

1. Brain location -- where to store the brain directory. Suggest `~/brain`, explain it's a git-backed folder that can hold multiple vaults.
2. Vault name -- what to call their first vault. Recommend starting with a work-related vault. Mention that brainkit supports multiple vaults and they can always create another one later.
3. Basics -- name, role, expertise.
4. Professional context -- current projects, team, collaborators, work rhythm.
5. Personal context -- life outside work, personal projects, responsibilities, hobbies. Respect if they want to skip.
6. Preferences -- communication tone, custom rules.

**What to create (after gathering enough info):**

1. `~/.config/brainkit/config.toml`:
   ```toml
   version = 1
   brain_path = "~/brain"
   ```

2. `<brain_path>/<vault_name>/brainkit.toml`:
   ```toml
   version = 1

   [user]
   name = "..."
   role = "..."
   expertise = ["..."]
   tone = "..."
   context = """
   Professional: ...
   Personal: ...
   """
   rules = []

   [features]
   bragfile = true
   contacts = true
   ```

3. PARA directories with README.md files:
   - `01_projects/`
   - `02_areas/`
   - `03_resources/`
   - `04_archive/`

4. Key files:
   - `02_areas/career/bragfile.md`
   - `03_resources/contacts.md`

5. Pre-created directories based on conversation (projects mentioned -> `01_projects/<name>/`, areas -> `02_areas/<name>/`, interests -> `03_resources/<name>/`).

6. First brag entry and contacts if relevant info was shared.

**Tone directive:** Warm but efficient. One topic at a time. Conversational, not a form.

**After setup:** Summarize what was created. Mention they can adjust by editing `brainkit.toml` or asking the agent.

### Transition behavior

After the agent writes `config.toml` and `brainkit.toml`:

1. The next message triggers the system prompt hook.
2. `resolveVaultPath()` finds the new config and returns the vault path.
3. `readVaultConfigSimple()` reads the new `brainkit.toml`.
4. `buildSystemPrompt()` generates the full brainkit prompt.
5. The onboarding prompt is no longer injected -- the normal prompt takes over seamlessly.

No restart needed. No user action needed.

### TUI changes

**Sidebar (`side.tsx`):** No changes. "No vault configured" is accurate during onboarding and resolves naturally once the vault is created.

**Tips (`tips.tsx`):** Add a multi-vault tip to the rotation: "You can always add another vault -- just ask brainkit to set one up."

### Edge cases

**Partial onboarding -- `config.toml` written, `brainkit.toml` not yet:**
- Next launch: CLI finds config, `discoverVaults()` returns `[]`, falls back to `vaultPath = brainPath` (`launch.ts:180`).
- Server plugin: `resolveVaultPath()` returns the brain path, `readVaultConfigSimple()` throws, falls into onboarding prompt again.
- User picks up where they left off.

**Partial onboarding -- nothing written:**
- Next launch is identical to first launch. Clean slate.

**Existing users:**
- Zero impact. They have `config.toml` and `brainkit.toml` -- the onboarding path is never entered.

**Multi-vault later:**
- User asks to create a new vault. The onboarding skill (`skills/onboarding/SKILL.md`) guides that flow. New vault gets its own `brainkit.toml` under the same brain directory. `discoverVaults()` picks it up on next launch.

## Units of work

Two units, sequential. Unit 1 must complete before Unit 2.

```
Unit 1 (CLI + server plugin) ──> Unit 2 (TUI tip)
```

### Unit 1: CLI + server plugin onboarding mode

- `cli/launch.ts`: `selectVault()` returns undefined paths when no config instead of `process.exit(1)`. Update return type.
- `cli/index.ts`: Handle undefined `vaultPath` in the type flow.
- `opencode/server.ts`: Move `resolveVaultPath()` from init-time to per-call. Add `ONBOARDING_PROMPT` constant. Inject it when `resolveVaultPath()` returns undefined.
- Tests: see below.

### Unit 2: Multi-vault tip

- `opencode/tips.tsx`: Add multi-vault tip to the `TIPS` array.
- No tests needed (static content).

## Tests

**`selectVault()` no config:**
- Returns `{ vaultPath: undefined, brainPath: undefined }` when `readGlobalConfig()` returns `null`
- Does not call `process.exit`

**Server plugin onboarding prompt:**
- Injects onboarding prompt when `resolveVaultPath()` returns `undefined`
- Onboarding prompt contains key setup instructions (brain location, vault name, file formats)

**Server plugin transition:**
- After `config.toml` and `brainkit.toml` are written, `resolveVaultPath()` returns the real vault path
- Normal system prompt is injected instead of onboarding prompt

**Partial onboarding recovery:**
- `config.toml` exists but no `brainkit.toml` -> onboarding prompt injected

**Existing tests:**
- Update any `selectVault()` tests that assert `process.exit` on missing config

## Not in scope

- Interactive CLI prompts (no terminal questions -- the agent handles everything)
- Changes to the onboarding skill (`skills/onboarding/SKILL.md` stays as-is for the "Fresh Vault Detected" path)
- Changes to `core/` (vault.ts, system-prompt.ts, prompt-sections.ts all unchanged)
- TUI sidebar changes (current "No vault configured" text is fine)
- Async fs migration (pre-existing tech debt)
