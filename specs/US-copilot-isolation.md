# US-copilot-isolation — Migrate Copilot CLI to isolated `COPILOT_HOME`

Status: Approved design (post-smoke-test), ready for implementation
Date: 2026-04-28

## Goal

Stop polluting the user's vault with brainkit-generated files when they use the Copilot CLI harness. Use Copilot CLI's `COPILOT_HOME` environment variable to redirect Copilot at a brainkit-owned config directory at `~/.config/brainkit/copilot/`, mirroring the OpenCode isolation model. Migrate existing users automatically via deterministic code-based migration with a clear user notice.

This brings Copilot CLI in line with brainkit's non-negotiable "Harness Config Isolation" rule (see `AGENTS.md`): brainkit must never modify the user's normal harness configuration, and must use a dedicated, isolated config so the user's regular setup is untouched.

## Why This Approach

Copilot CLI's extensibility model now matches OpenCode's well enough to use the same template:

- **Config isolation via env var** — `COPILOT_HOME` redirects the entire `~/.copilot` config dir. `--config-dir` flag takes precedence. This is the direct analog of `OPENCODE_CONFIG` and is the mechanism that satisfies brainkit's harness-isolation rule.
- **User-level instructions** — `$COPILOT_HOME/copilot-instructions.md` is loaded automatically at session start (verified via smoke test on Copilot CLI v1.0.37, see "Smoke test results" below).
- **User-level skills** — `$COPILOT_HOME/skills/<name>/SKILL.md` is the documented location.
- **User-level hooks** — defined inline in `$COPILOT_HOME/settings.json` under the `hooks` key.
- **`statusLine` and `companyAnnouncements`** — both live in the same user-level `settings.json`.

The current implementation predates the discovery of `COPILOT_HOME` and writes six brainkit-owned things into the vault (`AGENTS.md`, `.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`, `.gitignore` entries, plus a hook script). This violates the isolation rule and is observably fragile — `AGENTS.md` loading in Copilot CLI has been buggy across versions per multiple GitHub issues (#489, #713, #1292), so the current behavior may not even have been working reliably for all users.

## Smoke test results (Copilot CLI v1.0.37, 2026-04-28)

| Test | Result |
|---|---|
| `$COPILOT_HOME/copilot-instructions.md` loaded? | ✅ Yes (marker appeared in response) |
| `$COPILOT_HOME/AGENTS.md` loaded? | ❌ No (marker did not appear) |
| `COPILOT_HOME` actually redirects from `~/.copilot/`? | ✅ Yes |

**Conclusions baked into this design:**
- Use `COPILOT_HOME` for full isolation (instructions, skills, settings, hooks).
- Use `copilot-instructions.md` (the documented file), not `AGENTS.md`, at `$COPILOT_HOME`.

## Definition of Done (story-level)

- [ ] `brainkit copilot` (and `brainkit cp`) launches Copilot CLI with `COPILOT_HOME=~/.config/brainkit/copilot`
- [ ] Brainkit's system prompt is loaded from `$COPILOT_HOME/copilot-instructions.md` and active in the session (verified by an automated test that asserts the file is written with expected content, plus an ad-hoc smoke test)
- [ ] All seven brainkit skills (`brainkit`, `para`, `bragfile`, `contacts`, `meeting-notes`, `maintenance`, `onboarding`) are installed under `$COPILOT_HOME/skills/brainkit/` with the same shape as before
- [ ] `companyAnnouncements`, `statusLine`, and `auto-commit` hooks (`agentStop`, `sessionEnd`) are wired in `$COPILOT_HOME/settings.json`
- [ ] **The user's vault is never written to during a Copilot launch.** Verified by an automated test that walks the vault dir before and after `launchCopilot` and asserts the file list is identical.
- [ ] **The user's `~/.copilot/` directory is never read or written.** Verified by an automated test.
- [ ] Existing brainkit users (vaults with legacy `AGENTS.md`, `.agents/`, `.github/hooks/`, `.github/copilot/`, brainkit `.gitignore` entries) are migrated automatically on the next `brainkit copilot` launch:
   - Legacy files are removed from the vault (regardless of git-tracked status, per user decision)
   - Brainkit `.gitignore` block is removed
   - A clear user notice describes what changed and how to commit the deletions
   - A `~/.config/brainkit/copilot/.migration-v1` marker prevents re-running the migration on subsequent launches
- [ ] Migration is idempotent and safe: running it twice has no additional effect; partial failures don't write the marker and abort the launch with a clear error
- [ ] Onboarding flow (`vaultPath === undefined`) continues to work unchanged via `~/.config/brainkit/onboarding/`
- [ ] `just check` passes (lint + format + test)
- [ ] CI's `test-windows` job passes
- [ ] `AGENTS.md` § "Harness Config Isolation" is updated to describe `COPILOT_HOME` use
- [ ] `specs/10-copilot-cli.md` is updated to reflect the new architecture; old vault-write sections are marked as deprecated
- [ ] `CHANGELOG.md` has a user-facing entry describing the migration

## Architecture Overview

### Before

```
<vault>/
├── AGENTS.md                                # brainkit system prompt (load behavior unreliable)
├── .agents/skills/brainkit/                 # skills
├── .github/hooks/hooks.json                 # hook config
├── .github/hooks/scripts/auto-commit.js     # hook script
├── .github/copilot/settings.json            # statusLine + companyAnnouncements
└── .gitignore                               # brainkit entries appended
```

`copilot` spawned with `cwd: vaultPath` and `BRAINKIT_VAULT_PATH=<vault>`. No env var redirects Copilot's config dir.

### After

```
~/.config/brainkit/
├── config.toml                              # global brainkit config (unchanged)
├── opencode.json                            # OpenCode plugin config (unchanged)
├── tui.json                                 # OpenCode TUI config (unchanged)
└── copilot/                                 # NEW — passed via COPILOT_HOME
    ├── .migration-v1                        # idempotency marker
    ├── settings.json                        # statusLine + companyAnnouncements + inline hooks
    ├── copilot-instructions.md              # brainkit system prompt (replaces <vault>/AGENTS.md)
    ├── skills/
    │   └── brainkit/
    │       ├── .brainkit-version
    │       ├── SKILL.md
    │       └── references/
    │           ├── para.md
    │           ├── bragfile.md
    │           ├── contacts.md
    │           ├── meeting-notes.md
    │           ├── maintenance.md
    │           └── onboarding.md
    └── hooks/
        └── scripts/
            └── auto-commit.js
```

`<vault>/` — clean. No brainkit-generated files.

`copilot` spawned with:
- `cwd: vaultPath` (auto-commit hook works against the vault git repo, agent's working dir is the vault)
- `env.COPILOT_HOME = ~/.config/brainkit/copilot`
- `env.BRAINKIT_VAULT_PATH = vaultPath` (unchanged, used by status script)

## Component Specifications

### Config dir helper

New helper in `core/vault.ts` alongside `getConfigDir()`:

```ts
export function getCopilotConfigDir(): string {
  return path.join(getConfigDir(), "copilot");
}
```

Exported from `core/index.ts`. Mirrors the existing `getConfigDir` pattern. Unit-tested in `core/__tests__/cross-platform.test.ts` to confirm cross-platform behavior (Windows path separators, `BRAINKIT_CONFIG_DIR` env var override, etc.).

### Launcher rewrite (`cli/copilot.ts`)

The orchestrator function `launchCopilot(args, selectedVaultPath)` becomes:

1. Resolve `vaultPath` (existing logic for onboarding case unchanged).
2. Clean up onboarding workspace (existing).
3. **Run `migrateLegacyVaultFiles(vaultPath)`** if `~/.config/brainkit/copilot/.migration-v1` doesn't exist.
4. Read vault config.
5. **Install skills to `$COPILOT_HOME/skills/brainkit/`** (existing `installSkills`, new `targetDir`).
6. **Write `$COPILOT_HOME/copilot-instructions.md`** (new `writeCopilotInstructions`).
7. **Install hook script to `$COPILOT_HOME/hooks/scripts/auto-commit.js`** (existing script body, new location).
8. **Write `$COPILOT_HOME/settings.json`** with `companyAnnouncements`, `statusLine`, and inline `hooks` (rewritten `generateCopilotSettings`).
9. Spawn `copilot` with `COPILOT_HOME` env var set, `cwd: vaultPath`.

Removed: `updateGitignore` callsite (no vault writes). The function may stay around briefly for the migration's gitignore-cleanup logic, then be deleted.

### Inline hooks in `settings.json`

Per Copilot docs, user-level hooks live inline in `settings.json` under the `hooks` key (not in a separate `hooks.json` file at user level). Shape:

```json
{
  "companyAnnouncements": [...],
  "statusLine": {
    "type": "command",
    "command": "node /abs/path/to/copilot-status.js"
  },
  "hooks": {
    "agentStop": [
      { "command": "node /abs/path/to/auto-commit.js", "description": "Auto-commit vault changes after agent turns" }
    ],
    "sessionEnd": [
      { "command": "node /abs/path/to/auto-commit.js", "description": "Commit any remaining vault changes on session end" }
    ]
  }
}
```

The exact inline-hooks schema must be verified during implementation against the official "Use hooks" doc page; the file-based schema (currently `{ hooks: [{ event, command, description }] }` array) may differ from the inline schema (event-keyed object as shown above). If different, adjust.

`auto-commit.js` script body is unchanged from the current implementation — it runs `git status` / `git add -A` / `git commit -m "brainkit: auto-save <date>"` in cwd (= vault).

### Migration (`migrateLegacyVaultFiles`)

New function in `cli/copilot.ts`. Runs **before** any other side-effecting launch step on every Copilot launch where the marker is absent.

**Marker check**: at start of `launchCopilot`, check `~/.config/brainkit/copilot/.migration-v1`. If present, skip migration entirely (single `fs.existsSync`).

**Marker write timing (critical)**: the marker is written **after the full launcher setup completes successfully** — i.e., after `installSkills`, `writeCopilotInstructions`, `installCopilotHooks`, and `generateCopilotSettings` have all returned. **Not** immediately after migration. Rationale: if migration succeeds but the launcher setup crashes (e.g., disk full, permission error), the user is in a broken state — vault is cleaned but `$COPILOT_HOME` is half-populated. Without the marker, the next launch retries everything; the migration is idempotent on a clean vault (no-op), and the launcher setup completes from where it failed. With premature marker write, retries are skipped and the user is stuck.

**Migration policy** (per user decision: delete regardless of git-tracked status, with notice):

| Vault artifact | Detection | Action |
|---|---|---|
| `<vault>/AGENTS.md` | See "Brainkit AGENTS.md detection" below | Delete on match; preserve on mismatch |
| `<vault>/.agents/skills/brainkit/` | `.brainkit-version` file present inside | Recursively delete; then `rmdir` `.agents/skills/` and `.agents/` (failures = leave alone) |
| `<vault>/.github/hooks/hooks.json` | Parse JSON; deep-equal to current `HOOKS_CONFIG` constant | Delete on match; preserve on mismatch |
| `<vault>/.github/hooks/scripts/auto-commit.js` | Read file content; equal to current `AUTO_COMMIT_SCRIPT` constant (whitespace-tolerant: trim trailing newlines on both sides before compare) | Delete on match; preserve on mismatch |
| `<vault>/.github/hooks/scripts/`, `.github/hooks/` | Try `rmdir` after the above (succeeds only if empty) | Remove if empty; leave on failure |
| `<vault>/.github/copilot/settings.json` | Parse JSON; `Object.keys(parsed).sort()` exactly equals `["companyAnnouncements", "statusLine"]` | Delete on match; preserve on mismatch |
| `<vault>/.github/copilot/` | Try `rmdir` after the above | Remove if empty; leave on failure |
| `<vault>/.github/` | Try `rmdir` after all of the above | Remove if empty; leave on failure. **Never use recursive delete** — would destroy `.github/workflows/`, `.github/CODEOWNERS`, `PULL_REQUEST_TEMPLATE.md`, etc. |
| `<vault>/.gitignore` | See ".gitignore detection" below | Remove block on match; preserve on mismatch |

**Brainkit `AGENTS.md` detection** (belt-and-suspenders to handle both new and legacy files):
- **Sentinel match (preferred)**: file contains the literal string `<!-- brainkit:generated -->` anywhere in its content. This sentinel SHOULD be added by the new launcher to any future generated `AGENTS.md` (defensive — we don't write `AGENTS.md` anymore, but if a future feature does, it'll inherit the marker).
- **Legacy preamble match (fallback)**: file content (with leading whitespace trimmed) starts with the exact string `## Brainkit\n\nBrainkit is a personal second brain — a structured markdown vault organized with the PARA method.` This string has been the first section of `buildPreamble()` since the function existed (verified by reading `core/prompt-sections.ts:55-63`). Match either condition → file is brainkit-generated → safe to delete.
- Mismatch on both → preserve and add to "preserved" notice.

**`.gitignore` detection**:
- Look for the four `GITIGNORE_ENTRIES` lines (`# brainkit — generated files`, `.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) appearing contiguously in that order, anywhere in the file. Normalize line endings (`\r\n` → `\n`) before matching.
- On match: remove only the four lines themselves. Don't try to clean up surrounding blank lines — leave them; the user can tidy if they care.
- On mismatch (block split, lines reordered, or any line modified): preserve `.gitignore` entirely, add to "preserved" notice.

**Atomicity**: wrap migration in try/catch. On failure: print error via `@clack/prompts`, do **not** write the marker, abort the launch with non-zero exit. User can fix the underlying issue and retry. On success: continue with launcher setup; marker is written by `launchCopilot` after the full setup completes (see "Marker write timing" above).

**User notice** (via `@clack/prompts`):

```
┌  brainkit update — Copilot config moved out of your vault
│
│  Brainkit no longer stores its files in your vault. The following
│  vault files were removed (their contents now live in
│  ~/.config/brainkit/copilot/):
│
│    ✓ AGENTS.md
│    ✓ .agents/skills/brainkit/
│    ✓ .github/hooks/hooks.json
│    ✓ .github/hooks/scripts/auto-commit.js
│    ✓ .github/copilot/settings.json
│    ✓ Removed brainkit entries from .gitignore
│
│  If any of these were committed to git, review and commit the deletions:
│    git status                                    # see what changed
│    git add AGENTS.md .agents/ .github/ .gitignore   # stage only these
│    git commit -m "brainkit: migrate to isolated config"
│
│  To recover any of these files: git restore <path>
│
└  Continuing to launch...
```

**Notice rules:**
- Show specific paths in the `git add` command — never `git add -A` (would sweep up unrelated uncommitted user work).
- Only list items that were actually removed.
- Items in a separate "preserved" block are listed if the migration left them in place (e.g., user-modified `AGENTS.md`), so the user knows it was deliberate.
- Mention `git restore` as the recovery path for committed files.
- If nothing was removed (clean vault), print no notice — silent success.

### Onboarding (unchanged)

`~/.config/brainkit/onboarding/` workspace continues to exist for first-time users (`vaultPath === undefined`). Doesn't touch the vault. Doesn't use `COPILOT_HOME`. Out of scope for this US.

Rationale: unifying onboarding into `COPILOT_HOME` would mean overwriting `copilot-instructions.md` between onboarding and normal launches. The onboarding prompt is meaningfully different from the normal prompt. Keeping the workspace separate is simpler and safer.

## Cross-Cutting Concerns

- **Harness isolation (non-negotiable):** never read or write under `~/.copilot/` (the user's normal Copilot config). All brainkit-side state goes under `~/.config/brainkit/copilot/` via `COPILOT_HOME`. Verified by an automated test.
- **Vault stays clean:** `launchCopilot` must not write any file under `vaultPath`. Verified by an automated regression test that walks the vault dir before and after launch and asserts the file list is identical.
- **Migration is one-shot and atomic:** marker file gates re-runs. Failures abort cleanly and don't write the marker.
- **Migration is conservative:** strict shape/marker checks. When in doubt, leave the file alone and notify the user.
- **No new runtime dependencies.** Migration uses only `node:fs` and `node:path`.
- **Cross-platform paths.** Use `node:path` everywhere. Hook command in `settings.json` uses absolute paths derived from `getCopilotConfigDir()`.
- **No agent-driven migration.** Migration must run before Copilot is spawned (otherwise Copilot loads stale `AGENTS.md`/skills). Code-based migration is deterministic, testable, fast, free, and works without network/API.
- **Onboarding flow stays as-is.** Out of scope.

## Open Questions / Items to Verify Early

1. **Inline `hooks` schema in `settings.json`** — confirm whether the inline schema matches the file-based `HOOKS_CONFIG` shape (`{ hooks: [{ event, command, description }] }`) or uses an event-keyed object (`{ hooks: { agentStop: [{ command, description }] } }`). Read `https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks` and verify with a smoke test before finalizing `generateCopilotSettings`. **If the inline schema differs**: update the JSON shape; no other design changes.
2. **`statusLine` script execution under `COPILOT_HOME`** — confirm Copilot still finds and executes the `statusLine.command` (absolute Node script path) when `COPILOT_HOME` points outside `~/.copilot`. Should work since the command is an absolute path and doesn't depend on Copilot's config dir, but verify with a smoke test.

These are low-risk verifications. None of them block the design. They're mechanical confirmations to make during the first implementation pass.

## Handled at launch time (not deferred)

1. **`--config-dir` in user args defeats isolation.** Per Copilot docs, `--config-dir` takes precedence over `COPILOT_HOME`. If a user passes `--config-dir` to `brainkit copilot`, our isolation breaks. The launcher must detect this in `args` and either strip it (with a warning) or abort with an error. Decision: **abort with a clear error message** — silently stripping a user-provided flag is surprising. See `rewrite-copilot-launcher.md` AC.
2. **`COPILOT_CUSTOM_INSTRUCTIONS_DIRS` user override is benign.** If a user has this env var set globally, additional instruction dirs get *added* to brainkit's `copilot-instructions.md`, not replacing them. Extra context never hurts brainkit's behavior, and stripping user env vars violates "user is in control." No code change needed; documented in `update-docs.md` as a one-line note in the `AGENTS.md` isolation section.

## Migration risks and mitigations

| Risk | Mitigation |
|---|---|
| Migration deletes a user-customized `AGENTS.md` | Marker-string check on file content; if marker absent, leave + notice |
| Migration deletes user's hand-written `.github/hooks/hooks.json` | Exact-content match against current `HOOKS_CONFIG` JSON; if different, leave + notice |
| Migration deletes user's `.github/copilot/settings.json` with extra keys | Parse JSON, check keys equal exactly `["companyAnnouncements", "statusLine"]`; if not, leave + notice |
| `.gitignore` block was split / modified | Look for the four-line block as a contiguous substring; if not found, leave + notice |
| User has non-brainkit files under `.github/hooks/` or `.github/copilot/` | Only delete our specific files; clean up parent dirs only if empty after our deletions |
| Migration partially fails midway | Wrap in try/catch; abort launch on failure; do not write marker; user can retry after fixing |
| Future need to re-run migration (e.g., a v2 cleanup) | Marker is versioned (`.migration-v1`, `.migration-v2`, ...); each migration checks its own marker |
| Windows path handling differs | Use `path.join` everywhere; existing `cross-platform.test.ts` patterns apply |

## Out of Scope

- **Onboarding flow refactor** — `~/.config/brainkit/onboarding/` stays as-is. Could be unified into `COPILOT_HOME` later, but adds complexity for no immediate benefit.
- **Doc cleanup pass on `docs/*.md`** — many docs reference `AGENTS.md` as the brainkit system prompt for Copilot. A separate small follow-up task can update those references to "the brainkit system prompt (delivered via `copilot-instructions.md` in `$COPILOT_HOME`)". Not blocking.
- **Migrating `companyAnnouncements` or `statusLine` schema changes** — keep the same content/shape as today. This US is purely about *location*.
- **Removing `updateGitignore` function entirely** — keep it for the migration's gitignore-cleanup logic; can be deleted later in a cleanup commit.

## Task Breakdown

See `.todo/US-copilot-isolation/main.md` for prioritized tasks.
