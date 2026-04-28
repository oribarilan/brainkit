# add-isolation-tests

## Context

Add the automated test suite that verifies the load-bearing invariants of this US:

1. **Vault is never written to** during a Copilot launch on a fresh vault (the core "Harness Config Isolation" rule from `AGENTS.md`).
2. **`~/.copilot/` is never read or written** (we use `COPILOT_HOME` redirection, not the user's global Copilot config).
3. **Mechanical legacy-file migration** removes brainkit-namespaced paths, content-gates `AGENTS.md`, strips the `.gitignore` block, writes the marker.
4. **Migration is idempotent and atomic** (re-runs safe; failures don't write the marker).

Without this suite, future refactors could silently re-introduce vault writes or break the `AGENTS.md` content gate (the one path with a real "brainkit ate user data" risk).

**Value delivered:** A regression-proof guarantee that brainkit's Copilot harness stays isolated and the migration is safe.

## Related Files

- `cli/__tests__/copilot.test.ts` — extend with new test cases
- `cli/copilot.ts` — code under test
- `core/vault.ts` — `getCopilotConfigDir()` (mocked in tests)

## Dependencies

- `rewrite-copilot-launcher.md` — needs the new launcher and migration function to test

## Acceptance Criteria

The list below is intentionally lean: ~10 load-bearing tests covering the contract. Don't add more without a concrete regression you're guarding against.

### Isolation tests (3)

- [ ] **Vault stays clean during launch on a fresh vault (regression test):** Mock `getConfigDir` and `getCopilotConfigDir` to a temp dir. Pre-stage a fresh vault dir (only `brainkit.toml` and a `01_projects/` skeleton — no legacy artifacts). Capture a recursive file list of the vault. Run `launchCopilot(args, vaultPath)` (mock `spawnHarness` so it doesn't actually run Copilot). Capture the file list again. Assert the lists are identical. (Migration runs, finds nothing to remove, writes marker, no notice printed.)
- [ ] **`~/.copilot/` is never touched:** Wrap `fs.writeFileSync`, `fs.mkdirSync`, and `fs.readFileSync` to record paths. Run `launchCopilot`. Assert no recorded path resolves under `~/.copilot/`.
- [ ] **`COPILOT_HOME` env var is set on spawn:** Assert that `spawnHarness` was called with `env.COPILOT_HOME` equal to the (mocked) `getCopilotConfigDir()` value, and `env.BRAINKIT_VAULT_PATH` equal to `vaultPath`.

### Migration: deletion behavior (3)

- [ ] **Fully-shaped legacy vault → all brainkit-namespaced paths removed + AGENTS.md removed + gitignore stripped:** Pre-stage vault with: `AGENTS.md` containing the legacy preamble (`Brainkit is a personal second brain ...`), `.agents/skills/brainkit/.brainkit-version` + `SKILL.md`, `.github/hooks/hooks.json` and `.github/hooks/scripts/auto-commit.js`, `.github/copilot/settings.json`, `.gitignore` with the four-line brainkit block. Run `launchCopilot`. Assert: `AGENTS.md` gone, `.agents/skills/brainkit/` gone, `.github/hooks/` gone, `.github/copilot/` gone, brainkit `.gitignore` block stripped, marker `<copilotHome>/.migration-v1` exists, success notice printed mentioning N removed files and `git status` / `git restore` hints.
- [ ] **`AGENTS.md` content gate — non-brainkit AGENTS.md preserved:** Pre-stage `<vault>/AGENTS.md` with content `# My project agent rules\n\nUse TypeScript strict mode.\n` (no brainkit marker, no preamble). Pre-stage other brainkit-namespaced paths. Run `launchCopilot`. Assert: `AGENTS.md` is **unchanged on disk**, but `.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/` are gone, marker written. (This is the load-bearing safety test — if it regresses, brainkit will silently destroy non-brainkit user content.)
- [ ] **`AGENTS.md` content gate — sentinel match:** Pre-stage `<vault>/AGENTS.md` with content `<!-- brainkit:generated -->\n\n# Anything goes here\n` (sentinel only, no legacy preamble). Run `launchCopilot`. Assert `AGENTS.md` is removed.

### Migration: edge cases (2)

- [ ] **`.gitignore` with `\r\n` line endings still matches:** Pre-stage `.gitignore` with the four brainkit lines using Windows-style `\r\n` line endings. Pre-stage other matching artifacts. Run `launchCopilot`. Assert the brainkit block is stripped (line endings normalized before match). The remaining `.gitignore` content (user lines around the block) is preserved.
- [ ] **`.gitignore` with brainkit lines split / interleaved with user lines → not stripped:** Pre-stage a `.gitignore` where the four brainkit lines are non-contiguous (user has a comment between them, for example). Run `launchCopilot`. Assert: `.gitignore` is unchanged on disk (we only strip contiguous blocks; non-contiguous suggests user customization). Other brainkit-namespaced paths still get cleaned.

### Migration: idempotency / atomicity (2)

- [ ] **Marker present → migration skipped:** Pre-stage marker file. Pre-stage legacy vault files. Run `launchCopilot`. Assert legacy files still in vault (migration did not run). No notice printed.
- [ ] **Atomic deletion failure → marker NOT written:** Mock `fs.rmSync` to throw `EACCES` on the second call. Pre-stage a fully-shaped vault. Run `launchCopilot`. Assert it throws / exits non-zero. Assert error notice mentions what was removed before the failure point. Assert the marker file was **NOT** written (so a retry on the next launch can complete the migration).

### `--config-dir` rejection (1)

- [ ] **`--config-dir` in args aborts launch:** Parameterized test for both `["--config-dir", "/some/path"]` and `["--config-dir=/some/path"]`. Assert: launch exits non-zero with a clear error mentioning `--config-dir` is not supported. Assert no files were written under `$COPILOT_HOME` (we abort before any setup). Assert no migration ran.

### End-to-end happy path (1)

- [ ] **Legacy vault → first launch migrates → second launch is silent:** Pre-stage a fully-shaped legacy vault (with the legacy-preamble `AGENTS.md`). Mock `getCopilotConfigDir` to a temp dir. Mock `spawnHarness`. Run `launchCopilot(args, vaultPath)`. Assert: (a) success notice printed mentioning removed files, (b) all legacy brainkit-namespaced paths gone from vault, (c) `$COPILOT_HOME/{copilot-instructions.md, settings.json, skills/brainkit/, hooks/scripts/auto-commit.js}` all exist with expected shapes, (d) `$COPILOT_HOME/.migration-v1` marker exists, (e) `spawnHarness` called with `COPILOT_HOME` set. Then run `launchCopilot` a **second time** against the same vault + config dir. Assert: (a) no migration notice printed, (b) `spawnHarness` called again with the same env, (c) marker file unchanged.

### Coverage

- [ ] All new tests pass on macOS / Linux (local) and Windows (CI `test-windows` job)
- [ ] `just check` passes
- [ ] No existing test deleted; existing tests for `ensureOnboardingWorkspace` / `cleanupOnboardingWorkspace` continue to pass

## Verification

- **Automated:** the test suite itself is the verification. Run `just test cli/__tests__/copilot.test.ts` and confirm all new cases pass plus all existing cases remain green.
- **CI:** push a branch and confirm the `test-windows` GitHub Actions job passes.

## Notes

- Use the **temp-dir pattern** (existing tests in `cli/__tests__/copilot.test.ts` use temp dirs — follow that convention). Do not introduce `mock-fs` or any new test infra.
- For the "vault stays clean on fresh vault" assertion, walk the directory recursively (`fs.readdirSync(..., { recursive: true })` or a small helper). Compare sorted arrays.
- For the "no `~/.copilot` access" assertion, wrap `fs.readFileSync` / `fs.writeFileSync` / `fs.mkdirSync` and record paths, then assert. Alternatively: set `HOME=/tmp/fake-home` in the test env and assert `/tmp/fake-home/.copilot` doesn't exist after the launch.
- Spawn the launcher with a mocked `spawnHarness` so the Copilot binary is never actually invoked during tests.
- Tests intentionally **not** included (and why):
  - Per-artifact shape-detection tests (deep-equal `hooks.json`, trimmed `auto-commit.js`, `settings.json` keys check, etc.) — the slim migration deletes brainkit-namespaced paths unconditionally; there's no shape detection to test for those. The only content gate is on `AGENTS.md`, covered by the two `AGENTS.md` tests above.
  - Prompt approve/decline flow tests — no prompt anymore.
  - Customized-file-preserved tests for files inside brainkit-namespaced paths — those paths get nuked unconditionally; if a user customized `auto-commit.js` they lose it (and recover via git). This is the deliberate scope decision documented in `rewrite-copilot-launcher.md` § Notes.
