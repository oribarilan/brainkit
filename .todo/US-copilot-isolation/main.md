# US-copilot-isolation

## Goal

Migrate the Copilot CLI harness from writing brainkit-generated files into the user's vault to using `COPILOT_HOME` redirection to an isolated `~/.config/brainkit/copilot/` config directory. Existing users are migrated automatically with a clear notice on first launch after the update.

Design spec: `specs/US-copilot-isolation.md`.

## Definition of Done

- [ ] `brainkit copilot` launches Copilot with `COPILOT_HOME=~/.config/brainkit/copilot` and the brainkit system prompt active
- [ ] Vault is never written to during a Copilot launch (verified by automated test)
- [ ] User's `~/.copilot/` is never read or written (verified by automated test)
- [ ] All seven brainkit skills installed under `$COPILOT_HOME/skills/brainkit/` with same shape as before
- [ ] `companyAnnouncements`, `statusLine`, and auto-commit hooks (`agentStop`, `sessionEnd`) wired in `$COPILOT_HOME/settings.json`
- [ ] Existing brainkit users are auto-migrated on next launch: legacy vault files removed, `.gitignore` brainkit block removed, user notice printed, idempotency marker written
- [ ] Migration is conservative (strict shape/marker checks; preserves user-customized files including hand-modified `AGENTS.md`, modified `auto-commit.js`, modified `.gitignore` block)
- [ ] Migration is atomic (failures abort launch without writing marker; marker is written only after the **full** launcher setup completes successfully — not just after migration)
- [ ] Launcher detects `--config-dir` in user args and aborts with a clear error (it would defeat `COPILOT_HOME` isolation per Copilot docs precedence rules)
- [ ] Onboarding flow continues to work unchanged
- [ ] `just check` passes (lint + format + test)
- [ ] CI's `test-windows` job passes
- [ ] `AGENTS.md` § "Harness Config Isolation" updated to describe `COPILOT_HOME` use
- [ ] `specs/10-copilot-cli.md` updated; old vault-write sections marked deprecated
- [ ] `CHANGELOG.md` has a user-facing entry

## Task Priority

1. `add-copilot-config-dir-helper.md` — Add `getCopilotConfigDir()` to `core/vault.ts`. Tiny, isolated, unblocks everything downstream.
2. `verify-inline-hooks-schema.md` — Read Copilot CLI hooks documentation and verify the inline `hooks` schema in `settings.json`. Mechanical check that informs `generateCopilotSettings`. Can run in parallel with task 1.
3. `rewrite-copilot-launcher.md` — Rewrite `cli/copilot.ts` to write into `$COPILOT_HOME` instead of the vault. Spawn with `COPILOT_HOME` env var. Removes vault-write callsites. **Does not yet add migration** — that's task 4. (At this point, fresh installs work; existing users with legacy vault files would have stale duplicates.)
4. `add-migration.md` — Add `migrateLegacyVaultFiles` function with marker-gated atomic execution and user notice. Wire it into `launchCopilot` before any other launch step.
5. `add-isolation-tests.md` — Automated tests asserting (a) no vault writes during launch, (b) no `~/.copilot/` access, (c) migration removes legacy files correctly, (d) migration is idempotent, (e) migration preserves user-customized files. Non-negotiable per AGENTS.md.
6. `update-docs.md` — Update `AGENTS.md` § "Harness Config Isolation", `specs/10-copilot-cli.md` (rewrite affected sections, mark old behavior deprecated), `CHANGELOG.md`.

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.copilot/`. All brainkit state under `~/.config/brainkit/copilot/` via `COPILOT_HOME`.
- **Vault stays clean:** `launchCopilot` must not write any file under `vaultPath`. Verified by automated regression test.
- **Migration is one-shot and atomic:** marker file gates re-runs. Failures abort cleanly without writing the marker.
- **Migration is conservative:** strict shape/marker checks. When in doubt, leave the file alone and notify the user. Per user decision: delete regardless of git-tracked status, with clear notice that this is a brainkit-update migration.
- **No agent-driven migration.** Code-based only — must run before Copilot is spawned.
- **No new runtime dependencies.** Migration uses `node:fs` and `node:path`.
- **Cross-platform paths.** Use `node:path` everywhere. Hook command in `settings.json` uses absolute paths derived from `getCopilotConfigDir()`.
- **Onboarding flow stays as-is.** `~/.config/brainkit/onboarding/` is already sandboxed. Out of scope for this US.
- **Smoke test pre-validated** the core assumption (`$COPILOT_HOME/copilot-instructions.md` loads). See `specs/US-copilot-isolation.md` § "Smoke test results". No further smoke test task needed.

## Tasks deferred to follow-ups

- **Doc cleanup pass on `docs/*.md`** — many feature docs reference `AGENTS.md` as the brainkit system prompt for Copilot. A separate small follow-up can update those references after this US ships.
- **Removing `updateGitignore` function entirely** — keep around for the migration's gitignore-cleanup logic; delete in a cleanup commit later.
- **Unifying onboarding workspace into `COPILOT_HOME`** — adds complexity (overwriting `copilot-instructions.md` between launches), no immediate benefit. Defer until a real signal exists.
