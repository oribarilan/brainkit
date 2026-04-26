# Streamlined First-Run Onboarding

## Problem

When a brand-new user runs `brainkit` with no existing vault or configuration, the CLI hard-exits with an error message ("No brain configured"). The agent never launches, so it can't guide setup. There's a chicken-and-egg problem: the server plugin needs `brainkit.toml` to inject the system prompt, but onboarding is what creates `brainkit.toml`.

## Solution

Remove the hard exit. Launch the harness immediately in a "pre-vault" mode. The server plugin detects the missing vault and injects a dedicated onboarding system prompt that teaches the agent how to guide the user through setup conversationally. The agent creates all configuration and vault files mid-conversation. Once written, the plugin automatically transitions to the normal system prompt on subsequent messages.

## Design

### CLI Changes

**`cli/launch.ts` -- `selectVault()`**

When no `config.toml` exists, return undefined paths instead of calling `process.exit(1)`:

```
config.toml exists? -> current behavior (discover vaults, select, etc.)
config.toml missing? -> return { vaultPath: undefined, brainPath: undefined }
```

The return type changes to allow undefined values.

**`cli/index.ts`**

Handle undefined `vaultPath` from `selectVault()` and pass it through to the harness launcher. `launchOpenCode()` already handles `vaultPath` being undefined -- it just won't set `BRAINKIT_VAULT_PATH`.

No terminal prompts. No questions. Just launch.

### Server Plugin Changes

**`opencode/server.ts`**

Two changes:

**A) Dynamic vault path resolution.** Move `resolveVaultPath()` from init-time (called once, cached) to per-call in the system prompt hook. After the agent creates `config.toml` mid-conversation, the next call resolves the vault path correctly. The cost is negligible -- reading a small TOML file and checking a directory.

**B) Onboarding prompt injection.** When `resolveVaultPath()` returns `undefined`, inject a self-contained onboarding system prompt instead of silently returning. This prompt tells the agent how to guide a first-time user through setup.

Compaction and idle hooks keep their early return on `!vaultPath` -- they're irrelevant during onboarding.

### Onboarding Prompt Content

The inline prompt is self-contained (can't reference the onboarding skill since skills load via the normal system prompt which isn't available yet). It covers:

**What to ask (one topic at a time, conversational):**

1. Brain location -- where to store the brain directory (suggest `~/brain`)
2. Vault name -- what to call their first vault (recommend work-related, mention multi-vault support for later)
3. Basics -- name, role, expertise
4. Professional context -- current projects, team, collaborators, work rhythm
5. Personal context -- life outside work, personal projects, responsibilities, hobbies (respect skipping)
6. Preferences -- communication tone, custom rules

**What to create:**

1. `~/.config/brainkit/config.toml` -- global config with `brain_path`
2. `<brain_path>/<vault_name>/brainkit.toml` -- vault config with user info and features
3. PARA directories with README.md files (01_projects, 02_areas, 03_resources, 04_archive)
4. Key files (02_areas/career/bragfile.md, 03_resources/contacts.md)
5. Pre-created directories based on conversation (projects, areas, resources)
6. First brag entry and contacts if relevant info was shared

The prompt includes exact file format examples (`config.toml` and `brainkit.toml` templates) so the agent creates valid TOML.

**Tone directive:** Warm but efficient. One topic at a time. Conversational, not a form.

### TUI Changes

**Sidebar (`side.tsx`):** No changes. "No vault configured" is accurate during onboarding and resolves naturally once the vault is created.

**Tips (`tips.tsx`):** Add a multi-vault tip to the rotation (e.g., "You can always add another vault -- just ask brainkit to set one up").

### Transition Behavior

After the agent writes `config.toml` and `brainkit.toml`, the next system prompt hook call:
1. `resolveVaultPath()` finds the new config and returns the vault path
2. `readVaultConfigSimple()` reads the new `brainkit.toml`
3. `buildSystemPrompt()` generates the full brainkit prompt
4. The onboarding prompt is replaced by the normal prompt seamlessly

No restart needed.

### Edge Cases

**Partial onboarding -- config.toml written, brainkit.toml not yet:**
- Next launch: CLI finds config, `discoverVaults()` returns `[]`, falls back to `vaultPath = brainPath`
- Server plugin: `readVaultConfigSimple()` throws, falls into onboarding prompt again
- User picks up where they left off

**Partial onboarding -- nothing written:**
- Next launch is identical to first launch. Clean slate.

**Existing users:**
- Zero impact. They have `config.toml` and `brainkit.toml` -- the onboarding path is never entered.

**Multi-vault later:**
- When a user asks to create a new vault, the onboarding skill guides that flow. New vault gets its own `brainkit.toml` under the same brain directory. `discoverVaults()` picks it up automatically.

## Files Changed

| File | Change |
|---|---|
| `cli/launch.ts` | `selectVault()` returns undefined paths instead of `process.exit(1)` |
| `cli/index.ts` | Handle undefined `vaultPath`, pass through to harness |
| `opencode/server.ts` | Per-call `resolveVaultPath()`; onboarding prompt when no vault |
| `opencode/tips.tsx` | Add multi-vault tip |

**Unchanged:** core/, skills/, TUI theme/logo/sidebar, onboarding skill, "Fresh Vault Detected" path in prompt-sections.ts, compaction/idle hooks.

## Testing

**New tests:**
- `selectVault()` with no config returns undefined paths
- Server plugin injects onboarding prompt when `resolveVaultPath()` returns undefined
- Server plugin transitions to normal prompt after config files are created
- Partial onboarding recovery (config.toml exists, no brainkit.toml)

**Updated tests:**
- Any tests asserting `process.exit` on missing config in `selectVault()`

**Not tested:**
- Conversational quality (agent behavior, not unit-testable)
- TUI rendering (no meaningful changes)
