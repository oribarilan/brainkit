# Task: integrate-into-cli

## Context

Wire the self-update check into the CLI entry point so it runs on every `brainkit` launch, after the intro banner but before vault selection. This is the final integration step.

**Value delivered**: Self-update check is live for all users on every launch.

## Related Files

- `cli/index.ts` — the CLI entry point
- `cli/self-update.ts` — the check function

## Dependencies

- `self-update-check.md`
- `package-manager-detection.md`
- `auto-update-and-relaunch.md`

## Acceptance Criteria

- [ ] `cli/index.ts` imports and calls `maybeCheckForSelfUpdate()` after `p.intro("brainkit")` and before `parseVaultFlag(args)`
- [ ] `--version`, `--help`, and `reset` commands are NOT affected (they exit before the check)
- [ ] `just check` passes
- [ ] Manual smoke test: `just dev` launches without errors

## Verification

- **Ad-hoc**: Read `cli/index.ts` and confirm the call is in the right position. Run `just dev` and verify brainkit launches normally.

## Scope Estimate

Small
