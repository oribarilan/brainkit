# Self-Update Check

## Overview

When a user runs `brainkit`, check if a newer version of brainkit itself is available on npm. If outdated, prompt the user with three choices: update now, skip this version, or remind me later. "Update now" auto-runs the update using the correct package manager and re-launches brainkit.

## Current Behavior

Brainkit checks whether the _harness_ (OpenCode / Copilot CLI) is outdated (`cli/harness-version.ts`), but has no awareness of its own update status. Users must manually check npm or notice changelogs.

## New Behavior

### Check flow

On every `brainkit` launch (after `p.intro`, before vault selection):

1. **Non-TTY**: skip silently
2. **npx detection**: if running via `npx` (disposable install), skip silently
3. **Throttle**: read timestamp from `~/.config/brainkit/last-update-check`. If the last check was less than 24 hours ago, skip
4. **Query npm**: fetch the latest version of `@2brain/brainkit` via `npm view @2brain/brainkit version`
5. **Write timestamp**: regardless of whether outdated, write current time to the timestamp file (so we don't re-check for 24h)
6. **Compare**: if current version is not older than latest, return silently
7. **Check skip list**: if latest version is in `skip_versions` in global config, return silently
8. **Prompt**: show a 3-option select

### Prompt UX

```
  brainkit update available (0.6.1 → 0.7.0)

  ◆  What would you like to do?
  │  ● Update now
  │  ○ Skip this version
  │  ○ Remind me later
  └
```

### Option behaviors

**Update now:**

1. Detect the package manager that installed brainkit (see detection strategy below)
2. Run the update command with inherited stdio (user sees progress)
3. On success: print success message, re-launch brainkit with the same arguments
4. On failure: print error with the command to run manually, continue launching with current version

**Skip this version:**

1. Append the latest version string to `skip_versions` in global config
2. Persist via `writeGlobalConfig()`
3. Continue launching normally

**Remind me later:**

1. Timestamp was already written (step 5), so the check won't fire again for 24h
2. Continue launching normally

**Cancel (Ctrl+C on prompt):**

1. Continue launching normally (same as remind me later)

### npx detection

Skip the self-update check entirely when running via `npx`, since npx fetches a fresh version each time. Detection signal: `process.argv[1]` contains `/_npx/`.

### Package manager detection

To update brainkit, we need to use the same package manager that installed it.

**Primary — resolve the binary path:**

1. `fs.realpathSync(process.argv[1])` to follow symlinks to the actual file
2. Match known directory patterns in the resolved path:
   - Contains `/.bun/` → bun
   - Contains `/pnpm/` or `/.pnpm-global/` → pnpm
   - Contains `/.yarn/` or `/yarn/global/` → yarn
   - Everything else → npm (most common, safe default)

**Secondary — `npm_config_user_agent` env var:**
If the primary check falls through to the npm default, also check `process.env.npm_config_user_agent`. This env var is set during `npx` runs and some package manager contexts. Parse the first token (e.g., `pnpm/8.0.0` → pnpm).

**Update commands by package manager:**

| PM   | Command                                   |
| ---- | ----------------------------------------- |
| npm  | `npm install -g @2brain/brainkit@latest`  |
| pnpm | `pnpm add -g @2brain/brainkit@latest`     |
| yarn | `yarn global add @2brain/brainkit@latest` |
| bun  | `bun add -g @2brain/brainkit@latest`      |

### Re-launch after update

After a successful update:

1. `spawn(process.argv[0], [process.argv[1], ...process.argv.slice(2)], { stdio: "inherit" })`
   - `process.argv[0]` = Node binary
   - `process.argv[1]` = brainkit script (same path after global update — updated in place)
   - `process.argv.slice(2)` = the user's original CLI arguments (e.g., `oc --model ...`)
2. Forward the child's exit code: `child.on("exit", (code) => process.exit(code ?? 0))`
3. The re-launched process sees a fresh timestamp and skips the update check

### skip_versions persistence and cleanup

Add `skip_versions?: string[]` to the global config:

```toml
version = 1
brain_path = "~/brain"
skip_versions = ["0.7.0"]
```

**Auto-cleanup:** On every check, before comparing against skip_versions, filter out any entries where the skipped version is older than or equal to the current version (using `isOlderThan`). Persist the cleaned list if it changed. This handles the case where the user updates by other means (e.g., manually running npm install) — stale skip entries are pruned automatically.

### Check throttling

**Timestamp file:** `~/.config/brainkit/last-update-check`

Contains an ISO 8601 timestamp string (e.g., `2025-04-27T10:30:00.000Z`). On launch, parse and compare against `Date.now()`. If the difference is less than 24 hours (86,400,000 ms), skip the npm query.

Written after every successful npm query, regardless of whether an update is available.

## Changes Required

### New file: `cli/self-update.ts`

Single exported function: `maybeCheckForSelfUpdate(): Promise<void>`

Internal helpers:

- `shouldThrottleCheck(configDir: string): boolean` — read/compare timestamp
- `writeCheckTimestamp(configDir: string): void` — write current time
- `detectPackageManager(): string` — resolve binary path, detect PM
- `getUpdateCommand(pm: string): string` — map PM to install command
- `runUpdate(command: string): boolean` — execFileSync, return success
- `relaunchBrainkit(originalArgs: string[]): void` — spawn + exit
- `cleanSkipVersions(versions: string[], currentVersion: string): string[]` — prune stale entries
- `isNpx(): boolean` — detect npx execution

### New file: `cli/version-utils.ts`

Extract shared utilities from `harness-version.ts`:

- `isOlderThan(installed: string, latest: string): boolean`
- `getLatestNpmVersion(npmPackage: string): string | null`

Both `harness-version.ts` and `self-update.ts` import from here.

### Modified: `cli/harness-version.ts`

Remove `isOlderThan` and `getLatestNpmVersion` definitions. Import from `cli/version-utils.ts`.

### Modified: `core/types.ts`

Add `skip_versions?: string[]` to `BrainkitGlobalConfig`.

### Modified: `cli/index.ts`

Add `await maybeCheckForSelfUpdate()` after `p.intro("brainkit")`, before vault selection.

### Tests: `cli/__tests__/self-update.test.ts`

- **Throttle**: skips when timestamp is fresh (<24h)
- **Throttle**: checks when timestamp is stale (>24h)
- **Throttle**: checks when timestamp file doesn't exist
- **npx**: skips when running via npx
- **Non-TTY**: skips silently
- **Up to date**: writes timestamp, no prompt
- **Skipped version**: skips silently when latest is in skip_versions
- **skip_versions cleanup**: prunes versions older than current
- **Prompt — Update now**: runs update command, re-launches
- **Prompt — Update now failure**: prints error, continues
- **Prompt — Skip this version**: adds to skip_versions in config
- **Prompt — Remind me later**: continues (timestamp already written)
- **Prompt — Cancel**: continues normally
- **PM detection**: resolves binary path for npm/pnpm/yarn/bun
- **PM detection**: falls back to npm_config_user_agent
- **PM detection**: defaults to npm

### Tests: `cli/__tests__/version-utils.test.ts`

Move existing `isOlderThan` tests from `harness-version.test.ts` here (or re-export and test in both — either way the tests must pass).

### Existing tests: `cli/__tests__/harness-version.test.ts`

Update imports to use `version-utils.ts`. All existing tests must continue passing.

## Error Handling

Every external call (npm query, update command, file reads) is wrapped in try/catch. Failures never block the user from launching brainkit:

- **npm query fails** (network error, npm not found): skip check, don't write timestamp (retry next launch)
- **Update command fails** (permissions, network): print error with manual command, continue launching
- **Timestamp file unreadable**: treat as "never checked," proceed with check
- **Config read/write fails**: skip the skip_versions feature, proceed normally

## Scope

- New module `cli/self-update.ts` (~120-150 lines)
- New module `cli/version-utils.ts` (~30 lines)
- Minor changes to `harness-version.ts` (import swap), `types.ts` (one field), `index.ts` (one line)
- ~16 test cases across two new test files
