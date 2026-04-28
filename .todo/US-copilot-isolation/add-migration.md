# add-migration

## Context

Existing brainkit users have files in their vault from prior versions: `<vault>/AGENTS.md`, `<vault>/.agents/skills/brainkit/`, `<vault>/.github/hooks/hooks.json`, `<vault>/.github/hooks/scripts/auto-commit.js`, `<vault>/.github/copilot/settings.json`, and a brainkit block in `<vault>/.gitignore`. After `rewrite-copilot-launcher.md` lands, these files become stale duplicates that pollute the vault.

This task adds `migrateLegacyVaultFiles(vaultPath)` to `cli/copilot.ts`. It runs once on the first `brainkit copilot` launch after the update, removes the legacy files, removes the brainkit `.gitignore` block, prints a clear user notice, and writes a marker file (`~/.config/brainkit/copilot/.migration-v1`) to skip on subsequent launches.

Migration policy decisions (locked in):
- **Code-based, not agent-driven** (must run before Copilot is spawned; deterministic and testable).
- **Delete regardless of git-tracked status**, per user decision, with clear notice that this is a brainkit-update migration.
- **Conservative**: strict shape/marker checks. If a file doesn't match exactly, leave it and add to a "preserved" notice.
- **Atomic**: any failure during migration aborts the launch and does not write the marker, so retry is safe.

**Value delivered:** Existing users transition cleanly to the new isolated config without manual cleanup, and without surprises.

## Related Files

- `cli/copilot.ts` — add `migrateLegacyVaultFiles` function and call it from `launchCopilot` before any other launch step
- `core/vault.ts` — uses `getCopilotConfigDir()` (from `add-copilot-config-dir-helper.md`)
- `core/system-prompt.ts` / `core/prompt-sections.ts` — source of the brainkit preamble marker string used to detect a brainkit-generated `AGENTS.md`

## Dependencies

- `rewrite-copilot-launcher.md` — migration calls into the new launcher flow; both ship together
- `add-copilot-config-dir-helper.md` — uses `getCopilotConfigDir()`

## Acceptance Criteria

- [ ] New `migrateLegacyVaultFiles(vaultPath: string): MigrationReport` function in `cli/copilot.ts`. `MigrationReport` has at least `removed: string[]` (paths relative to vault) and `preserved: string[]` (paths left in place with reasons).
- [ ] At the start of `launchCopilot` (after vault resolution, before any other step), check `path.join(getCopilotConfigDir(), ".migration-v1")`. If present, skip migration. If absent, run migration.
- [ ] Migration removes the following from `<vault>` when detection passes:
   - `AGENTS.md` if its content starts with the brainkit preamble marker (a stable substring from the start of `buildPreamble()` output)
   - `.agents/skills/brainkit/` if it contains a `.brainkit-version` file inside (recursive delete)
   - `.agents/skills/` and `.agents/` if empty after the above
   - `.github/hooks/hooks.json` if its content matches the current brainkit `HOOKS_CONFIG` JSON exactly (`JSON.stringify(HOOKS_CONFIG, null, 2) + "\n"`)
   - `.github/hooks/scripts/auto-commit.js` if it exists (always brainkit-owned at this path, regardless of content)
   - `.github/hooks/scripts/` and `.github/hooks/` if empty after the above
   - `.github/copilot/settings.json` if its parsed JSON has only the keys `companyAnnouncements` and `statusLine` (matches our exact shape)
   - `.github/copilot/` if empty after the above
   - `.github/` if empty after all of the above (do NOT remove if it has user-owned content like `workflows/`, `dependabot.yml`, etc.)
- [ ] Migration removes from `<vault>/.gitignore` the four-line contiguous block:
   ```
   # brainkit — generated files
   .agents/skills/brainkit/
   .github/hooks/
   .github/copilot/
   ```
   If the block exists exactly, it's removed (along with one surrounding blank line if applicable to keep file tidy). If the block has been split or modified by the user, leave the file alone and add to `preserved`.
- [ ] When detection fails for an item (e.g., `AGENTS.md` lacks brainkit marker), the file is left untouched and added to `preserved` with a brief reason.
- [ ] Migration is wrapped in `try/catch`. On failure: print the error via `@clack/prompts`, do **not** write the marker file, abort the launch with non-zero exit. On success: write `$COPILOT_HOME/.migration-v1` (creates dir if needed), then continue with launch.
- [ ] User notice is printed via `@clack/prompts` after successful migration. Notice lists removed items and (separately) preserved items. Notice mentions "if any of these were tracked by git, commit the deletions when ready: `git add -A && git commit -m 'brainkit: migrate to isolated config'`". If nothing was removed (clean vault), no notice is printed (silent success), but the marker is still written.
- [ ] Migration is idempotent: running it twice (by manually deleting and recreating the marker) on the same legacy vault produces the same result with no errors.
- [ ] `just lint` passes
- [ ] `just test` passes (test suite added in `add-isolation-tests.md`)

## Verification

- **Automated:** test suite in `add-isolation-tests.md` covers the migration cases. This task's verification is mostly via that test suite (acceptable — the tests ship together).
- **Ad-hoc legacy-vault smoke test:**
  ```bash
  TMPVAULT=$(mktemp -d)
  # Pre-stage a legacy vault: write the six brainkit-shaped files
  echo "# Brainkit system prompt..." > $TMPVAULT/AGENTS.md  # use real preamble marker
  mkdir -p $TMPVAULT/.agents/skills/brainkit
  echo "0.5.0" > $TMPVAULT/.agents/skills/brainkit/.brainkit-version
  # ... etc for hooks/, copilot/, .gitignore block
  # Run brainkit copilot
  BRAINKIT_CONFIG_DIR=/tmp/bk-test brainkit copilot --vault $TMPVAULT
  # Confirm: notice printed; files removed; marker file exists
  ls $TMPVAULT  # should be clean
  ls /tmp/bk-test/copilot/.migration-v1  # should exist
  # Run again
  brainkit copilot --vault $TMPVAULT
  # Confirm: no migration notice (marker present)
  ```

## Notes

- The brainkit preamble marker string should be the first ~80 characters of what `buildPreamble()` produces — pick a stable substring that won't change between brainkit versions. If the preamble itself changes, the marker logic still works as long as historical preambles all start with that substring.
- For the `hooks.json` shape match: use `JSON.parse` + deep-equal comparison rather than string comparison, to be tolerant of formatting differences (trailing newline, whitespace). Current implementation writes `JSON.stringify(HOOKS_CONFIG, null, 2) + "\n"`, but a user might have re-formatted via their editor.
- For the `settings.json` shape match: parse the JSON, check `Object.keys(parsed).sort()` equals `["companyAnnouncements", "statusLine"]` exactly.
- Marker file is **versioned** (`.migration-v1`). Future migrations write `.migration-v2`, etc., and check their own marker. Don't overload v1.
- Don't bother with a "dry run" mode. The migration is conservative and reversible (user can `git restore` if they had committed the legacy files). Silent success on clean vaults keeps the UX clean.
- Do not remove the brainkit entries from `.gitignore` if other lines were added inside our block by the user (the block-detection check covers this — if the block is contiguous and unchanged, remove; otherwise leave).
