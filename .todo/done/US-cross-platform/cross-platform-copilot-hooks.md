# cross-platform-copilot-hooks

## Context

The Copilot auto-commit hook (`cli/copilot.ts:113-130`) is a bash script with a Unix shebang:

```bash
#!/usr/bin/env bash
git rev-parse --git-dir > /dev/null 2>&1 || exit 0
...
```

This script:

1. Won't run on Windows — no `/usr/bin/env bash` (unless Git Bash or WSL)
2. `chmod 0o755` (line 130) is a no-op on Windows (NTFS doesn't use Unix permissions)
3. The hook config references `.github/hooks/scripts/auto-commit.sh` (lines 102, 107)

Additionally, `generateCopilotSettings()` at `cli/copilot.ts:87` embeds a Node.js script path into a JSON config:

```ts
command: `node ${statusScriptPath}`,
```

where `statusScriptPath` is built via `path.join(packageRoot, "dist", "cli", "copilot-status.js")` (line 208). On Windows, `path.join` produces backslashes (`node C:\Users\...\copilot-status.js`), which may be misinterpreted as escape characters depending on the shell Copilot uses to execute the command.

Meanwhile, `core/auto-commit.ts` already has a pure Node.js implementation of the same auto-commit logic (`commitChanges()`, `scheduleAutoCommit()`). The Copilot hook duplicates this as a bash script.

**Value delivered**: Copilot hooks work on Windows without requiring bash.

## Related Files

- `cli/copilot.ts:98-131` — `HOOKS_CONFIG`, `AUTO_COMMIT_SCRIPT`, `installCopilotHooks()`
- `cli/copilot.ts:80-91` — `generateCopilotSettings()`, status script path embedding
- `core/auto-commit.ts` — Node.js auto-commit implementation (already cross-platform)

## Dependencies

- None (independent)

## Acceptance Criteria

- [x] Copilot auto-commit hook uses a Node.js script instead of bash (e.g., `.github/hooks/scripts/auto-commit.js`)
- [x] Hook command in `HOOKS_CONFIG` (both `agentStop` and `sessionEnd` entries at lines 102, 107) references the Node.js script
- [x] The replacement `.js` script is fully self-contained — it inlines the git logic, does NOT import from the brainkit package (the hook runs in the vault CWD, not the package directory)
- [x] `chmod` call is either removed (Node.js scripts don't need execute permissions) or made conditional on `process.platform !== "win32"`
- [x] Status script path in `generateCopilotSettings()` uses forward slashes (`.replace(/\\/g, "/")`) to avoid backslash escaping issues on Windows
- [x] Auto-commit script: adds all changes (`git add -A`), commits with message format `brainkit: auto-save YYYY-MM-DD`, silently exits if not a git repo or no changes pending
- [x] Tests pass

## Verification

- **Ad-hoc**: Run `just test`, inspect generated hook files in a test vault, verify the `.js` script runs with `node .github/hooks/scripts/auto-commit.js`

## Notes

The replacement `.js` script must be self-contained because it runs as a standalone process in the vault directory. It cannot `require()` or `import` from `core/auto-commit.ts` without knowing the package installation path. Skeleton:

```js
#!/usr/bin/env node
const { execSync } = require("child_process");
try {
  execSync("git rev-parse --git-dir", { stdio: "pipe" });
} catch {
  process.exit(0);
}
const status = execSync("git status --porcelain", { stdio: "pipe" }).toString().trim();
if (!status) process.exit(0);
try {
  const date = new Date().toISOString().slice(0, 10);
  execSync("git add -A", { stdio: "pipe" });
  execSync(`git commit -m "brainkit: auto-save ${date}"`, { stdio: "pipe" });
} catch {
  /* commit failed — skip silently */
}
```

For the status script path, the fix is simple:

```ts
command: `node ${statusScriptPath.replace(/\\/g, "/")}`,
```

The `chmod` call can be removed entirely when switching to `.js` — Node.js scripts are executed via `node <script>`, not as direct executables, so they don't need the execute bit.
