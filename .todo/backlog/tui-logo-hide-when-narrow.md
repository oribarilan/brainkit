# Hide brain ASCII logo when terminal pane is too narrow

## Problem

`opencode/logo.ts` ships a `logoLarge` brain ASCII art that's ~70 characters wide and 28 lines tall. When the OpenCode pane is narrow (e.g. ~25% of screen width, common when split-screening the terminal), the logo wraps/overflows and visually takes over the home screen.

`logoSmall` and `logoMedium` placeholders exist in the file but are empty (TODO comments). The home_logo slot in `opencode/tui.tsx` always renders `logoLarge` unconditionally.

## Goal

When the pane is too narrow to render the brain logo cleanly, render nothing (empty `home_logo` slot) instead of the overflowing large art. Sidebar, tips, prompt, and `/doctor` continue to work — only the logo is suppressed.

## Decisions (already made)

- **Behavior on narrow pane**: render nothing (empty / null). Don't substitute a wordmark or smaller art for now.
- **Threshold**: width-based. Need to confirm what width the OpenCode slot context exposes — see "Open question" below.
- **logoSmall / logoMedium TODOs**: leave the placeholders in place; not filling them now (would need designer work for cleaner small-size ASCII). Could become a separate follow-up if we ever want a small-size variant.

## Definition of Done

- [ ] `home_logo` slot renders the existing `logoLarge` only when the available width is sufficient (≥ ~70 chars of column space, accounting for the slot's actual render area).
- [ ] When width is below the threshold, the slot returns `null` (or an empty fragment) — nothing is rendered.
- [ ] Resizing the pane between renders updates the logo's visibility (uses the same reactive `createMemo` pattern the home component already uses for theme).
- [ ] No regressions in the wide-pane case: `just dev` still shows the full brain on a normal-sized terminal.
- [ ] Manual verification: split the terminal so OpenCode is ~25% wide → logo disappears, sidebar/tips/prompt all still work.
- [ ] No new dependencies. Use what `home_logo` slot context already exposes.

## Open question to resolve first

What does the `home_logo` slot context expose for measuring the available render area? Possible sources, in order of preference:

1. **Slot context width parameter** — does the `(ctx, value)` signature include layout dimensions? Read `.opencode/node_modules/@opencode-ai/plugin/dist/tui.d.ts` for the slot signature.
2. **`@opentui/solid` layout primitives** — does `<box>` expose its computed width via a ref or signal?
3. **Process `process.stdout.columns`** — fallback. Whole-terminal width, not pane width — only useful if OpenCode runs full-screen.
4. **OpenCode `api.tui.path` / `api.tui.config`** — unlikely to have layout info but worth a glance.

If none of (1)–(2) work, this task gets harder and we should reconsider scope (maybe just always render and let users live with overflow, or add a config toggle to disable the logo).

## Cross-Cutting Concerns

- **Cross-platform** (`AGENTS.md`): width-detection must work on macOS/Linux/Windows terminals.
- **No new dependencies.**
- **Don't break the just-shipped theme resilience fix.** The `home_logo` slot registration must still happen unconditionally in `tui.tsx` — only the _rendered output_ changes based on width.
- **Keep `logoSmall` / `logoMedium` slots in `logo.ts`** so a future task can fill them in without restructuring.

## Out of scope

- Filling in `logoSmall` and `logoMedium` ASCII variants (separate task — needs designer input on what looks good at smaller sizes).
- Multi-tier responsive switching (small → medium → large). This task is binary: render `logoLarge` or render nothing.
- A user-facing config toggle to disable the logo. Not needed if the auto-hide threshold is sensible.
- Wordmark / text fallback when logo is hidden. Decided against in scoping.
