# update-docs

## Context

After the launcher rewrite + slim migration land, several user-facing and contributor-facing docs are now stale or wrong about the Copilot CLI integration. This task brings them in sync with the new isolated-config architecture.

**Value delivered:** Users understand the new behavior on first encounter (changelog notice + AGENTS.md isolation rule). Contributors don't read stale architectural specs and reproduce the old vault-write pattern in future work.

## Related Files

- `AGENTS.md` (this repo's, dev-side) — § "Harness Config Isolation"
- `specs/10-copilot-cli.md` — multiple sections need rewrite
- `CHANGELOG.md` — add user-facing entry under the next unreleased version

## Dependencies

- `rewrite-copilot-launcher.md` — design must be settled before docs go to print
- `add-isolation-tests.md` — Definition-of-Done references "verified by automated test", which only becomes true once the tests land

## Acceptance Criteria

### `AGENTS.md` § "Harness Config Isolation"

- [ ] Replace the Copilot CLI bullet:
  > **Old:** "Copilot CLI: only write inside the brainkit-owned vault directory (`.github/copilot/`, `.github/hooks/`, `.agents/skills/brainkit/`, `AGENTS.md`, `.gitignore`). Never read or write the user's global Copilot config (e.g. `~/.config/github-copilot/`)."
  > **New:** "Copilot CLI: launch with `COPILOT_HOME` env var pointing at `~/.config/brainkit/copilot/`. Never read, write, or merge into `~/.copilot/` (the user's global Copilot config). The vault is the agent's `cwd` but brainkit must not write any files inside the vault. The launcher must reject `--config-dir` in user args (it would override `COPILOT_HOME` per Copilot's precedence rules and defeat isolation). The `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var, if set by the user, is left alone. The only exception to the 'no vault writes' rule is the one-time mechanical migration that removes legacy brainkit-generated files from vaults created with prior brainkit versions."
- [ ] No other AGENTS.md sections need changes.

### `specs/US-copilot-isolation.md`

- [ ] Add a header note immediately after the title: "**Updated 2026-04-28**: this spec was originally written under a per-file-then-all-or-nothing detection model. The shipped behavior uses the slim mechanical migration (brainkit-namespaced paths deleted unconditionally; `AGENTS.md` content-gated; `.gitignore` block stripped if contiguous). See `.todo/done/US-copilot-isolation/rewrite-copilot-launcher.md` § Migration for the authoritative shipped behavior. The 'Migration policy' table in this spec is preserved for historical context."

### `specs/10-copilot-cli.md`

- [ ] Add a new top-level section **"Config isolation"** (near the top, alongside the architecture overview) describing `COPILOT_HOME` use, mirroring how `specs/US-claude-code.md` describes `CLAUDE_CONFIG_DIR`. Include the runtime layout under `~/.config/brainkit/copilot/`.
- [ ] Add a new section **"Migration from v0.X"** describing the one-time mechanical migration: brainkit-namespaced paths (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) are deleted unconditionally; `AGENTS.md` is content-gated (deleted only if it contains the brainkit sentinel `<!-- brainkit:generated -->` or the legacy preamble); the contiguous `.gitignore` brainkit block is stripped; recovery is via `git restore <path>`; gated by `<copilotHome>/.migration-v1` marker. Reference `specs/US-copilot-isolation.md` for full detail. Note: the spec was originally written under per-file-then-all-or-nothing detection models; the implemented behavior is the slim mechanical version per `.todo/US-copilot-isolation/rewrite-copilot-launcher.md` § Migration. Scope rationale: ~2 beta testers in direct contact made an interactive prompt + per-artifact shape detection over-engineered for the audience; git is the safety net.
- [ ] Rewrite **§ "AGENTS.md generation"** → rename to **"System prompt generation"**. Describe writing `copilot-instructions.md` to `$COPILOT_HOME` instead of `<vault>/AGENTS.md`. Mention this is the documented user-level instruction file (link the GitHub docs page on Copilot CLI custom instructions).
- [ ] Rewrite **§ "Hooks"**. Describe inline `hooks` in `$COPILOT_HOME/settings.json` (using the schema verified during `rewrite-copilot-launcher`). Single `auto-commit.js` script in `$COPILOT_HOME/hooks/scripts/`. No standalone `hooks.json` at user level.
- [ ] Update **§ "Visual touches"** so the file path references `$COPILOT_HOME/settings.json` instead of `<vault>/.github/copilot/settings.json`.
- [ ] Mark **§ ".gitignore handling"** as deprecated / removed. Nothing is written to the vault, so nothing needs to be gitignored.
- [ ] Add a header note at the top of the spec: "This spec was revised on 2026-04-28. The original v0.X design wrote brainkit files into the vault; this version uses isolated config via `COPILOT_HOME`. See `specs/US-copilot-isolation.md` for the migration plan."

### `CHANGELOG.md`

- [ ] Add user-facing entry under the next version:
  > **Copilot CLI**: brainkit no longer writes files into your vault. Skills, instructions, hooks, and Copilot settings now live in a dedicated config directory (`~/.config/brainkit/copilot/`), passed to Copilot via the `COPILOT_HOME` environment variable. Existing vaults are auto-cleaned on first launch — files brainkit previously generated (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`, the brainkit block in `.gitignore`, and a brainkit-generated `AGENTS.md`) are removed from the working tree. Run `git status` after the first launch to review; recover any file with `git restore <path>`. A non-brainkit `AGENTS.md` is preserved.

### Verification

- [ ] `just lint` passes (markdown linting if any)
- [ ] All cross-references resolve (no broken `specs/...` links)
- [ ] Manually re-read `AGENTS.md` § "Harness Config Isolation" and confirm a new contributor would understand the rule + the rationale

## Verification

- **Ad-hoc:** read each modified file end-to-end. Check that wording is consistent with the rest of the brainkit voice.

## Notes

- **Audit results for `skills/` and `docs/` references to `AGENTS.md` (run during this US, 2026-04-28):**
  - `skills/` — **clean.** No references to `AGENTS.md` as a Copilot system-prompt path.
  - `docs/*.md` feature docs — six files reference `AGENTS.md` in side-by-side OpenCode vs Copilot comparison tables. All describe the OLD behavior. Contributor-facing not user-facing — not a bug for end users, but a maintainer trap. Deferred follow-up.
  - `docs/doctor.md:33` mentions `AGENTS.md` in the list of expected vault root files for the orphan-files check. **This one matters even post-US** — confirm doctor doesn't false-flag a user-authored `AGENTS.md`.
- **Deferred follow-up (per `main.md`):** update the six feature docs to remove the "AGENTS.md" Copilot-side references.
- For the changelog entry style: keep it concise but call out that `AGENTS.md` deletion is content-gated (so users with non-brainkit `AGENTS.md` files don't panic).
- If the inline-hooks schema verification (folded into `rewrite-copilot-launcher.md`) discovered the schema differs from the assumed event-keyed object form, update the example shapes in `specs/10-copilot-cli.md` accordingly.
- Mention the new Copilot CLI version warning in `specs/10-copilot-cli.md` § "Config isolation" — one sentence noting the launcher prints a warning if `copilot --version` reports below v1.0.37.
