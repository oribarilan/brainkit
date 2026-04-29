# US-tui-theme-load-resilience — Stop the TUI plugin from collapsing when the theme fails to load

Status: Draft (oracle-reviewed 2026-04-29)
Date: 2026-04-29

## Goal

Make brainkit's OpenCode TUI plugin resilient to theme-load failures so that a single failing `await` no longer silently disables the entire custom TUI experience (logo, theme, sidebar, tips, `/doctor` command, custom prompt placeholders).

The immediate trigger is a path-resolution bug: `opencode/tui.tsx` calls `api.theme.install("./opencode/brainkit.json")` with a cwd-relative path. When OpenCode is launched from any directory other than the brainkit repo root (i.e. the normal user flow — launching from a vault), the path resolves to a non-existent file, the install rejects, and every subsequent registration in the plugin module is skipped. Users see plain default OpenCode with no brainkit personality, and there is no error surfaced anywhere.

## Why This Approach

Two problems compound here, and the fix needs to address both:

1. **Bug**: the theme path is cwd-relative, not plugin-relative. The earlier fix in `a7f3f67` ("Fix theme install path to resolve from plugin root") only changed the relative segment from `./brainkit.json` to `./opencode/brainkit.json` — neither form is actually anchored to the plugin file. The correct anchor is `import.meta.url`.
2. **Architectural fragility**: registering all slots, commands, and themes inside a single `async` function means any rejection partway through silently kills everything that follows. Even with the path bug fixed, a future theme schema change, a transient FS error, or any other issue inside the install/set sequence will reproduce the same "TUI mysteriously vanishes" symptom. The plugin needs to fail loudly, fail partially, and keep registering the parts that don't depend on the failed step.

`// @ts-nocheck` removal is **deliberately deferred** to a follow-up US (see "Out of Scope"). All four files in `opencode/` carry the directive, they're tightly coupled, and `@opentui/solid`'s JSX intrinsics aren't typed — so cleanly removing it is a multi-hour typing project, not a side quest. This US instead adds a narrower CI guard that catches this specific bug class (cwd-relative paths in `theme.install`).

## Definition of Done (story-level)

- [ ] Custom theme, brain ASCII logo, sidebar, rotating tips, custom prompt placeholders, and `/doctor` command appear when brainkit is launched from any directory (not only the repo root).
- [ ] `opencode/tui.tsx` resolves `brainkit.json` relative to the plugin file's own location using `import.meta.url`, not relative to the process cwd. The computed path is exposed as a module-level exported constant (`themePath`) so tests can assert on the exact value the runtime will use.
- [ ] If theme install or set throws for any reason:
  - The failure is logged via `console.error` with a clear `[brainkit]`-prefixed message.
  - **AND** a user-visible toast is fired via `api.ui.toast({ variant: "error", title: "brainkit", message: "Failed to load custom theme; using default colors. See opencode logs for details.", duration: 8000 })`.
  - The toast call itself is guarded with `typeof api.ui?.toast === "function"` so older OpenCode versions don't crash.
  - The rest of the TUI plugin (slots, commands, theme-independent registrations) still registers and works.
- [ ] Slot/command registration order is reorganized so we register our own `home_bottom` (tips) slot **before** calling `api.plugins.deactivate("internal:home-tips")`. If our tips registration throws, the built-in tips remain — never both fail.
- [ ] A guard exists in CI that fails on cwd-relative paths passed as string literals to `api.theme.install(...)` in `opencode/`. Acceptable forms: a custom ESLint rule, a grep-based test, or a Vitest test that scans the source. The guard must reject `api.theme.install("./...")` and `api.theme.install("...")` literals; it must accept identifier arguments.
- [ ] Two regression tests in `opencode/__tests__/`:
  - **Path test** — imports the exported `themePath` from `tui.tsx` and asserts `fs.existsSync(themePath)` is `true`. (Pins the runtime-resolved path, not just "some file exists somewhere.")
  - **Resilience test** — calls the `tui` plugin function with a fake `api` whose `theme.install` rejects, and asserts that all expected slot and command registrations still happened on the fake api after the call resolves.
- [ ] One-time `import.meta.url` sanity check during dev: log it from both `just dev` (repo root) and a launch from `/tmp`. Confirm both print a `file://…` URL (not `data:` or synthetic). Document the result in the PR description. **Blocks merge if either doesn't return `file://`.**
- [ ] `npm pack --dry-run` confirms `opencode/brainkit.json` is still in the published tarball (defensive — should already be covered by the `opencode/` glob in `package.json:files`).
- [ ] `just check` passes (lint + format + tests).
- [ ] CI's `test-windows` job passes — the path resolution change uses `path.join` and `fileURLToPath`, both cross-platform, so this should be green.
- [ ] `CHANGELOG.md` has user-facing entries for the fix.

## Architecture Overview

### Before

```ts
// opencode/tui.tsx
const tui: TuiPlugin = async (api) => {
  await api.theme.install("./opencode/brainkit.json"); // cwd-relative — breaks outside repo root
  api.theme.set("brainkit");

  // Disable built-in tips first (BUG: if our tips registration throws, user gets none)
  await api.plugins.deactivate("internal:home-tips");

  api.slots.register({ slots: { home_logo, home_prompt } });
  api.slots.register({ slots: { home_bottom } }); // <-- our tips
  api.slots.register({ slots: { sidebar_content } });
  api.command.register(/* /doctor */);
};
```

When the `await` rejects, every line below it is skipped. The plugin module loads cleanly (no syntax error), it just registers nothing. There is no log surfaced to the user.

### After

```ts
// opencode/tui.tsx
import { fileURLToPath } from "node:url";
import * as path from "node:path";

// Module-level export so tests can assert on the exact path the runtime resolves.
export const themePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "brainkit.json");

const tui: TuiPlugin = async (api) => {
  try {
    await api.theme.install(themePath);
    api.theme.set("brainkit");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brainkit] failed to load custom theme: ${msg}`);
    if (typeof api.ui?.toast === "function") {
      api.ui.toast({
        variant: "error",
        title: "brainkit",
        message: "Failed to load custom theme; using default colors. See opencode logs for details.",
        duration: 8000,
      });
    }
    // Continue — the rest of the TUI degrades gracefully to default theme colors.
  }

  // Register all our slots and commands first.
  api.slots.register({ slots: { home_logo, home_prompt } });
  api.slots.register({ slots: { home_bottom } }); // our tips
  api.slots.register({ slots: { sidebar_content } });
  api.command.register(/* /doctor */);

  // All our slots/commands are registered. Now safe to deactivate the built-in
  // tips — if any registration above had thrown, we'd never reach here and the
  // built-in tips would remain as a fallback. The user always has *some* tips,
  // never zero. (This invariant relies on slot/command registration being
  // synchronous — see "Cross-Cutting Concerns".)
  const builtinTips = api.plugins.list().find((e) => e.id === "internal:home-tips");
  if (builtinTips?.enabled && builtinTips.active) {
    await api.plugins.deactivate("internal:home-tips");
  }
};
```

Behavioral consequences:

- Path resolution is anchored to the plugin file. Works from any cwd, on any OS.
- Theme failure no longer cascades. Logo, sidebar, tips, prompt, `/doctor` all still appear; they fall back to OpenCode's default theme colors. This is a meaningful UX improvement over "everything silently disappears."
- Errors surface two ways: `console.error` for greppability in `opencode logs`, plus a user-visible toast for users who don't think to check logs.
- Tips slot ordering guarantees the user always has tips — either ours, or the built-in fallback if our registration fails.

## Component Specifications

### `opencode/tui.tsx` changes

1. **Add imports** for `fileURLToPath` from `node:url` and `path` from `node:path`.
2. **Compute `themePath` as a module-level exported constant** (`export const themePath = ...`). Exporting is what enables the path regression test to pin the exact runtime-resolved value.
3. **Wrap theme install + set in try/catch.** On failure:
   - `console.error` with the `[brainkit]` prefix.
   - Fire `api.ui.toast({ variant: "error", ... })`, guarded by `typeof api.ui?.toast === "function"` so older OpenCode versions degrade silently instead of crashing.
   - Do not rethrow.
4. **Reorder lifecycle**: register all our own slots and commands **before** deactivating `internal:home-tips`. If our `home_bottom` slot registration throws (e.g. solid-js JSX runtime issue), the built-in tips remain — the user always has tips.
5. **Leave `lifecycle.onDispose` re-activation of built-in tips as-is.** The reorder above protects the steady-state failure mode; `onDispose` handles clean shutdown.
6. **Do NOT remove `// @ts-nocheck`** — that's deferred to a separate US (see Out of Scope).

### Regression tests

New file: `opencode/__tests__/theme.test.ts`. Two tests, both ~10–20 lines.

**Path test** — pins the runtime path:

```ts
import { themePath } from "../tui";
import * as fs from "node:fs";

it("themePath points to a real, parseable theme file", () => {
  expect(fs.existsSync(themePath)).toBe(true);
  const json = JSON.parse(fs.readFileSync(themePath, "utf-8"));
  expect(json.theme?.primary).toBeDefined();
  expect(json.theme.primary.dark).toBeDefined();
  expect(json.theme.primary.light).toBeDefined();
});
```

This works because `themePath` is computed from `import.meta.url` of `tui.tsx`. The test imports `tui.tsx` itself, so the resolved path is the runtime path — not a re-derivation from the test file's own `__dirname`.

**Resilience test** — pins the structural improvement:

```ts
it("registers slots and commands even when theme.install rejects", async () => {
  const tui = (await import("../tui.tsx")).default.tui;
  const slotsRegistered: unknown[] = [];
  const commandsRegistered: unknown[] = [];
  const fakeApi = {
    theme: {
      install: () => Promise.reject(new Error("synthetic failure")),
      set: () => {},
      current: { primary: "#000", textMuted: "#000" },
    },
    plugins: { list: () => [], deactivate: async () => {} },
    slots: {
      register: (def: unknown) => {
        slotsRegistered.push(def);
      },
    },
    command: {
      register: (fn: unknown) => {
        commandsRegistered.push(fn);
      },
    },
    lifecycle: { onDispose: () => {} },
    ui: {}, // toast missing — exercises the typeof guard
    chat: { submit: () => {} },
  };
  await tui(fakeApi as any, undefined as any, undefined as any);
  expect(slotsRegistered.length).toBeGreaterThanOrEqual(3);
  expect(commandsRegistered.length).toBeGreaterThanOrEqual(1);
});
```

Note: importing `tui.tsx` from a `.test.ts` file under Vitest may need a small config tweak (already runs `.tsx` files; if not, use `vi.importActual` or transient inline mock). If the import is too painful, fall back to extracting the body of the `tui` function into a named helper and testing that directly.

Both tests (path test and resilience test) assume Vitest evaluates `import.meta.url` to a `file://` URL. This holds on Node ≥22 in ESM mode, which is what the repo uses (see `package.json:engines`).

### CI guard against cwd-relative theme paths

Cheapest acceptable form: a Vitest test in `opencode/__tests__/no-cwd-relative-theme-paths.test.ts` that:

1. Reads `opencode/tui.tsx` (and any future `opencode/*.tsx` / `opencode/*.ts`) source files via `fs.readFileSync`.
2. Uses a regex to find `theme.install("...")` and `theme.install('...')` calls with string literals.
3. Asserts no match exists. Identifier arguments (`theme.install(themePath)`) pass.

Regex sketch: ``/\.theme\.install\(\s*["'`]/`` (covers double-quoted, single-quoted, and template literals). Tight but sufficient.

The guard does not analyze indirection (variable assignments, function returns, computed expressions); it only catches the direct-literal form, which is the form the bug took both times it appeared (`a7f3f67` and the current state).

If a future contributor reintroduces a string-literal path (cwd-relative or absolute), this test fails in CI before merge. Crude but effective and zero new dependencies.

### Notification surface (revised — toast API exists)

**Correction from initial draft**: `TuiPluginApi` does expose a toast method. From the installed `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts:393`:

```ts
ui: {
  toast: (input: TuiToast) => void;
  // TuiToast: { variant?: "info"|"success"|"warning"|"error"; title?; message; duration? }
}
```

`console.error` alone is invisible to almost all users (nobody runs `opencode logs` proactively, and that's exactly the failure mode this US targets). The fix uses both:

- **`console.error`** — for greppability in logs and for users who report the issue.
- **`api.ui.toast({ variant: "error", ... })`** — for in-session user visibility, behind a `typeof` guard so older OpenCode versions don't crash.

A toast is the right surface here because the failure is one-time, recoverable, and not worth permanent screen real estate. Toast disappears after `duration` ms; user has been informed; default theme colors take over.

## Cross-Cutting Concerns

- **Cross-platform paths** (per `AGENTS.md`): use `path.join` and `fileURLToPath`. No hardcoded separators. The change is `node:` built-ins only — no new dependencies. `fileURLToPath(import.meta.url)` is the canonical Node ESM idiom and works on Windows under both Node and Bun (returns `C:\…\opencode\tui.tsx`). The blocking sanity check in DoD verifies the assumption holds under OpenCode's actual loader.
- **No new runtime dependencies.** Uses only `node:url` and `node:path`.
- **Harness config isolation** is not affected by this change. The plugin reads its own bundled theme JSON; nothing about the user's harness config dirs changes.
- **Type safety regression prevention.** Since `@ts-nocheck` removal is deferred, the CI guard against cwd-relative `theme.install` literals is the substitute defense for this exact bug class. It's narrower than full typecheck but it would have caught both the original bug and the half-fix in `a7f3f67`.
- **Graceful degradation.** A theme failure should never be a TUI-killer. The pattern (try/catch around theme, register everything else regardless, toast on failure) should be the template for any future startup-side-effect calls in the plugin.
- **Slot-reorder invariant depends on synchronous registration.** The "register everything, then deactivate built-in tips" ordering only protects against cascade failures because `api.slots.register` and `api.command.register` are synchronous on the API surface. If a future change introduces an awaited registration, each registration needs its own try/catch or the deactivation needs to move further down still. Worth a brief moment of consideration whenever this file is touched.
- **Why `cli/launch.ts` doesn't change**: the launcher writes config that loads the plugin via the npm export `@2brain/brainkit/tui`. At runtime, `import.meta.url` resolves to the installed `node_modules/.../opencode/tui.tsx` path — exactly what `themePath` anchors against. There's no cwd-anchored alternative the launcher could provide that would be more correct, because the user's cwd (the vault) has no relationship to the plugin's install location.

## Out of Scope

- **`@ts-nocheck` removal across `opencode/`** — file a separate follow-up US. All four files (`tui.tsx`, `server.ts`, `side.tsx`, `tips.tsx`) carry the directive and are tightly coupled. `@opentui/solid` doesn't publish JSX intrinsic types for `<box>`, `<text>`, `<span>`, etc., so removal will surface dozens of non-bug errors that need either real typing work or explicit suppression. The CI guard above covers the specific regression class this US is about; full type re-enablement is a separate, larger piece of work.
- **In-banner / persistent error UI in the home screen.** Toast is sufficient — error is one-time and recoverable.
- **Refactoring `opencode/server.ts`, `side.tsx`, `tips.tsx`, or `logo.ts`.** Out of scope unless the slot-reorder or test work surfaces a real bug. If so, surface to the user before changing.
- **Changes to `opencode/brainkit.json` theme content.** Colors and theme entries are unchanged.
- **CLI launcher changes (`cli/launch.ts`).** See "Cross-Cutting Concerns" for why; the launcher is correct as-is.
- **Embedding the theme JSON as a TS object literal.** Considered and rejected: `theme.install` only accepts `jsonPath`, embedding would require writing to a temp dir (trading one path bug for another), and it bloats `tui.tsx` with ~100 lines of color data. The `import.meta.url` fix is the right altitude.

## Verification Plan

1. `just check` (lint + format + tests, including the new path test, resilience test, and CI guard test).
2. **`import.meta.url` sanity check (blocking, see DoD)**: temporarily add `console.log("[brainkit] plugin path:", import.meta.url)` at the top of `tui.tsx`. Run `just dev` from repo root → expect `file:///…/opencode/tui.tsx`. Then run `brainkit` from `/tmp` → expect `file:///…/node_modules/@2brain/brainkit/opencode/tui.tsx`. If either is `data:` or anything other than `file://`, stop and reassess — `fileURLToPath` will throw and the fix doesn't work as designed. Remove the log before committing.
3. `just dev` from the repo root → confirm theme, logo, sidebar, tips, `/doctor` all visible (baseline — was already working).
4. From a non-repo directory (e.g. `/tmp` or a vault dir): launch `brainkit` (or `opencode` with the brainkit-installed config) → confirm theme, logo, sidebar, tips, `/doctor` all visible. **This is the regression that motivated this US.**
5. Temporarily rename `opencode/brainkit.json` → relaunch → confirm:
   - Theme falls back to default OpenCode colors (no custom rose theme).
   - Logo, sidebar, tips, and `/doctor` still appear.
   - **A toast appears** with the "Failed to load custom theme" message.
   - `opencode logs` contains a `[brainkit] failed to load custom theme:` line.
   - Restore the file afterward.
6. `npm pack --dry-run` → confirm `opencode/brainkit.json` is in the file list.

## Task Breakdown

Single PR. Suggested commit ordering:

1. Path fix (`themePath` exported constant + try/catch + toast + slot reorder) in `opencode/tui.tsx`.
2. Add `opencode/__tests__/theme.test.ts` (path test + resilience test).
3. Add `opencode/__tests__/no-cwd-relative-theme-paths.test.ts` (CI guard).
4. `import.meta.url` sanity check (one-off, log + remove).
5. Manual verification (steps 3–6 in Verification Plan).
6. Changelog entries.
7. Open PR.

If `import.meta.url` returns something other than `file://` under OpenCode's loader (verification step 2), stop and revise the plan before continuing — the entire path-resolution approach is invalidated and needs a different anchor.
