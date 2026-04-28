# update-docs

## Context

After the launcher rewrite + migration land, several user-facing and contributor-facing docs are now stale or wrong about the Copilot CLI integration. This task brings them in sync with the new isolated-config architecture.

**Value delivered:** Users understand the new behavior on first encounter (changelog notice + AGENTS.md isolation rule). Contributors don't read stale architectural specs and reproduce the old vault-write pattern in future work.

## Related Files

- `AGENTS.md` (this repo's, dev-side) — § "Harness Config Isolation"
- `specs/10-copilot-cli.md` — multiple sections need rewrite
- `CHANGELOG.md` — add user-facing entry under the next unreleased version

## Dependencies

- `rewrite-copilot-launcher.md` and `add-migration.md` — design must be settled before docs go to print
- `add-isolation-tests.md` — Definition-of-Done references "verified by automated test", which only becomes true once the tests land

## Acceptance Criteria

### `AGENTS.md` § "Harness Config Isolation"

- [ ] Replace the Copilot CLI bullet:
   > **Old:** "Copilot CLI: only write inside the brainkit-owned vault directory (`.github/copilot/`, `.github/hooks/`, `.agents/skills/brainkit/`, `AGENTS.md`, `.gitignore`). Never read or write the user's global Copilot config (e.g. `~/.config/github-copilot/`)."
   > **New:** "Copilot CLI: launch with `COPILOT_HOME` env var pointing at `~/.config/brainkit/copilot/`. Never read, write, or merge into `~/.copilot/` (the user's global Copilot config). The vault is the agent's `cwd` but brainkit must not write any files inside the vault. The only exception is the one-time migration that removes legacy brainkit-generated files from vaults created with prior brainkit versions."
- [ ] No other AGENTS.md sections need changes (the harness-isolation rule is the only place Copilot's location was wrong)

### `specs/10-copilot-cli.md`

- [ ] Add a new top-level section **"Config isolation"** (near the top, alongside the architecture overview) describing `COPILOT_HOME` use, mirroring how `specs/US-claude-code.md` describes `CLAUDE_CONFIG_DIR`. Include the runtime layout under `~/.config/brainkit/copilot/`.
- [ ] Add a new section **"Migration from v0.X"** describing what the one-time migration does, what it preserves, what it removes, and how it's gated by the marker file. Reference `specs/US-copilot-isolation.md` for full detail.
- [ ] Rewrite **§ "AGENTS.md generation"** → rename to **"System prompt generation"**. Describe writing `copilot-instructions.md` to `$COPILOT_HOME` instead of `<vault>/AGENTS.md`. Mention this is the documented user-level instruction file (link the GitHub docs page on Copilot CLI custom instructions).
- [ ] Rewrite **§ "Hooks"**. Describe inline `hooks` in `$COPILOT_HOME/settings.json` (with the verified schema from `verify-inline-hooks-schema.md`). Single `auto-commit.js` script in `$COPILOT_HOME/hooks/scripts/`. No standalone `hooks.json` at user level.
- [ ] Update **§ "Visual touches"** so the file path references `$COPILOT_HOME/settings.json` instead of `<vault>/.github/copilot/settings.json`.
- [ ] Mark **§ ".gitignore handling"** as deprecated / removed. Nothing is written to the vault, so nothing needs to be gitignored.
- [ ] Add a header note at the top of the spec: "This spec was revised on 2026-04-28. The original v0.X design wrote brainkit files into the vault; this version uses isolated config via `COPILOT_HOME`. See `specs/US-copilot-isolation.md` for the migration plan."

### `CHANGELOG.md`

- [ ] Add user-facing entry under the next version:
   > **Copilot CLI**: brainkit no longer writes files into your vault. Skills, instructions, hooks, and Copilot settings now live in a dedicated config directory (`~/.config/brainkit/copilot/`), passed to Copilot via the `COPILOT_HOME` environment variable. Existing vaults are auto-cleaned on first launch — see the migration notice when you next run `brainkit copilot`.

### Verification

- [ ] `just lint` passes (markdown linting if any)
- [ ] All cross-references resolve (no broken `specs/...` links from `AGENTS.md` or `specs/10-copilot-cli.md` to nonexistent files)
- [ ] Manually re-read `AGENTS.md` § "Harness Config Isolation" and confirm a new contributor would understand the rule + the rationale

## Verification

- **Ad-hoc:** read each modified file end-to-end. Check that wording is consistent with the rest of the brainkit voice (concise, contributor-facing in `AGENTS.md` and specs; user-facing in `CHANGELOG.md`).
- **Optional:** ask the `oracle` subagent (or a teammate) to review the `AGENTS.md` and `specs/10-copilot-cli.md` diffs for clarity and accuracy.

## Notes

- Don't update the `docs/*.md` feature docs in this task. Many of them mention `AGENTS.md` as the brainkit system prompt for Copilot. Updating those is a deferred follow-up (per the US's "Tasks deferred to follow-ups" section). They're informational, not contractual, and the inaccuracy doesn't affect users — just future maintainers reading the wrong file path.
- For the changelog entry style: keep one line, focus on the "what" and "why" from the user's perspective. Don't mention internal function names or file paths in the changelog (per `AGENTS.md` § "Changelog style").
- If `verify-inline-hooks-schema.md` discovered the schema differs from the assumed event-keyed object form, update the example shapes in `specs/10-copilot-cli.md` accordingly.
