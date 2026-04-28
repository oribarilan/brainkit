# fix-copilot-status-script-path

## Context

During the harness exploration for the Claude integration design, a pre-existing bug surfaced: `cli/copilot.ts:211` builds `statusScriptPath = <pkgRoot>/dist/cli/copilot-status.js`, but the actual file lives at `scripts/copilot-status.js` (top-level, not in `dist/cli/`). The `prepack` script (`package.json:39`) only compiles `cli/`, so `dist/cli/copilot-status.js` is never produced. The Copilot statusline silently fails on installed npm copies.

We're touching launcher infrastructure for Claude anyway. Fix this in the same PR rather than leaving the bug to rot.

**Value delivered:** Copilot statusline works on installed npm copies. Cleanup of stale path reference.

## Related Files

- `cli/copilot.ts` (~line 211) — wrong path
- `scripts/copilot-status.js` — actual location
- `package.json` — `files` array (already includes `scripts/`), `prepack` script

## Dependencies

- None (independent fix)

## Acceptance Criteria

- [ ] `cli/copilot.ts` references the correct path to `copilot-status.js` such that the statusline works both in `just dev` (source-tree) and from an installed npm package.
- [ ] Decision documented in this task's notes: either (a) point at `<pkgRoot>/scripts/copilot-status.js` directly, or (b) extend `prepack` to copy/compile the script into `dist/cli/`. Option (a) is simpler; option (b) is consistent with the rest of the build.
- [ ] Recommended option (a) unless there's a reason to prefer (b).
- [ ] Regression test in `cli/__tests__/copilot.test.ts`: assert the resolved path exists on disk after `just build-cli`.

## Verification

- **Automated:** new test in `copilot.test.ts` that resolves the script path the same way `cli/copilot.ts` does, then asserts `fs.existsSync(path)` after build. Add a `npmFiles` simulation if needed.
- **Ad-hoc:** `just build-cli`, then `node -e "console.log(require('node:fs').existsSync(require('node:path').join(__dirname,'<resolved-path>')))"`.

## Notes

This is the bug noted in the explorer's report: "`cli/copilot.ts:211` references `dist/cli/copilot-status.js` but the source lives at `scripts/copilot-status.js`."

If fixing this reveals deeper packaging issues, scope them down — file follow-up tasks rather than expanding this one.
