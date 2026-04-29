# US-tui-theme-load-resilience

## Goal

Fix the cwd-relative theme path bug in `opencode/tui.tsx` that causes the entire custom TUI (theme, logo, sidebar, tips, `/doctor` command, prompt placeholders) to silently disappear when brainkit is launched from anywhere other than the repo root. While in there, make the plugin resilient to theme-load failures so this whole class of bug ("one bad await kills everything below it") can't regress invisibly.

See `specs/US-tui-theme-load-resilience.md` for full design (oracle-reviewed 2026-04-29).

## Definition of Done

- [ ] `opencode/tui.tsx` exports a module-level `themePath` constant computed from `import.meta.url` (not cwd).
- [ ] Theme install + set wrapped in try/catch:
  - Failure logged with `[brainkit]` prefix via `console.error`.
  - **AND** user-visible toast fired via `api.ui.toast(...)`, guarded by `typeof api.ui?.toast === "function"`.
  - Rest of plugin registers regardless.
- [ ] Slot/command registration reordered: register our own `home_bottom` (tips) slot **before** `api.plugins.deactivate("internal:home-tips")`. User always has tips — either ours, or built-in fallback.
- [ ] Two regression tests in `opencode/__tests__/theme.test.ts`:
  - **Path test** — imports `themePath` from `tui.tsx`, asserts file exists and parses to valid theme shape.
  - **Resilience test** — calls `tui` with a fake `api` whose `theme.install` rejects, asserts slots/commands still register.
- [ ] CI guard test in `opencode/__tests__/no-cwd-relative-theme-paths.test.ts` — scans `opencode/*.tsx` source for `theme.install("...")` string literals and fails the build if found.
- [ ] **Blocking sanity check**: log `import.meta.url` from both `just dev` (repo root) and a launch from `/tmp`. Both must print `file://...`. If either doesn't, stop and revise — fix is invalidated. Document result in PR.
- [ ] Manual verification: theme + full TUI work when launching from `/tmp`.
- [ ] Manual verification: renaming `brainkit.json` away → TUI still works (degraded theme), toast appears, error visible in `opencode logs`.
- [ ] `just check` passes.
- [ ] `CHANGELOG.md` unreleased entries added.

## Explicitly NOT in this US

- **`@ts-nocheck` removal** — deferred to a separate follow-up US. All four `opencode/` files have it, they're tightly coupled, and `@opentui/solid` doesn't publish JSX intrinsics. Multi-hour typing project, not a side quest. The CI guard above covers this specific regression class as a substitute defense.

## Task Priority

Single PR. Commit order:

1. Path fix (`themePath` export + try/catch + toast + slot reorder) in `opencode/tui.tsx`.
2. Add `opencode/__tests__/theme.test.ts` (path test + resilience test).
3. Add `opencode/__tests__/no-cwd-relative-theme-paths.test.ts` (CI guard).
4. `import.meta.url` sanity check (log + verify in both contexts + remove log).
5. Manual verification (Verification Plan steps 3–6 in spec).
6. Changelog entries.
7. PR.

**Stop conditions** (surface to user before continuing):

- `import.meta.url` returns anything other than `file://` in either context → entire approach invalidated, needs different anchor.
- Resilience test requires non-trivial restructuring of `tui.tsx` to be testable → propose extracting plugin body to a named helper before testing.
- Toast call shape doesn't match the installed `.d.ts` (e.g. `TuiToast` schema differs) → adjust to actual schema, don't fabricate.

## Cross-Cutting Concerns

- **Cross-platform** (`AGENTS.md`): `path.join` + `fileURLToPath`. No hardcoded separators. Verified on Windows via the `test-windows` CI job.
- **No new dependencies.** `node:url` + `node:path` only.
- **Type safety**: `@ts-nocheck` deferred to follow-up; CI guard against cwd-relative `theme.install` literals is the substitute defense for this exact bug class.
- **Graceful degradation**: try/catch around theme + toast on failure + register everything else regardless. This pattern is the template for any future startup-side-effect calls in the plugin.
- **Harness config isolation**: not affected.
- **Why `cli/launch.ts` doesn't change**: launcher writes npm-export-based plugin path; runtime `import.meta.url` resolves to the installed `node_modules/.../opencode/tui.tsx`, which is exactly what `themePath` anchors against. No cwd alternative would be more correct.

## Follow-up to file separately

- **US-opencode-ts-nocheck-removal** — remove `@ts-nocheck` from all four `opencode/` files, type the `@opentui/solid` JSX intrinsics (or add minimal ambient declarations), get `tsc --noEmit` clean. Multi-hour. File when picking this up.
