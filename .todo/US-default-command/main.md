# US-default-command

## Goal

Add a `brainkit default` command that lets users view and change their default harness without waiting for the auto-detect prompt.

## Context

`default_harness` already exists in `BrainkitGlobalConfig` and is persisted in `~/.config/brainkit/config.toml`. Today it's set via an interactive picker that fires when bare `brainkit` is run with multiple harnesses installed. This story adds a direct command to manage it.

## Behavior

### `brainkit default <alias>`

Sets the default harness. The alias must be a valid harness alias from the HARNESSES registry (`oc`, `opencode`, `copilot`, `cp`, `claude`, `cc`).

- Valid + installed: set and confirm. `Default harness set to Claude Code.`
- Valid + not installed: set, confirm, and warn. `Default harness set to Claude Code.\n⚠ Note: claude is not found on PATH.`
- Already the default: `Default harness is already Claude Code.`
- Invalid alias: error listing valid aliases.

### `brainkit default` (no arg)

- TTY: opens interactive picker (same UX as the existing `detectAndLaunch` picker). Shows all known harnesses, highlights current default. Saves selection.
- Non-TTY: prints current default. `Default harness: OpenCode` or `No default harness set.`

## Architecture

- `cli/index.ts`: add `"default"` check after `reset`, before `p.intro()` — no vault selection, no update check needed. Route to new function and return.
- `cli/launch.ts`: new exported `handleDefaultCommand(args)` function, colocated with `HARNESSES`, `readGlobalConfig`, `writeGlobalConfig`, and the existing picker logic.
- No new files, no new dependencies.

## Definition of Done

- [x] `brainkit default cc` sets `default_harness` to `"claude"` (canonical first alias) in config.toml and prints confirmation
- [x] `brainkit default cc` when claude is already default prints "already" message, does not rewrite config
- [x] `brainkit default cc` when claude binary is not on PATH still sets, but prints warning
- [x] `brainkit default foobar` prints error with valid alias list
- [x] `brainkit default` in TTY opens interactive picker (all harnesses enabled, not-installed ones labeled), pre-selects current default, saves selection
- [x] `brainkit default` in non-TTY prints current default (or "no default set")
- [x] `HELP_TEXT` updated with `default` command
- [x] No config.toml yet: bootstraps with `{ version: 1, brain_path: "" }` fallback (matching existing `detectAndLaunch` pattern)
- [x] Tests cover: set valid, set invalid, already-default (including cross-alias e.g. `oc` when `opencode` was used), not-installed warning, non-TTY display, TTY picker saves and confirms
- [x] Existing harness-detection tests still pass

## Edge Cases

- **Cross-alias "already default"**: if current default is `"claude"` and user runs `brainkit default cc`, both resolve to the same harness — treat as already-default.
- **Uninstalled default + bare launch**: `detectAndLaunch` only checks installed harnesses when resolving the saved default, so a default set for an uninstalled harness is silently skipped at launch. The not-installed warning from `brainkit default <alias>` should mention this: the default won't take effect until the harness is installed.

## Cross-Cutting Concerns

- Reuse the existing `p.select()` picker pattern from `detectAndLaunch` — don't duplicate the harness list rendering. Use `initialValue` to pre-select the current default, and append `(current)` to its label.
- Unlike `detectAndLaunch`'s picker (which disables uninstalled harnesses because it launches immediately), the `default` picker should enable all harnesses — setting a preference doesn't require the harness to be installed yet.
- Normalize aliases to the canonical first alias (e.g. `cc` → `claude`) before persisting, matching the existing behavior in `detectAndLaunch`.
- The `HARNESSES` registry is the single source of truth for valid aliases and display names.
