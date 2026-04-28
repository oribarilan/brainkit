# US-copilot-isolation

## Goal

Migrate the Copilot CLI harness from writing brainkit-generated files into the user's vault to using `COPILOT_HOME` redirection to an isolated `~/.config/brainkit/copilot/` config directory. Existing users are migrated on first launch via a **slim mechanical migration**: brainkit-namespaced paths (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) are deleted unconditionally; `AGENTS.md` is content-gated (deleted only if it has the brainkit sentinel or legacy preamble — preserves user-authored `AGENTS.md`); the contiguous `.gitignore` brainkit block is stripped; recovery is via `git restore <path>`.

Design spec: `specs/US-copilot-isolation.md`. (Spec written under earlier per-file-then-all-or-nothing detection model; this US executes the slim mechanical model — see `rewrite-copilot-launcher.md` § Migration for the authoritative behavior. Scope rationale: ~2 beta testers in direct contact made the original interactive prompt + per-artifact shape detection over-engineered for the audience.)

## Definition of Done

- [ ] `brainkit copilot` launches Copilot with `COPILOT_HOME=~/.config/brainkit/copilot` and the brainkit system prompt active
- [ ] Vault is never written to during a Copilot launch on a fresh vault (no legacy artifacts) — verified by automated test
- [ ] User's `~/.copilot/` is never read or written (verified by automated test)
- [ ] All seven brainkit skills installed under `$COPILOT_HOME/skills/brainkit/` with same shape as before
- [ ] `companyAnnouncements`, `statusLine`, and auto-commit hooks (`agentStop`, `sessionEnd`) wired in `$COPILOT_HOME/settings.json`
- [ ] Existing brainkit users with legacy vault files have brainkit-namespaced paths (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) and the brainkit `.gitignore` block removed on next launch. `AGENTS.md` is removed only if it contains the brainkit sentinel `<!-- brainkit:generated -->` or the legacy preamble (`Brainkit is a personal second brain`); a non-brainkit `AGENTS.md` is preserved untouched.
- [ ] Migration removes files from the working tree but does **not** auto-commit. After successful removal, a single notice is printed pointing the user at `git status` for review and `git restore <path>` for recovery.
- [ ] Migration is atomic (deletion failures abort launch without writing marker; partial removed[] reported in the error notice so the user can recover via `git status`)
- [ ] Marker file `<copilotHome>/.migration-v1` written on successful completion (including clean-vault no-op) so we don't re-check on subsequent launches. User can delete the marker to re-trigger.
- [ ] Launcher detects `--config-dir` in user args (both `--config-dir <val>` and `--config-dir=<val>` forms) and aborts with a clear error
- [ ] Launcher checks `copilot --version` and prints a warning (does not abort) if below v1.0.37, the verified-good version where `COPILOT_HOME` is honored
- [ ] Onboarding flow continues to work unchanged
- [ ] **End-to-end happy path verified by automated test:** legacy vault → first `brainkit copilot` launch removes brainkit-namespaced paths + populates `$COPILOT_HOME` + spawns Copilot with `COPILOT_HOME` env; second launch is silent (marker honored). Test lives in `cli/__tests__/copilot.test.ts` per `add-isolation-tests.md`.
- [ ] **`AGENTS.md` content-gate verified by automated test:** a non-brainkit `AGENTS.md` is preserved untouched while brainkit-namespaced paths are still cleaned. This is the load-bearing safety test.
- [ ] `just check` passes (lint + format + test)
- [ ] CI's `test-windows` job passes
- [ ] `AGENTS.md` § "Harness Config Isolation" updated to describe `COPILOT_HOME` use
- [ ] `specs/10-copilot-cli.md` updated; old vault-write sections marked deprecated
- [ ] `CHANGELOG.md` has a user-facing entry

## Task Priority

1. `add-copilot-config-dir-helper.md` — Add `getCopilotConfigDir()` to `core/vault.ts`. Tiny, isolated, unblocks everything downstream.
2. `rewrite-copilot-launcher.md` — Rewrite `cli/copilot.ts` to write into `$COPILOT_HOME` instead of the vault. Spawn with `COPILOT_HOME` env var. Includes inline-hooks schema verification, Copilot CLI version check at launch, and the slim mechanical legacy-file migration (folded in from a previously separate `add-migration.md` task that was scoped down).
3. `add-isolation-tests.md` — Automated tests asserting (a) no vault writes during launch on fresh vault, (b) no `~/.copilot/` access, (c) brainkit-namespaced paths removed on legacy vaults, (d) `AGENTS.md` content gate (preserves non-brainkit files), (e) atomicity, (f) end-to-end happy path. ~10 load-bearing tests.
4. `update-docs.md` — Update `AGENTS.md` § "Harness Config Isolation", `specs/10-copilot-cli.md` (rewrite affected sections, mark old behavior deprecated), `CHANGELOG.md`.

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.copilot/`. All brainkit state under `~/.config/brainkit/copilot/` via `COPILOT_HOME`.
- **Vault stays clean on fresh vaults:** `launchCopilot` must not write any file under `vaultPath` when no legacy artifacts are present. The only vault writes (in fact, deletes) happen during the migration. Verified by automated test.
- **`AGENTS.md` is the one path with real collision risk.** It's a conventional filename used by other agent harnesses (Claude Code, Codex, etc.) — a user could legitimately have their own `AGENTS.md` in the vault root unrelated to brainkit. The content gate (sentinel or legacy preamble required) is the load-bearing safety check that prevents brainkit from silently destroying non-brainkit user content. Everything else lives at brainkit-namespaced paths (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) where collision with non-brainkit user content is implausible.
- **Mechanical, not interactive.** No confirmation prompt, no per-artifact shape detection, no `customized` bucket. The audience is ~2 known beta testers in direct contact; git is the safety net (`git restore <path>` recovers any file). Communication is via the CHANGELOG entry plus a single printed post-deletion notice.
- **Migration is one-shot and atomic:** marker file gates re-runs. Deletion failures abort the launch and don't write the marker (safe retry).
- **No auto-commit.** Migration removes files from the working tree but never runs `git add` / `git commit`. User reviews via `git status` and stages the deletions at their leisure.
- **No agent-driven migration.** Code-based only — must run before Copilot is spawned, otherwise Copilot loads stale `<vault>/AGENTS.md` and `<vault>/.agents/skills/` from `cwd` and corrupts the session that's supposed to clean them up.
- **No new runtime dependencies.** Migration uses `node:fs` and `node:path` only.
- **Cross-platform paths.** Use `node:path` everywhere. Hook command in `settings.json` uses absolute paths derived from `getCopilotConfigDir()`.
- **`.gitignore` block removal is conservative.** Only strip the four-line block if it appears contiguously (line-ending-normalized). If split / interleaved with user lines, leave the file untouched — the user customized it, and the four lines are inert clutter at worst.
- **Never recursive-delete `.github/`.** It contains user-owned content (`workflows/`, `CODEOWNERS`, etc.). Only `.github/hooks/` and `.github/copilot/` (brainkit-owned subdirs) are removed; `.github/` itself is `rmdir`'d only if empty.
- **Onboarding flow stays as-is.** `~/.config/brainkit/onboarding/` is already sandboxed. Out of scope for this US.
- **Smoke test pre-validated** the core assumption (`$COPILOT_HOME/copilot-instructions.md` loads on Copilot CLI v1.0.37). See `specs/US-copilot-isolation.md` § "Smoke test results". The launcher's version warning catches users on older Copilot CLI versions where the assumption may not hold.

## Tasks deferred to follow-ups

- **Doc cleanup pass on `docs/*.md`** — six feature docs (`para.md`, `doctor.md`, `bragfile.md`, `meeting-notes.md`, `contacts.md`, `onboarding.md`) reference `AGENTS.md` as the brainkit system prompt for Copilot in side-by-side comparison tables. Audit performed during this US (see `update-docs.md` notes). Contributor-facing only; not user-impacting. A separate small follow-up updates these references.
- **`docs/doctor.md` orphan-file check** — verified during this US: `core/vault.ts:588` already includes `AGENTS.md` in `allowedRootEntries`, so a user-authored `AGENTS.md` won't be false-flagged. No action needed.
- **Unifying onboarding workspace into `COPILOT_HOME`** — adds complexity (overwriting `copilot-instructions.md` between launches), no immediate benefit. Defer until a real signal exists.
