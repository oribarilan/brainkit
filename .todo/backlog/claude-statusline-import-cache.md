# claude-statusline-import-cache

## Context

`claude/scripts/statusline.mjs` runs frequently (Claude polls it for the bottom-of-TUI vault stats line). Each invocation does a dynamic `await import(pathToFileURL(path.join(BRAINKIT_PACKAGE_ROOT, "dist", "core", "index.js")).href)` to load brainkit's vault helpers — costs ~20-50ms per render per the architecture review.

This is fine for low-frequency hooks (auto-commit on session end, precompact on /compact). But if Claude polls the statusline at >1 Hz (TBD — needs profiling), the compounding cost becomes perceptible on slower machines or NFS-mounted home dirs.

**Value delivered:** statusline renders feel instant regardless of poll rate. No "brainkit makes my Claude feel sluggish" complaints.

## Related Files

- `claude/scripts/statusline.mjs`
- `cli/claude.ts` (the launcher writes the statusline command path; if the cache mechanism requires a different invocation pattern, the launcher's settings.json output may need updating)

## Dependencies

- None. Self-contained inside the statusline script.

## Acceptance Criteria

- [ ] First profile statusline invocation under sustained Claude usage. If poll rate is < 1 Hz on typical hardware, this task is **not worth doing** — close as won't-do. If poll rate is ≥ 1 Hz OR if 50ms is observably perceptible, proceed.
- [ ] Cache the dynamic import result inside the script's process. Note: each Claude statusline invocation is a _fresh subprocess_, so module-level caching inside the script doesn't help — the cost is process startup + import.
- [ ] Real options for reducing per-invocation cost (pick whichever profiles best):
  - (a) Bundle the vault helpers + smol-toml into a self-contained `statusline.mjs` at build time (esbuild) — eliminates the dynamic import entirely.
  - (b) Switch from "spawn node script per render" to a long-lived sidecar (HTTP socket in `$CLAUDE_CONFIG_DIR/brainkit-statusline.sock`) that the script just queries. Architecturally heavier but eliminates per-render cost entirely.
  - (c) Pre-warm Node's module cache via a `--require` flag pointing at brainkit's core. May not help if the issue is process startup, not import cost.
- [ ] Whatever option is chosen: measure before/after with `time` against a representative vault. Report the win in the PR.

## Verification

- **Automated:** unit test for whatever helper extraction the chosen approach requires.
- **Ad-hoc:** `time` measurement of statusline invocation before vs after, on macOS (Apple Silicon), Linux, and ideally Windows (CI). Document numbers in the PR.

## Notes

Before doing any of this: confirm Claude actually polls the statusline often enough for the optimization to matter. If Claude only refreshes on user input (per-prompt), the cost is invisible — this task is then a no-op.

Quick way to profile: add `console.error("statusline tick at " + Date.now())` to the script temporarily, run a brainkit-claude session, count ticks per second. (Statusline must never print to stdout for non-statusline content; stderr is OK if Claude's TUI doesn't surface hook stderr.)

Deferred from US-claude-code per pre-release review (2026-04-29). Ranked low priority — needs profiling before any work justifies starting.
