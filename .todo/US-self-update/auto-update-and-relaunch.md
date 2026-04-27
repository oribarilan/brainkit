# Task: auto-update-and-relaunch

## Context

When the user picks "Update now", run the detected package manager's update command with inherited stdio, then re-launch brainkit with the same arguments so the user lands in the new version seamlessly.

**Value delivered**: One-action update experience — user picks "Update now" and is running the new version moments later.

## Related Files

- `cli/self-update.ts` — orchestrates the update flow

## Dependencies

- `self-update-check.md`
- `package-manager-detection.md`

## Acceptance Criteria

- [ ] Update runs via `execFileSync` (or `spawnSync`) with `stdio: "inherit"` so user sees install progress
- [ ] On success: prints success message via `p.log.success`
- [ ] On success: re-launches brainkit via `spawn(process.argv[0], [process.argv[1], ...process.argv.slice(2)], { stdio: "inherit" })` and exits current process on child exit
- [ ] On failure: prints error message with the command to run manually, then continues launching with current version (does NOT exit)
- [ ] OS-agnostic: uses `shell: process.platform === "win32"` for the update command
- [ ] Re-launched process skips the update check (timestamp is fresh from the check that triggered the update)

## Verification

- **Automated**: Tests with mocked `execFileSync`/`spawn` — success path (spawn called), failure path (error printed, continues)
- **Ad-hoc**: Manual test on macOS: `brainkit` triggers update, completes, and re-launches

## Scope Estimate

Small

## Notes

The re-launch spawns a new Node process with `process.argv[0]` (node binary) and `process.argv[1]` (brainkit script). After a global install update, the script at `argv[1]` is the updated version (global installs update in place). The child process inherits stdio and the parent exits with the child's exit code.
