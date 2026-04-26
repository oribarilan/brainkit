# CLI Polish with @clack/prompts

## Goal

Replace raw `readline` prompts and plain `console.log`/`console.error` output in the brainkit CLI with `@clack/prompts`, giving the launch experience a polished, branded feel.

## Dependency

Add `@clack/prompts@^1.2.0` to `dependencies` in `package.json`. This is the only new dependency.

## Changes

### `cli/index.ts`

- Call `intro('brainkit')` at the top of `main()` before any logic runs. This prints the branded session frame (`┌ brainkit`).
- Replace the `printUsage()` `console.log` block with a `note()` call. The content stays the same; it gets a box and title treatment.
- Replace `console.log(version)` with `log.info(version)`.
- Replace the bottom-level `console.error` in the `.catch()` handler with `log.error()`.
- Remove the `SIGINT` process handler — clack handles Ctrl+C via `isCancel()` on interactive prompts.

### `cli/launch.ts`

**`promptVaultSelection()`** — replace entirely:

- Use `select()` with each vault as an `{ value, label }` option.
- Check `isCancel()` on the result → call `cancel('Cancelled.')` + `process.exit(0)`.
- Remove the `readline` import (no longer needed).

**Harness selection in `detectAndLaunch()`**:

- Same treatment: `select()` with available harnesses as options, showing name and "(detected)" in the label.
- `isCancel()` check → `cancel()` + exit.
- After saving the default, use `log.success()` instead of `console.log` for the confirmation message.

**Error messages**:

- All `console.error` calls become `log.error()` or `cancel()`:
  - "Vault not found", "No harness found", "Unknown harness" → `cancel()` (terminal failures that end the session).
  - Informational errors (e.g., "Cannot read brain directory") → `log.error()`.

**Launch confirmation**:

- Call `outro()` with a message like `'Launching OpenCode...'` or `'Launching Copilot CLI...'` right before spawning the child process.

**Non-TTY branches**: Keep the same logic but swap `console.error` for `log.error()`.

### `cli/copilot.ts`

- Replace the `console.error` on the "No vault configured" path with `cancel()`.

### `package.json`

- Add `"@clack/prompts": "^1.2.0"` to `dependencies`.

## Ctrl+C Handling

Current: raw `process.on('SIGINT')` in `index.ts` that prints a newline and exits.

New: `isCancel()` type guard after each `select()` call → `cancel('Cancelled.')` + `process.exit(0)`. This gives a styled cancellation message (`└ Cancelled.` in red) instead of a bare newline.

## What Stays the Same

- All CLI logic: harness detection, config file generation, vault discovery, `selectVault()` signature and return type.
- The `launchOpenCode()` and `launchCopilot()` spawn logic.
- Non-TTY fallback behavior (just uses `log.error` instead of `console.error`).

## Testing Consideration

The existing CLI code has no unit tests for the interactive prompts (they're thin UI wrappers over vault/harness logic which is tested separately). This change is UI-only and doesn't alter any testable logic. Manual verification: run `just build-cli && node dist/cli/index.js --help` and test the interactive prompts with multiple vaults.
