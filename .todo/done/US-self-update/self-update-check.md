# Task: self-update-check

## Context

Core self-update logic: throttle checks to once per 24h, query npm for the latest version, compare against current, check skip list, and show the 3-option prompt. This is the main module — it calls out to package manager detection and update execution (separate tasks) but those can be stubbed initially.

**Value delivered**: Users are notified when a brainkit update is available, with choices to act on it.

## Related Files

- `cli/version-utils.ts` — `isOlderThan()`, `getLatestNpmVersion()`
- `cli/version.ts` — current brainkit version
- `core/types.ts` — `BrainkitGlobalConfig` with `skip_versions`
- `core/vault.ts` — `readGlobalConfig()`, `writeGlobalConfig()`, `getConfigDir()`

## Dependencies

- `extract-version-utils.md`
- `config-skip-versions.md`

## Acceptance Criteria

- [ ] `cli/self-update.ts` exists with `maybeCheckForSelfUpdate(): Promise<void>` exported
- [ ] Non-TTY: returns silently without any npm query
- [ ] npx detection: returns silently when `process.argv[1]` contains `/_npx/`
- [ ] Throttle: reads `~/.config/brainkit/last-update-check` timestamp; skips npm query if <24h old
- [ ] Throttle: writes current ISO timestamp after successful npm query
- [ ] Throttle: proceeds with check when timestamp file doesn't exist
- [ ] Up to date: no prompt shown when current version matches or exceeds latest
- [ ] Skip list: no prompt shown when latest version is in `skip_versions`
- [ ] Skip list auto-cleanup: versions older than or equal to current version are pruned from `skip_versions` and persisted
- [ ] Prompt: 3-option `@clack/prompts` select appears when outdated (Update now / Skip this version / Remind me later)
- [ ] "Skip this version": appends latest version to `skip_versions` in global config
- [ ] "Remind me later": continues launching (timestamp already written, so 24h cooldown applies)
- [ ] Cancel (Ctrl+C): continues launching normally
- [ ] Network/npm failure: skips silently, does NOT write timestamp (retries next launch)
- [ ] All tests in `cli/__tests__/self-update.test.ts` pass

## Verification

- **Automated**: `cli/__tests__/self-update.test.ts` covering all criteria above (~12 test cases)
- **Ad-hoc**: `just check` passes

## Scope Estimate

Medium

## Notes

"Update now" triggers package manager detection and update execution, implemented in subsequent tasks. For this task, the "Update now" branch can call placeholder functions that will be filled in by `package-manager-detection.md` and `auto-update-and-relaunch.md`. Alternatively, implement the full flow if those tasks are done first.
