# rewrite-copilot-launcher

## Context

Rewrite `cli/copilot.ts` so that `launchCopilot` writes brainkit's skills, system prompt, hook script, and settings to `$COPILOT_HOME/` (= `getCopilotConfigDir()`) instead of into the user's vault. Spawn Copilot with `COPILOT_HOME` env var set so it loads everything from brainkit's isolated dir.

This task also folds in two checks that were previously separate concerns:

- **Inline hooks schema verification** (was a standalone task, now an AC line here): verify the schema against Copilot CLI docs and smoke-test locally before coding `generateCopilotSettings`.
- **Copilot CLI version check at launch:** prevent the worst silent failure mode where an old Copilot CLI ignores `COPILOT_HOME` and brainkit's prompt + skills don't load.

It also folds in a **slim mechanical migration** for existing brainkit users who have legacy files in their vault from prior versions. Scope rationale: the cohort is ~2 known beta testers in direct contact, so an interactive per-artifact-detection + confirmation-prompt flow is over-engineered for the audience. We delete the brainkit-namespaced paths unconditionally (they live at paths no real user would collide with) and content-gate `AGENTS.md` (the one path where a non-brainkit user file could plausibly exist). Git is the safety net for recovery.

**Value delivered:** Fresh `brainkit copilot` launches no longer pollute the vault. Existing users transition cleanly on first launch. The OpenCode isolation model is now also active for Copilot.

## Related Files

- `cli/copilot.ts` — full rewrite of orchestrator and helper functions; add the migration function inline
- `cli/install-skills.ts` — unchanged; just called with new `targetDir`
- `core/vault.ts` — uses `getCopilotConfigDir()` from `add-copilot-config-dir-helper.md`
- `cli/__tests__/copilot.test.ts` — assertions update to point at `$COPILOT_HOME` paths (full test rewrite happens in `add-isolation-tests.md`)

## Dependencies

- `add-copilot-config-dir-helper.md` — needs `getCopilotConfigDir()` exported from `core/`

## Acceptance Criteria

### Pre-implementation: inline hooks schema verification

- [x] **VERIFIED 2026-04-28 on Copilot CLI v1.0.37.** Smoke-tested the event-keyed shape `{ hooks: { agentStop: [{ command, description }] } }` in `$COPILOT_HOME/settings.json`. Hook fired and wrote the marker file. Schema confirmed. Use this shape in `generateCopilotSettings`.

### Launcher behavior

- [ ] **Detect `--config-dir` in `args` and abort.** `--config-dir` takes precedence over `COPILOT_HOME` per Copilot docs, so passing it would defeat brainkit's isolation. Detect both `--config-dir <value>` and `--config-dir=<value>` forms. If detected, print a clear error (`@clack/prompts`) explaining "brainkit manages Copilot's config dir; the --config-dir flag is not supported when launching Copilot via brainkit" and exit with non-zero status. Do this before any other launcher step.
- [ ] **Copilot CLI version check (defensive warning, not abort).** Before spawning, run `copilot --version` (best-effort: catch errors, skip on failure). Parse the version. If below the verified-good version (`MIN_COPILOT_VERSION = "1.0.37"`, the smoke-tested version where `COPILOT_HOME` is honored per `specs/US-copilot-isolation.md`), print a `@clack/prompts` warning: "brainkit requires Copilot CLI ≥ v1.0.37 for proper isolation. You are on v<found>. brainkit's prompt and skills may not load. Upgrade with `npm install -g @github/copilot`." Continue launch (don't block — user may have a fork or a future version with a non-semver string). Define the floor as a single named constant `MIN_COPILOT_VERSION` at the top of `cli/copilot.ts` so future version bumps touch one place.
- [ ] **Run mechanical legacy-file migration (see "Migration" section below)** before any other launcher setup step.
- [ ] `installSkills` is called with `targetDir: path.join(getCopilotConfigDir(), "skills", "brainkit")` instead of `<vault>/.agents/skills/brainkit`. Verify by inspection that on a fresh `$COPILOT_HOME` (no `.brainkit-version` marker), `installSkills` performs a full install (not a no-op).
- [ ] New `writeCopilotInstructions(copilotHome, config, vaultPath)` writes the brainkit system prompt to `$COPILOT_HOME/copilot-instructions.md` (same content as the old `writeAgentsMd`, just new location and filename).
- [ ] `installCopilotHooks(copilotHome)` writes `$COPILOT_HOME/hooks/scripts/auto-commit.js` (same `AUTO_COMMIT_SCRIPT` body as today). No standalone `hooks.json` file at user level.
- [ ] `generateCopilotSettings(copilotHome, statusScriptPath, autoCommitScriptPath)` writes `$COPILOT_HOME/settings.json` with:
  - `companyAnnouncements` (same content as today)
  - `statusLine` (same shape as today: `{ command: "node <abs path>" }`)
  - `hooks` inline (using the schema verified above), wired to absolute paths to the auto-commit script for `agentStop` and `sessionEnd` events
- [ ] `updateGitignore(vaultPath)` callsite is **removed** from the launch path AND **the function itself is deleted from `cli/copilot.ts`**. The migration's `.gitignore` removal logic is bespoke and does not reuse `updateGitignore`.
- [ ] `launchCopilot` spawns `copilot` with:
  - `cwd: vaultPath` (unchanged)
  - `env.COPILOT_HOME = getCopilotConfigDir()` (new)
  - `env.BRAINKIT_VAULT_PATH = vaultPath` (unchanged)
- [ ] `launchCopilot` ensures `$COPILOT_HOME` and its subdirs (`skills/`, `hooks/scripts/`) are created (`fs.mkdirSync({ recursive: true })`) before writing.
- [ ] Onboarding path (`vaultPath === undefined`) is **unchanged** — still uses `~/.config/brainkit/onboarding/` workspace, no `COPILOT_HOME` env var, no version check, no migration.

### Migration: mechanical legacy-file cleanup

Existing brainkit users have files at known brainkit-namespaced paths from prior versions. After the launcher rewrite, these files become inert duplicates. Two of them (`<vault>/AGENTS.md`, `<vault>/.agents/skills/brainkit/`) are auto-loaded by Copilot from `cwd` and corrupt the session every launch they remain.

The migration runs once per `$COPILOT_HOME`, gated by a marker file. It deletes the brainkit-namespaced paths unconditionally and content-gates `AGENTS.md`.

- [ ] New `migrateLegacyVaultFiles(vaultPath: string): void` function in `cli/copilot.ts`. Synchronous (no prompts).
- [ ] At the start of `launchCopilot` (after vault resolution, after `--config-dir` rejection, after the version check, before any `$COPILOT_HOME` setup), check `path.join(getCopilotConfigDir(), ".migration-v1")`. If present, skip migration. If absent, call `migrateLegacyVaultFiles(vaultPath)`.
- [ ] **Brainkit-namespaced paths — delete unconditionally if present:**
  - `<vault>/.agents/skills/brainkit/` (recursive)
  - `<vault>/.github/hooks/` (recursive — brainkit owns this entire subdir; users wouldn't put custom Copilot hooks here)
  - `<vault>/.github/copilot/` (recursive — same reasoning)
- [ ] **`AGENTS.md` — content-gated.** Only delete `<vault>/AGENTS.md` if it contains the literal substring `<!-- brainkit:generated -->` (sentinel) **OR** the literal substring `Brainkit is a personal second brain` (legacy preamble). If neither matches, leave the file untouched (it's a user-authored `AGENTS.md`, e.g., from a different agent harness).
- [ ] **`.gitignore` brainkit block — strip if contiguous.** Look for the four-line block (`# brainkit — generated files`, `.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) appearing contiguously in the file. Normalize line endings (`\r\n` → `\n`) before matching. If found, remove only those four lines (and one trailing blank line if present). If not found contiguously, leave the file untouched.
- [ ] **Cleanup empty parent dirs** in this order: `.agents/skills/`, `.agents/`, `.github/`. Use `fs.rmdirSync(path)` (without `recursive: true`) and swallow `ENOTEMPTY` / `ENOENT`. **Never** call `fs.rmSync({ recursive: true })` on `.github/` — it would destroy `.github/workflows/`, `CODEOWNERS`, etc.
- [ ] **Marker write.** After all deletions complete, ensure `getCopilotConfigDir()` exists (`mkdirSync({ recursive: true })`) and write `<copilotHome>/.migration-v1` with the current ISO timestamp. Versioned filename so a future migration can write `.migration-v2` without overloading v1.
- [ ] **User notice.** If anything was actually removed, print a single line via `@clack/prompts` (`note` or `log.info`):
  ```
  ✓ Brainkit moved Copilot config to ~/.config/brainkit/copilot/. Removed N legacy file(s) from your vault. Run `git status` to review; `git restore <path>` to recover.
  ```
  If nothing was removed (clean vault), print nothing.
- [ ] **Atomicity.** Wrap deletions in try/catch. On failure: print error notice mentioning what was removed before the failure, do **not** write the marker (safe retry on next launch), abort launch with non-zero exit.
- [ ] **No prompt, no interactive flow.** This is a one-way mechanical operation. Recovery is via git. The CHANGELOG entry plus the printed notice is the user-facing communication.

### Verification

- [ ] Existing `cli/__tests__/copilot.test.ts` tests pass after path-only assertion updates (full isolation test suite added in `add-isolation-tests.md`).
- [ ] `just lint` passes
- [ ] `just test` passes
- [ ] Manual smoke test: run `brainkit copilot` against a fresh test vault; confirm files appear in `~/.config/brainkit/copilot/` and **not** in the vault.

## Verification

- **Automated:** existing tests in `cli/__tests__/copilot.test.ts` updated to assert the new `$COPILOT_HOME/` paths and pass.
- **Ad-hoc smoke test (after wiring):**
  ```bash
  TMPCFG=$(mktemp -d)
  TMPVAULT=$(mktemp -d)
  # ... pre-populate TMPVAULT as a minimal brainkit vault, set up TMPCFG/config.toml
  BRAINKIT_CONFIG_DIR=$TMPCFG node dist/cli/index.js copilot --vault test
  # Confirm:
  ls $TMPCFG/copilot/         # should contain copilot-instructions.md, settings.json, skills/, hooks/, .migration-v1
  ls $TMPVAULT/               # should NOT contain AGENTS.md, .agents/, .github/hooks/, .github/copilot/
  ```
- **Ad-hoc legacy-vault smoke test:** pre-stage a vault with the six legacy artifacts, run `brainkit copilot`, confirm the brainkit-namespaced paths are gone, the brainkit `.gitignore` block is stripped, marker is written, notice is printed. Run again, confirm silent (marker honored).
- **Ad-hoc:** inside the spawned Copilot session, ask "what is brainkit?" — agent should respond with brainkit knowledge from the loaded skills/instructions.
- **Ad-hoc version warning:** temporarily mock `copilot --version` to return `1.0.20`. Run `brainkit copilot`. Confirm warning prints. Confirm launch continues.

## Notes

- The `HOOKS_CONFIG` and `AUTO_COMMIT_SCRIPT` constants can be deleted from `cli/copilot.ts` along with `updateGitignore` — the slim migration doesn't need shape comparison against the old hook config (it deletes the whole `.github/hooks/` dir unconditionally). `AUTO_COMMIT_SCRIPT` stays as the source of the script that gets written into `$COPILOT_HOME/hooks/scripts/auto-commit.js`.
- The `findPackageRoot()` helper, `ensureOnboardingWorkspace`, and `cleanupOnboardingWorkspace` are unchanged.
- The `statusScriptPath` is still `<packageRoot>/dist/cli/copilot-status.js` — same as today. Path is absolute, so `COPILOT_HOME` doesn't affect it.
- The `autoCommitScriptPath` for inline hook commands is the absolute path to the script in `$COPILOT_HOME/hooks/scripts/auto-commit.js` — derive from `getCopilotConfigDir()`.
- `BRAINKIT_VAULT_PATH` env var still gets read by the auto-commit script and the status script. No changes there.
- For the version check: `copilot --version` output format is currently `copilot version 1.0.37` (verify before parsing). Use a permissive regex (e.g., `/(\d+)\.(\d+)\.(\d+)/`) and compare numerically. Skip the check entirely if `copilot --version` errors or returns unparseable output.
- **Migration scope rationale.** The original spec proposed per-artifact shape detection + interactive confirmation prompt + customized-file preservation. We deliberately scoped it down: the audience is ~2 beta testers in direct contact, the destructive blast radius is bounded by git (`git restore` always recovers), and the brainkit-namespaced paths (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) have no realistic collision with non-brainkit user content. The only path with a real collision risk is `AGENTS.md` (a conventional filename used by other agent harnesses), which gets the content-gate. See conversation history on `.todo/US-copilot-isolation/` for the full reasoning.
- Why marker is written even on a clean vault: prevents the migration check from running every launch. Cheap insurance.
- Why marker is **not** written on deletion failure: lets the next launch retry. Marker is the success-completion signal.
