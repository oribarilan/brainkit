# US-reset-scope

## Goal

Make `brainkit reset` do what its name implies: remove everything brainkit
put on this machine outside the vault. Today `factoryReset()`
(`cli/index.ts:29-54`) only deletes `<configDir>/config.toml` and
`<configDir>/onboarding/`, leaving brainkit-managed harness configs
(`opencode.json`, `tui.json`, `copilot/`) in place. The help text says
"Factory reset (removes config, re-triggers onboarding)" but the code is
narrower than that.

Fix by wiping the entire brainkit config dir. One mental model, no carve-outs
to remember.

## Definition of Done

- [ ] Running `brainkit reset` against a seeded `<configDir>` (with
      `config.toml`, `opencode.json`, `copilot/settings.json`) removes the
      entire dir.
- [ ] The vault repo and the user's global harness configs
      (`~/.config/opencode/`, `~/.copilot/`) are demonstrably untouched —
      this is non-negotiable per AGENTS.md "Harness Config Isolation".
- [ ] The confirmation prompt explicitly tells the user that harness state
      under `$COPILOT_HOME` (auth, conversation history) will also be
      removed.
- [ ] Help text, prompt copy, code, tests, and CHANGELOG all agree on the
      new behavior.

## Task Priority

1. `broaden-reset-wipe.md` — the single implementation task.

## Cross-Cutting Concerns

### What `reset` touches today (verified 2026-04-28)

`factoryReset()` in `cli/index.ts:29-54`:

1. Deletes `<configDir>/config.toml` (`cli/index.ts:42-48`)
2. Removes `<configDir>/onboarding/` via `cleanupOnboardingWorkspace`
   (`cli/copilot.ts:463-470`)

The same logic is duplicated in the in-launch reset prompt at
`cli/launch.ts:160-190`. The implementation must apply to both call sites
— extract one shared helper rather than touching both independently.

### What the new `reset` will touch

Everything inside `<configDir>` (`getConfigDir()` in `core/vault.ts:50-57`):

- `config.toml` — global brainkit config (vault location)
- `opencode.json`, `tui.json` — brainkit-managed OpenCode launch configs
  (regenerated on next launch — no functional loss)
- `copilot/` — isolated `$COPILOT_HOME`. **This includes Copilot's own
  state**: auth tokens, conversation history, MCP cache. Wiping this
  means the user re-authenticates Copilot and loses Copilot history on
  next launch. This is the right behavior for "factory reset" but must
  be called out explicitly in the confirm prompt so it's not a surprise.
- `onboarding/` — Copilot onboarding workspace (already cleaned up today)

### What `reset` must never touch (non-negotiable)

- The user's vault repo or any vault subdirectory
- The user's global harness configs (`~/.config/opencode/`,
  `~/.copilot/`)

These come from the AGENTS.md "Harness Config Isolation" section. The
test suite locks this in.

### Why full wipe (vs. narrowing the help text)

Considered both. Full wipe wins because:

- "Factory reset" in user vocabulary means "everything gone." A surgical
  reset that leaves files behind creates the foot-gun this story exists
  to fix.
- The boundary (`getConfigDir()`) is unambiguous and already enforced by
  the harness isolation rule. No new safety surface.
- Brainkit-managed harness configs regenerate on next launch — the only
  real loss is Copilot's own state under `$COPILOT_HOME`, which is what
  a user resetting to fix a broken harness wants gone anyway.
- Collapses `cleanupOnboardingWorkspace` and the duplicated narrow logic
  in `cli/launch.ts` into one line.

## Notes

- Surfaced from a user question about reset scope on 2026-04-28.
- No user has reported the narrow behavior as a bug — preventative fix
  before someone trips on it.
