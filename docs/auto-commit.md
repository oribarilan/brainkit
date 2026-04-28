# Auto-commit

Auto-commit keeps the vault's git history up to date without the user ever thinking about it. After the agent finishes a turn, brainkit stages all vault changes and commits them with a dated message. The user gets a clean commit log of vault activity for free.

## Behavior

### Trigger

Auto-commit fires on the `session.idle` event — the moment the agent finishes responding and control returns to the user. Every idle event triggers a commit attempt, regardless of whether vault files actually changed. The pre-checks (described below) handle the no-op case.

### Debouncing

A 30-second debounce window prevents rapid-fire commits. When `scheduleAutoCommit` is called, it starts (or restarts) a 30-second timer. If the agent completes another turn within that window, the timer resets. Only when the user goes 30 seconds without a new idle event does the commit fire. This means a quick back-and-forth conversation produces one commit at the end, not ten.

The debounce is implemented with a module-level `setTimeout`. Each call to `scheduleAutoCommit` clears any existing timer and sets a new one. The timer reference is stored in a module-scoped variable (`commitTimer`), so it persists across calls but is isolated to a single process.

### Session-end flush

When the session shuts down, `flushAutoCommit` bypasses the debounce timer and commits immediately. It clears any pending timer, checks for uncommitted changes, and commits them. This prevents data loss — if the user exits mid-debounce, their changes still get committed.

Note: the OpenCode server plugin does not currently wire up `flushAutoCommit`. The function exists in core but has no caller in the OpenCode integration. If the user exits mid-debounce, pending changes won't be committed.

### Pre-checks

Before attempting any git operations, the system runs three checks in sequence. If any check fails, it returns silently — no error, no log, no toast.

1. Does the vault path exist on disk? (`fs.existsSync`)
2. Is the vault directory a git repository? (runs `git rev-parse --git-dir`)
3. Are there uncommitted changes? (runs `git status --porcelain` and checks for non-empty output)

These checks run both in the debounced path and in the flush path. A vault that isn't git-tracked will never see auto-commit activity.

### Git operations

When all pre-checks pass, the system runs two git commands in the vault directory:

1. `git add -A` — stages all changes, including new files, modifications, and deletions
2. `git commit -m "brainkit: auto-save YYYY-MM-DD"` — commits with the current date in ISO format

Both commands run via `execSync` with `stdio: "pipe"` (output suppressed) and `cwd` set to the vault path. The system never operates on the current working directory — it always targets the vault.

### Commit message format

The commit message is always `brainkit: auto-save YYYY-MM-DD`, where the date comes from `new Date().toISOString().slice(0, 10)`. There's no variation in the message. Multiple commits on the same day will have identical messages, which is fine — git distinguishes them by hash and timestamp.

### Error handling

Every git operation is wrapped in try/catch. If `git add` fails, `git commit` fails, or any pre-check throws, the error is swallowed. The user never sees auto-commit errors. This is intentional: auto-commit is a background convenience feature, and surfacing git failures would be confusing and disruptive. If something goes wrong, the worst case is that changes aren't committed — the files themselves are untouched.

### Scope

Auto-commit only touches the vault directory, identified by the `BRAINKIT_VAULT_PATH` environment variable (set by the CLI launcher). It has no awareness of and no effect on the user's project repository or any other directory on disk.

## Harness implementation

| Capability        | OpenCode                                                                                           | Copilot CLI                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trigger mechanism | `session.idle` event in server plugin calls `scheduleAutoCommit(vaultPath)`                        | `agentStop` hook (inline in `~/.config/brainkit/copilot/settings.json`) runs `~/.config/brainkit/copilot/hooks/scripts/auto-commit.js` after each agent turn |
| Debouncing        | `setTimeout` with 30s delay; each call clears and restarts the timer                               | No debouncing — each `agentStop` triggers a commit attempt; the script is idempotent (skips if no changes)                                                   |
| Session-end flush | Not currently wired up. `flushAutoCommit` exists in core but has no caller in the OpenCode plugin. | `sessionEnd` hook runs the same auto-commit script, catching any remaining changes                                                                           |
| Git operations    | `execSync` runs `git add -A` and `git commit` in the vault directory with `stdio: "pipe"`          | Node script runs `git add -A` and `git commit` in CWD (the vault)                                                                                            |
| Error handling    | All git operations and pre-checks wrapped in try/catch; failures are silent                        | Script checks for git repo and uncommitted changes; all commands fail silently via try/catch                                                                 |
