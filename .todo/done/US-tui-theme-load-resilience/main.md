# US-tui-theme-load-resilience

**Status: Done** — shipped in v0.10.0 (PR #16, 2026-04-29).

## Goal

Fix the cwd-relative theme path bug in `opencode/tui.tsx` that causes the entire custom TUI (theme, logo, sidebar, tips, `/doctor` command, prompt placeholders) to silently disappear when brainkit is launched from anywhere other than the repo root. While in there, make the plugin resilient to theme-load failures so this whole class of bug ("one bad await kills everything below it") can't regress invisibly.

See `specs/US-tui-theme-load-resilience.md` for full design (oracle-reviewed 2026-04-29).

## Definition of Done

- [x] `opencode/tui.tsx` exports a module-level `themePath` constant computed from `import.meta.url` (not cwd). _(Implementation deviation: extracted to `opencode/theme-path.ts` and re-exported from `tui.tsx`. See "Deviations from spec" below.)_
- [x] Theme install + set wrapped in try/catch:
  - Failure logged with `[brainkit]` prefix via `console.error`.
  - **AND** user-visible toast fired via `api.ui.toast(...)`, guarded by `typeof api.ui?.toast === "function"`.
  - Rest of plugin registers regardless.
- [x] Slot/command registration reordered: register our own `home_bottom` (tips) slot **before** `api.plugins.deactivate("internal:home-tips")`. User always has tips — either ours, or built-in fallback.
- [x] Two regression tests in `opencode/__tests__/theme.test.ts`:
  - **Path test** — imports `themePath` (from the extracted helper module), asserts file exists and parses to valid theme shape.
  - **Resilience test** — _(deviation: implemented as a source-structural test rather than a runtime test with a fake `api`. See below.)_
- [x] CI guard test in `opencode/__tests__/no-cwd-relative-theme-paths.test.ts` — scans `opencode/*.{ts,tsx}` source for `theme.install("...")` / `'...'` / `` `...` `` string literals and fails the build if found.
- [x] **Blocking sanity check**: `import.meta.url` returns `file://...` when launched from `/tmp` against the local plugin (verified manually with the dev one-liner). Approach validated.
- [x] Manual verification: theme + full TUI work when launching from `/tmp` (confirmed by user: "works!").
- [ ] Manual verification: renaming `brainkit.json` away → TUI still works (degraded theme), toast appears, error visible in `opencode logs`. **Skipped** — degraded-state code paths are enforced by the source-structural resilience test (slots/commands register after the catch block, console.error + toast are present and guarded). Runtime degraded behavior was not exercised. Accepted as a small gap; the structural test catches the regression class.
- [x] `just check` passes (332/332 tests, lint, format, typecheck, package integrity).
- [x] `CHANGELOG.md` entries added (locked into `[0.10.0]` for the release).

## Deviations from spec

1. **`themePath` extracted to `opencode/theme-path.ts`** instead of inlined in `tui.tsx`. Reason: importing `tui.tsx` from a Vitest test crashes on `@opentui/solid` and `solid-js` peer deps (not installed for tests). The helper module is dep-free (`node:url` + `node:path` only), so the path test can import and assert on it without dragging in the JSX runtime. `tui.tsx` re-exports `themePath` so any future code wanting the canonical import sees no difference.

2. **Resilience test is source-structural, not runtime.** Same peer-dep reason: a runtime test with a fake `api` would require importing `tui.tsx`. Instead, the test reads `tui.tsx` source via `fs.readFileSync` and asserts via regex:
   - `try { ... } catch` block exists and contains `api.theme.install`.
   - `api.slots.register` and `api.command.register` calls appear AFTER the catch block.
   - `console.error` has the `[brainkit]` prefix.
   - `api.ui.toast` is called and guarded by `typeof api.ui?.toast`.
   - `api.plugins.deactivate("internal:home-tips")` runs AFTER the last `api.slots.register`.

   Brittle to formatting changes but precisely targets the bug class: "one failing await above the registrations kills everything." Worth revisiting if/when the JSX peer-dep situation improves.

3. **Vitest config wired up** (`vitest.config.ts`) to include `opencode/__tests__/**/*.test.ts` — the directory wasn't previously in the test glob.

## Shipped commits (in `release/v0.10.0`)

- `8e1b860` fix(opencode): resolve theme path relative to plugin, not cwd
- `524b1b0` chore: release v0.10.0

## Follow-up filed separately

- `.todo/backlog/tui-logo-hide-when-narrow.md` — brain ASCII art overflows when the OpenCode pane is narrow (~25% of screen). Surfaced during the manual verification for this US. Decided to file separately rather than expand scope.
- **US-opencode-ts-nocheck-removal** (still to file when picked up) — remove `@ts-nocheck` from all four `opencode/` files, type the `@opentui/solid` JSX intrinsics, get `tsc --noEmit` clean. Multi-hour. The CI guard shipped in this US is the substitute defense for the specific cwd-relative theme path regression class.

## Cross-Cutting Concerns (as shipped)

- **Cross-platform** (`AGENTS.md`): `path.join` + `fileURLToPath`. No hardcoded separators.
- **No new dependencies.** `node:url` + `node:path` only.
- **Type safety**: `@ts-nocheck` deferred to a separate follow-up; CI guard against cwd-relative `theme.install` literals is the substitute defense.
- **Graceful degradation**: try/catch around theme + toast on failure + register everything else regardless. This pattern is the template for any future startup-side-effect calls in the plugin.
- **Harness config isolation**: not affected.
