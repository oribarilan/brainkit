# add-isolation-tests

## Context

Add the automated test suite that verifies the load-bearing invariants of this US:
1. **Vault is never written to** during a Copilot launch (the core "Harness Config Isolation" rule from `AGENTS.md`).
2. **`~/.copilot/` is never read or written** (we use `COPILOT_HOME` redirection, not the user's global Copilot config).
3. **Migration removes legacy vault files correctly** under the documented policy.
4. **Migration is conservative** (preserves user-customized files).
5. **Migration is idempotent** (running it twice does nothing harmful).
6. **Migration is atomic** (failures don't write the marker, allowing safe retry).

Without this suite, future refactors could silently re-introduce vault writes or weaken the migration. With it, regressions surface immediately in CI.

**Value delivered:** A regression-proof guarantee that brainkit's Copilot harness stays isolated and migration is safe.

## Related Files

- `cli/__tests__/copilot.test.ts` — extend with new test cases
- `cli/copilot.ts` — code under test
- `core/vault.ts` — `getCopilotConfigDir()` (mocked in tests)

## Dependencies

- `rewrite-copilot-launcher.md` — needs the new launcher to test isolation
- `add-migration.md` — needs the migration function to test migration scenarios

## Acceptance Criteria

### Isolation tests

- [ ] **Vault stays clean during launch (regression test):** Mock `getConfigDir` and `getCopilotConfigDir` to a temp dir. Pre-stage a fresh vault dir (only `brainkit.toml` and a `01_projects/` skeleton). Capture a recursive file list of the vault. Run `launchCopilot(args, vaultPath)` (mock `spawnHarness` so it doesn't actually run Copilot). Capture the file list again. Assert the lists are identical.
- [ ] **`~/.copilot/` is never touched:** Set up a mock filesystem watcher (or wrap `fs.writeFileSync` / `fs.mkdirSync`) that records every path written. Run `launchCopilot`. Assert no recorded path starts with `~/.copilot` (resolved). Assert no recorded path is read from `~/.copilot` either (wrap `fs.readFileSync`).
- [ ] **`COPILOT_HOME` env var is set on spawn:** Assert that `spawnHarness` was called with `env.COPILOT_HOME` equal to the (mocked) `getCopilotConfigDir()` value, and `env.BRAINKIT_VAULT_PATH` equal to `vaultPath`.

### Migration tests (vault with legacy files)

- [ ] **All legacy files removed:** Pre-stage vault with `AGENTS.md` (containing brainkit preamble marker), `.agents/skills/brainkit/.brainkit-version` + `SKILL.md`, `.github/hooks/hooks.json` (matching `HOOKS_CONFIG`), `.github/hooks/scripts/auto-commit.js`, `.github/copilot/settings.json` (only `companyAnnouncements` + `statusLine` keys), and `.gitignore` with the brainkit block. Run `launchCopilot`. Assert all six artifacts are gone, the brainkit `.gitignore` block is gone, marker file `<copilotHome>/.migration-v1` exists, and the user notice was printed.
- [ ] **Cleanup of empty parent dirs:** After migration of the above, assert `.agents/skills/`, `.agents/`, `.github/hooks/scripts/`, `.github/hooks/`, `.github/copilot/`, and `.github/` are all removed (since they're empty).
- [ ] **`.github/` preserved when non-brainkit content exists:** Pre-stage with `.github/workflows/ci.yml` alongside the brainkit files. After migration, assert `.github/workflows/ci.yml` still exists and `.github/` directory still exists, but `.github/hooks/` and `.github/copilot/` are removed.

### Migration tests (conservative preservation)

- [ ] **`AGENTS.md` without brainkit marker is preserved:** Pre-stage `<vault>/AGENTS.md` with content "# My custom agent instructions\n..." (no brainkit marker). Run `launchCopilot`. Assert `AGENTS.md` still exists with original content. Assert it appears in the "preserved" portion of the user notice.
- [ ] **`hooks.json` with extra keys is preserved:** Pre-stage `.github/hooks/hooks.json` containing `HOOKS_CONFIG` plus an extra `myCustomKey: "value"`. Assert file is left in place.
- [ ] **`settings.json` with extra keys is preserved:** Pre-stage `.github/copilot/settings.json` with `{ companyAnnouncements, statusLine, mergeStrategy: "rebase" }`. Assert file is left in place.
- [ ] **`.gitignore` with split / modified brainkit block is preserved:** Pre-stage `.gitignore` with the four brainkit lines but interleaved with user-added lines, OR with one of the brainkit lines edited. Assert `.gitignore` is left untouched.

### Migration idempotency / atomicity

- [ ] **Marker present → migration skipped:** Pre-stage marker file. Pre-stage legacy vault files. Run `launchCopilot`. Assert legacy files are still in vault (migration did not run). No user notice printed.
- [ ] **Idempotent re-run:** Run migration on a fully-legacy vault to completion. Manually delete the marker file. Run migration again. Assert it succeeds (no errors), notice is printed again with empty "removed" list (or no notice if implementation prefers to skip when nothing to do), marker is rewritten.
- [ ] **Atomic failure:** Mock `fs.unlinkSync` to throw on the third deletion call. Pre-stage a fully-legacy vault. Run `launchCopilot`. Assert it throws / exits non-zero. Assert the marker file was **not** written. Assert any deletions before the failure are visible (partial cleanup is acceptable; the contract is "marker is only written on full success").
- [ ] **Clean vault → silent success:** Pre-stage a vault with only `brainkit.toml` and `01_projects/` (no legacy files). Run `launchCopilot`. Assert no user notice was printed (or only a "Continuing to launch..." style minimal notice). Assert marker file was written.

### Coverage

- [ ] All new tests pass on macOS / Linux (local) and Windows (CI `test-windows` job)
- [ ] `just check` passes
- [ ] No existing test was deleted; existing tests for `ensureOnboardingWorkspace` / `cleanupOnboardingWorkspace` continue to pass

## Verification

- **Automated:** the test suite itself is the verification. Run `just test cli/__tests__/copilot.test.ts` and confirm all new cases pass plus all existing cases remain green.
- **CI:** push a branch and confirm the `test-windows` GitHub Actions job passes.

## Notes

- Use `mock-fs` or a temp-dir pattern (the existing tests in `cli/__tests__/copilot.test.ts` already use temp dirs — follow that convention for consistency).
- For the "vault stays clean" assertion, walk the directory recursively (e.g., `fs.readdirSync(..., { recursive: true })` or a small helper). Compare sorted arrays.
- For the "no `~/.copilot` access" assertion, the cleanest approach is to mock `fs.readFileSync` / `fs.writeFileSync` / `fs.mkdirSync` and record paths, then assert. Alternatively: set `HOME=/tmp/fake-home` in the test env and assert `/tmp/fake-home/.copilot` doesn't exist after the launch.
- Spawn the launcher with a mocked `spawnHarness` so the Copilot binary is never actually invoked during tests (no network, no auth, no slow tests).
- The user notice can be asserted by mocking `@clack/prompts` and inspecting the calls.
