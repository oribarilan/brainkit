# rewrite-copilot-launcher

## Context

Rewrite `cli/copilot.ts` so that `launchCopilot` writes brainkit's skills, system prompt, hook script, and settings to `$COPILOT_HOME/` (= `getCopilotConfigDir()`) instead of into the user's vault. Spawn Copilot with `COPILOT_HOME` env var set so it loads everything from brainkit's isolated dir.

**Does not yet add the migration** for existing users — that's `add-migration.md`. After this task, fresh installs work cleanly. Existing brainkit users would have stale duplicate files in their vault until the migration task lands; both tasks should ship together.

**Value delivered:** Fresh `brainkit copilot` launches no longer pollute the vault. The OpenCode isolation model is now also active for Copilot.

## Related Files

- `cli/copilot.ts` — full rewrite of orchestrator and helper functions
- `cli/install-skills.ts` — unchanged; just called with new `targetDir`
- `core/vault.ts` — uses `getCopilotConfigDir()` from `add-copilot-config-dir-helper.md`
- `cli/__tests__/copilot.test.ts` — assertions update to point at `$COPILOT_HOME` paths (full test rewrite happens in `add-isolation-tests.md`; this task just keeps existing tests passing with the new paths)

## Dependencies

- `add-copilot-config-dir-helper.md` — needs `getCopilotConfigDir()` exported from `core/`
- `verify-inline-hooks-schema.md` — needs the verified schema for `generateCopilotSettings`

## Acceptance Criteria

- [ ] `installSkills` is called with `targetDir: path.join(getCopilotConfigDir(), "skills", "brainkit")` instead of `<vault>/.agents/skills/brainkit`
- [ ] New `writeCopilotInstructions(copilotHome, config, vaultPath)` writes the brainkit system prompt to `$COPILOT_HOME/copilot-instructions.md` (same content as the old `writeAgentsMd`, just new location and filename)
- [ ] `installCopilotHooks(copilotHome)` writes `$COPILOT_HOME/hooks/scripts/auto-commit.js` (same `AUTO_COMMIT_SCRIPT` body as today). No standalone `hooks.json` file at user level.
- [ ] `generateCopilotSettings(copilotHome, statusScriptPath, autoCommitScriptPath)` writes `$COPILOT_HOME/settings.json` with:
   - `companyAnnouncements` (same content as today)
   - `statusLine` (same shape as today: `{ command: "node <abs path>" }`)
   - `hooks` inline (using the schema verified in `verify-inline-hooks-schema.md`), wired to absolute paths to the auto-commit script for `agentStop` and `sessionEnd` events
- [ ] `updateGitignore(vaultPath)` callsite is **removed** from the launch path. The function may stay in the file for use by the migration task; it's no longer called during normal launch.
- [ ] `launchCopilot` spawns `copilot` with:
   - `cwd: vaultPath` (unchanged)
   - `env.COPILOT_HOME = getCopilotConfigDir()` (new)
   - `env.BRAINKIT_VAULT_PATH = vaultPath` (unchanged)
- [ ] `launchCopilot` ensures `$COPILOT_HOME` and its subdirs (`skills/`, `hooks/scripts/`) are created (`fs.mkdirSync({ recursive: true })`) before writing
- [ ] Onboarding path (`vaultPath === undefined`) is **unchanged** — still uses `~/.config/brainkit/onboarding/` workspace, no `COPILOT_HOME` env var
- [ ] Existing `cli/__tests__/copilot.test.ts` tests pass after path-only assertion updates (full isolation test suite added in `add-isolation-tests.md`)
- [ ] `just lint` passes
- [ ] `just test` passes
- [ ] Manual smoke test: run brainkit copilot against a fresh test vault; confirm files appear in `~/.config/brainkit/copilot/` and **not** in the vault

## Verification

- **Automated:** existing tests in `cli/__tests__/copilot.test.ts` updated to assert the new `$COPILOT_HOME/` paths and pass.
- **Ad-hoc smoke test (after wiring):**
  ```bash
  # Use a throwaway BRAINKIT_CONFIG_DIR so we don't touch real config
  TMPCFG=$(mktemp -d)
  TMPVAULT=$(mktemp -d)
  # ... pre-populate TMPVAULT as a minimal brainkit vault, set up TMPCFG/config.toml
  BRAINKIT_CONFIG_DIR=$TMPCFG node dist/cli/index.js copilot --vault test
  # Confirm:
  ls $TMPCFG/copilot/         # should contain copilot-instructions.md, settings.json, skills/, hooks/
  ls $TMPVAULT/               # should NOT contain AGENTS.md, .agents/, .github/
  ```
- **Ad-hoc:** inside the spawned Copilot session, ask "what is brainkit?" — agent should respond with brainkit knowledge from the loaded skills/instructions (proves the prompt + skills loaded from the new location).

## Notes

- Keep `updateGitignore` and the old `HOOKS_CONFIG` constant in `cli/copilot.ts` for now — the migration task in `add-migration.md` needs them for cleanup-detection logic. Delete in a follow-up cleanup commit after migration logic stabilizes.
- The `findPackageRoot()` helper, `ensureOnboardingWorkspace`, and `cleanupOnboardingWorkspace` are unchanged.
- The `statusScriptPath` is still `<packageRoot>/dist/cli/copilot-status.js` — same as today. Path is absolute, so `COPILOT_HOME` doesn't affect it.
- The `autoCommitScriptPath` for inline hook commands is the absolute path to the script in `$COPILOT_HOME/hooks/scripts/auto-commit.js` — derive from `getCopilotConfigDir()`.
- `BRAINKIT_VAULT_PATH` env var still gets read by the auto-commit script and the status script. No changes there.
