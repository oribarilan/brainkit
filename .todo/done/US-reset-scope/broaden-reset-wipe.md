# broaden-reset-wipe

## Context

Make `brainkit reset` remove the entire brainkit config dir
(`<configDir>` per `getConfigDir()`), so "factory reset" means what its
name implies. See `main.md` for the full rationale and constraints.

**Value delivered:** Running `reset` clears every file brainkit put on
the machine outside the vault. Users debugging a broken harness config
can fix it with one command. Help text and behavior agree.

## Related Files

- `cli/index.ts:29-54` — `factoryReset()` (the narrow current implementation)
- `cli/index.ts:18` — help text line for `reset`
- `cli/launch.ts:160-190` — duplicated in-launch reset prompt
- `cli/copilot.ts:463-470` — `cleanupOnboardingWorkspace` (likely deleted
  once the broad wipe subsumes it; check whether any other caller exists)
- `core/vault.ts:50-57` — `getConfigDir()` (the safety boundary)
- `cli/__tests__/` — new test file (`reset.test.ts`)
- `CHANGELOG.md` — Unreleased section

## Dependencies

- None. This is the only implementation task in the story.

## Acceptance Criteria

- [ ] Extract a shared `resetBrainkitConfig()` helper (location TBD —
      `cli/launch.ts` or a new `cli/reset.ts`) used by both
      `factoryReset()` in `cli/index.ts` and the in-launch reset prompt
      in `cli/launch.ts:160-190`. No duplicated wipe logic across call
      sites.
- [ ] The helper removes the full `<configDir>` tree using `getConfigDir()`
      as the path. Includes a defensive guard: refuse to delete any path
      that resolves outside `os.homedir()` or that equals `/` or `os.homedir()`
      itself (paranoid check — `getConfigDir()` should never return these,
      but the guard means a future bug in `getConfigDir` can't escalate to
      data loss).
- [ ] `cleanupOnboardingWorkspace` is removed if no other callers exist
      after the refactor (check `cli/copilot.ts:515` — that caller may
      still need it for the in-launch path that runs _before_ a reset).
- [ ] Confirmation prompt copy (both the `brainkit reset` subcommand
      prompt at `cli/index.ts:32-34` and the in-launch prompt at
      `cli/launch.ts:169-172`) updated to explicitly list what's removed,
      including: vault location, brainkit-managed OpenCode config,
      Copilot auth and conversation history under `$COPILOT_HOME`,
      onboarding workspace.
- [ ] Help text in `cli/index.ts:18` updated to match the new behavior
      (e.g., "Factory reset (removes all brainkit config; vaults are not
      touched)").
- [ ] New test in `cli/__tests__/reset.test.ts`:
  - Sets `BRAINKIT_CONFIG_DIR` to a tmp dir.
  - Seeds tmp `<configDir>` with `config.toml`, `opencode.json`,
    `tui.json`, `copilot/settings.json`, `onboarding/AGENTS.md`.
  - Seeds sibling tmp dirs representing `~/.config/opencode/`,
    `~/.copilot/`, and a fake vault path.
  - Calls the shared `resetBrainkitConfig()` helper.
  - Asserts: `<configDir>` is gone (or empty); the sibling dirs and the
    fake vault are untouched (file count, content, mtime).
- [ ] Test also covers the defensive guard: stub `getConfigDir()` to
      return `os.homedir()` and assert the helper throws without
      deleting anything.
- [ ] `just check` passes (lint + format + tests).
- [ ] CHANGELOG entry under Unreleased, one user-facing line, e.g.
      "`brainkit reset` now removes all brainkit config (including
      Copilot auth and history); vaults are untouched."

## Verification

- **Automated:** `cli/__tests__/reset.test.ts` per AC above. The
  `BRAINKIT_CONFIG_DIR` env var (`core/vault.ts:51`) makes this fully
  isolated from the developer's real `~/.config/brainkit/`.
- **Ad-hoc:**
  1. `BRAINKIT_CONFIG_DIR=/tmp/bk-test` seed three files
     (`config.toml`, `opencode.json`, `copilot/settings.json`).
  2. Run `BRAINKIT_CONFIG_DIR=/tmp/bk-test brainkit reset`, accept the
     prompt.
  3. Confirm `/tmp/bk-test` is gone.
  4. Confirm `~/.config/opencode/` and `~/.copilot/` (real ones, if
     present) are byte-identical to before.

## Notes

- The defensive guard against deleting `os.homedir()` or `/` is paranoia,
  not present-day risk. `getConfigDir()` is well-behaved. But this code
  does `rm -rf` on a computed path, and the cost of one extra branch is
  zero compared to the cost of one bug that nukes a home directory.
- If extracting the shared helper grows the diff significantly, it's
  fine to land the helper extraction first as a no-op refactor commit
  and the behavior change second. Same task, two commits — reviewer's
  call.
- The Copilot state loss (auth, history) is the only user-visible
  consequence beyond "config regenerates." Surface it loudly in the
  confirm prompt and CHANGELOG so a user running `reset` for an
  unrelated reason isn't blindsided by a re-auth flow.
