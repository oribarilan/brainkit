# Copilot First-Run Onboarding

## Problem

`launchCopilot()` in `cli/copilot.ts` hard-exits when no vault is configured (`config.toml` missing or no `brain_path`). Copilot-first users have no onboarding path — they're told to set up via OpenCode first, which breaks the experience for anyone who starts with Copilot CLI.

OpenCode handles this gracefully: its server plugin re-evaluates the vault path per-message, injecting an onboarding prompt when no vault exists and seamlessly transitioning to the normal prompt after the agent creates the config. Copilot can't do this (AGENTS.md is static, read once at launch), so we need a different approach.

## Solution

When no config exists, the CLI creates a lightweight onboarding workspace at `~/.config/brainkit/onboarding/`, writes an `AGENTS.md` with the onboarding prompt, and spawns Copilot with CWD pointing there. The agent guides vault setup conversationally. Afterward, the user re-runs `brainkit` for the full experience.

## First-Run Flow

```
1. User runs `brainkit` (or `brainkit copilot`)
2. selectVault() → no config.toml → returns { vaultPath: undefined }
3. detectAndLaunch() → picks Copilot CLI
4. launchCopilot(args, undefined)
5. No vault → call launchCopilotOnboarding(args):
   a. Create ~/.config/brainkit/onboarding/
   b. Write AGENTS.md with onboarding prompt
   c. Spawn copilot with cwd: onboarding dir
6. Agent reads AGENTS.md, guides user through:
   - Brain location (suggest ~/brain)
   - Vault name (suggest "work")
   - User info (name, role, expertise)
   - Professional context (projects, team)
   - Personal context (optional)
   - Preferences (tone, rules)
7. Agent creates:
   - ~/.config/brainkit/config.toml
   - <brain_path>/<vault>/brainkit.toml
   - PARA directories + key files
   - git init
8. Agent tells user: "Setup complete! Run `brainkit` again to start."
```

## Subsequent Launch Flow

```
1. User runs `brainkit`
2. selectVault() → config.toml exists → returns vault path
3. launchCopilot(args, vaultPath):
   a. Clean up ~/.config/brainkit/onboarding/ if it exists
   b. Normal flow: install skills, generate AGENTS.md, hooks, spawn copilot
```

## Changes

### New file: `core/onboarding-prompt.ts`

Extract the onboarding prompt content from `opencode/server.ts` into a shared module. The prompt body is identical for both harnesses — the same conversational Q&A flow (brain path, vault name, user info, config creation, PARA dirs, first entries). The only difference is the closing section:

- **OpenCode**: No closing needed (seamless transition via per-message hooks)
- **Copilot**: Append `"Setup complete! Close this session and run brainkit again to start with your full second brain."`

Export:
```typescript
function buildOnboardingPrompt(harness: "opencode" | "copilot"): string
```

The function returns the full prompt with the appropriate closing. The prompt body comes from the existing `ONBOARDING_PROMPT` constant in `server.ts` (lines 38-133), unchanged.

### Modify: `opencode/server.ts`

Replace the inline `ONBOARDING_PROMPT` constant with an import:
```typescript
import { buildOnboardingPrompt } from "../core/onboarding-prompt.js";
```

Use `buildOnboardingPrompt("opencode")` where `ONBOARDING_PROMPT` was used. Behavior is identical.

Note: `server.ts` uses `.ts` extension for imports (bun resolution per AGENTS.md). The import path would be `../core/onboarding-prompt.ts`.

### Modify: `cli/copilot.ts`

Refactor `launchCopilot()`:

1. **Remove the hard exit** on line 146. Instead, when `vaultPath` is undefined and no config exists, call `launchCopilotOnboarding(args)`.

2. **Add `launchCopilotOnboarding(args)` function**:
   - Create `~/.config/brainkit/onboarding/` directory
   - Write `AGENTS.md` with `buildOnboardingPrompt("copilot")`
   - Show `p.outro("Starting onboarding...")` (or similar clack message)
   - Spawn `copilot` with `cwd: onboardingDir`, `stdio: "inherit"`

3. **On normal path**: After successful vault resolution, remove `~/.config/brainkit/onboarding/` if it exists (cleanup from first run). This is a best-effort `rm -rf` wrapped in try/catch — failure is silent.

### Modify: `core/index.ts`

Add `buildOnboardingPrompt` to the barrel export.

## Both Launch Paths Covered

Both entry points route through the same `launchCopilot()` function:
- Explicit: `brainkit copilot` → `launchHarness("copilot", args, undefined)` → `launchCopilot(args, undefined)`
- Auto-detected: `brainkit` → `detectAndLaunch(args, undefined)` → `selected.launch(args, undefined)` → `launchCopilot(args, undefined)`

No separate handling needed.

## What Stays the Same

- Normal copilot launches (vault exists): unchanged. Skills installed to vault, AGENTS.md in vault root, no env vars.
- OpenCode's onboarding: identical experience. Just sourcing the prompt from `core/` instead of inline.
- All vault operations, config reading/writing, skill installation logic.
- The `selectVault()` flow — it already returns `{ vaultPath: undefined }` when no config exists (no change needed).

## Testing

### Unit: `buildOnboardingPrompt`
- Returns string containing "First-Time Setup" header
- OpenCode variant does NOT contain "run `brainkit` again"
- Copilot variant DOES contain "run `brainkit` again"

### Unit: `launchCopilotOnboarding`
- Creates `~/.config/brainkit/onboarding/` directory
- Writes `AGENTS.md` to that directory
- AGENTS.md content includes onboarding prompt
- Spawns `copilot` with correct CWD

### Unit: Normal launch cleanup
- When `~/.config/brainkit/onboarding/` exists, it is removed during normal launch
- When it doesn't exist, no error

### Existing tests
- `vault-selection.test.ts`: no changes (selectVault already handles missing config)
- `harness-detection.test.ts`: no changes
