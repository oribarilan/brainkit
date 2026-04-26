# cross-platform-binary-resolution

## Context

The CLI cannot launch on Windows. Two independent issues block it:

1. **`which` command doesn't exist on Windows.** `cli/launch.ts:23` calls `execFileSync("which", [binary])` to detect installed harnesses. Windows uses `where` instead. This gates all harness launching via `isInstalled()`.

2. **`spawn()` / `execFileSync()` can't find `.cmd` shims on Windows.** npm installs binaries as `.cmd` wrapper scripts on Windows. These calls fail without `shell: true`:
   - `spawn("opencode", ...)` — `cli/launch.ts:77`
   - `spawn("copilot", ...)` — `cli/copilot.ts:180,216`
   - `execFileSync("npm", ...)` — `cli/harness-version.ts:80`
   - `execFileSync(meta.binary, ...)` — `cli/harness-version.ts:68` (where `meta.binary` is `"opencode"` or `"copilot"`)

**Value delivered**: brainkit CLI can detect and launch harnesses on Windows.

## Related Files

- `cli/launch.ts` — `which()` function (line 23), `spawn("opencode", ...)` (line 77)
- `cli/copilot.ts` — `spawn("copilot", ...)` (lines 180, 216)
- `cli/harness-version.ts` — `execFileSync("npm", ...)` (line 80), `execFileSync(meta.binary, ...)` (line 68)

## Dependencies

- None (first task)

## Acceptance Criteria

- [x] `which()` in `cli/launch.ts` works on both macOS and Windows without adding a new dependency (e.g., use `where` on Windows, or use Node.js built-in approach)
- [x] All `spawn()` calls that invoke npm-shimmed binaries (`opencode`, `copilot`) work on Windows (add `shell: true` on `win32`, or use a cross-platform helper)
- [x] All `execFileSync()` calls that invoke npm-shimmed binaries (`npm`, harness binaries in `harness-version.ts`) work on Windows
- [x] macOS/Linux behavior is unchanged
- [x] Tests pass

## Verification

- **Automated**: Unit test for the `which()` replacement function (mock `process.platform` and `execFileSync`)
- **Ad-hoc**: On macOS, run `just test` and `just dev` to confirm no regression

## Notes

### `which` → `where` on Windows

`where` on Windows can return **multiple lines** (one per matching path). The current `which()` does `.toString().trim()` and returns the result. With `where`, take only the first line:

```ts
function which(binary: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = execFileSync(cmd, [binary], { stdio: "pipe" }).toString().trim();
    // `where` on Windows may return multiple lines — take the first match
    return result.split(/\r?\n/)[0] ?? result;
  } catch {
    return null;
  }
}
```

### `spawn` / `execFileSync` for `.cmd` shims

The standard Node.js pattern is `{ shell: process.platform === "win32" }`. This is zero-dependency and well-established. Apply it to all 4 call sites listed above.

Note: when `shell: true` is used, arguments with spaces or special characters may need quoting. Review each call site's arguments to confirm they're safe (none of the current arguments contain spaces or special chars).
