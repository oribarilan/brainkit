# US-cross-platform

## Goal

Brainkit runs correctly on both macOS and Windows. Users on either platform can install via npm, launch their harness, complete onboarding, and use all vault features without errors or confusing path references.

## Definition of Done

- [x] `brainkit` CLI launches successfully on Windows (binary detection, spawning, config dir)
- [x] Copilot hooks work on Windows (no bash dependency)
- [x] All user-facing messages show platform-appropriate paths
- [x] TUI shell placeholders are platform-aware
- [x] Existing macOS/Linux behavior is unchanged
- [x] All tests pass on both platforms

## Task Priority

1. `cross-platform-binary-resolution.md` — Blocks everything; nothing launches on Windows without this
2. `cross-platform-config-dir.md` — Config can't be read/written to the right place on Windows
3. `cross-platform-copilot-hooks.md` — Copilot harness is broken on Windows without this
4. `cross-platform-user-facing-paths.md` — UX polish; confusing but not blocking
5. `cross-platform-shell-placeholders.md` — Cosmetic; TUI-only

## Cross-Cutting Concerns

- **No new dependencies** without explicit user approval (per AGENTS.md). Prefer Node.js built-ins.
- `process.platform === "win32"` is the standard check for Windows.
- `spawn` / `execFileSync` need `shell: true` on Windows to resolve `.cmd` shims, OR use a helper that handles this.
- All changes must be backward-compatible with macOS/Linux.
- `execSync` (string form) already uses the system shell, so `git` and `gh` commands work — but watch for quoting differences between `cmd.exe` and bash.

## Known Limitations (Not Blocking)

- **OSC 777 desktop notifications** (`core/hooks.ts:7`): Only works in Ghostty, iTerm2, WezTerm (macOS/Linux terminals). On Windows Terminal or PowerShell, the escape sequence is silently ignored. The function is exported but currently only used for the brag detection toast (which goes through OpenCode's TUI API, not this function). No action needed unless this function gets called directly on Windows — then a Windows-native notification fallback (e.g., PowerShell toast) would be needed.
- **`execSync` quoting in `auto-commit.ts:34`**: The commit message `"brainkit: auto-save YYYY-MM-DD"` works in both `cmd.exe` and bash because the interpolated date is always `YYYY-MM-DD` (no special chars). If the message format ever changes to include special characters, this would need `execFileSync` with args array instead.
