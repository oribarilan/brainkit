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
- Non-TTY: prints current default. `Default harness: opencode` or `No default harness set.`

## Architecture

- `cli/index.ts`: add `"default"` check before `isHarnessAlias()`, route to new function.
- `cli/launch.ts`: new exported `handleDefaultCommand(args)` function, colocated with `HARNESSES`, `readGlobalConfig`, `writeGlobalConfig`, and the existing picker logic.
- No new files, no new dependencies.

## Definition of Done

- [ ] `brainkit default cc` sets `default_harness` to `"cc"` in config.toml and prints confirmation
- [ ] `brainkit default cc` when cc is already default prints "already" message, does not rewrite config
- [ ] `brainkit default cc` when claude binary is not on PATH still sets, but prints warning
- [ ] `brainkit default foobar` prints error with valid alias list
- [ ] `brainkit default` in TTY opens interactive picker, saves selection
- [ ] `brainkit default` in non-TTY prints current default (or "no default set")
- [ ] Tests cover: set valid, set invalid, already-default, not-installed warning, non-TTY display
- [ ] Existing harness-detection tests still pass

## Cross-Cutting Concerns

- Reuse the existing `p.select()` picker pattern from `detectAndLaunch` — don't duplicate the harness list rendering.
- Normalize aliases to the canonical first alias (e.g. `cc` → `claude`) before persisting, matching the existing behavior in `detectAndLaunch`.
- The `HARNESSES` registry is the single source of truth for valid aliases and display names.
