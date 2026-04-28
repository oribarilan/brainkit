# US-self-update

## Goal

Brainkit checks for its own updates on launch and gives users three choices: update now (auto-runs the update and re-launches), skip this version (never ask about it again), or remind me later (ask again in 24h). Design spec: `specs/US-self-update.md`.

## Definition of Done

- [x] `brainkit` checks npm for a newer version of `@2brain/brainkit` on launch (at most once per 24h)
- [x] When outdated, a 3-option prompt appears: Update now / Skip this version / Remind me later
- [x] "Update now" auto-detects the package manager, runs the update, and re-launches brainkit
- [x] "Skip this version" persists the version in `skip_versions` in global config; that version is never prompted again
- [x] "Remind me later" dismisses for 24h (timestamp-based throttle)
- [x] npx and non-TTY environments are silently skipped
- [x] All existing tests pass, including harness version check tests
- [x] `just check` passes _(verified retroactively; shipped in v0.7.0 / v0.8.0)_

## Task Priority

1. `extract-version-utils.md` — Extract shared utilities; unblocks both self-update and keeps harness check working
2. `config-skip-versions.md` — Add `skip_versions` to global config type; unblocks skip logic
3. `self-update-check.md` — Core check logic (throttle, npm query, skip list, prompt)
4. `package-manager-detection.md` — Detect how brainkit was installed
5. `auto-update-and-relaunch.md` — Run update command and re-launch
6. `integrate-into-cli.md` — Wire into `cli/index.ts` launch flow

## Cross-Cutting Concerns

- **No new dependencies** — all work uses Node.js built-ins and existing `@clack/prompts`
- **Error handling**: every external call (npm query, update command, file I/O) fails silently or with a helpful message. Never block the user from launching brainkit.
- **OS-agnostic**: use `shell: process.platform === "win32"` for `execFileSync` calls (same pattern as `harness-version.ts`)
- **Existing tests must keep passing** after extracting utils from `harness-version.ts`
