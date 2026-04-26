# Harness Auto-Detection with Remembered Default

## Overview

When a user runs `brainkit` without specifying a harness (no `oc`, `copilot`, etc.), detect which supported harnesses are installed, prompt the user to pick a default, and remember the choice for future launches.

## Current Behavior

`detectAndLaunch` in `cli/launch.ts`:

- 0 harnesses on `$PATH`: error with install links
- 1 harness: launch it automatically
- 2+ harnesses: list them and exit (no interactive selection, no persistence)

Explicit subcommands (`brainkit oc`, `brainkit copilot`) always bypass detection and work as expected.

## New Behavior

### Detection and launch flow

1. **0 harnesses found**: error listing all supported harnesses with install links (unchanged)
2. **1 harness found**: launch it (unchanged)
3. **2+ harnesses found, saved default exists and is installed**: launch the saved default
4. **2+ harnesses found, saved default exists but is NOT installed**: ignore saved default, fall through to prompt
5. **2+ harnesses found, no saved default**: interactive prompt

Explicit subcommands (`brainkit oc`, `brainkit copilot`) are always respected with no prompt and no config change.

### Interactive prompt UX

Show all supported harnesses with their detection status. Only detected harnesses are selectable.

```
  [brainkit] Select your default harness:

    1. OpenCode        (detected)
    2. Copilot CLI     (detected)
    3. Claude Code     (not installed)

  Choice (number): _
```

After selection, save the choice and launch:

```
  [brainkit] Default harness set to OpenCode.
```

Non-TTY environments (piped stdin): error with message to use an explicit subcommand, same pattern as the existing vault prompt.

### Persistence

Save the choice in the global config at `~/.config/brainkit/config.toml`:

```toml
brain_path = "~/brain"
default_harness = "opencode"
```

The value is the harness name in lowercase (matching the first alias): `"opencode"` or `"copilot"`.

## Changes Required

### `core/types.ts`

Add `default_harness?: string` to `BrainkitGlobalConfig`.

### `cli/launch.ts`

1. Update `detectAndLaunch` to read `default_harness` from global config before prompting.
2. Add `promptHarnessSelection` function (interactive numbered list, similar to existing `promptVaultSelection`).
3. After selection, write back to global config via `writeGlobalConfig`.
4. Show all harnesses in the prompt with `(detected)` / `(not installed)` status. Only accept numbers corresponding to detected harnesses.

### Tests

- Saved default exists and is installed: launches without prompt
- Saved default exists but not installed: falls through to prompt
- No saved default, 2+ detected: prompts and saves
- No saved default, 1 detected: launches directly (no prompt, no save)
- Explicit subcommand: bypasses all detection logic
- Non-TTY: errors with message

## Scope

This is a small change — roughly 30-40 lines of new code in `cli/launch.ts`, a one-line type change, and 6 test cases.
