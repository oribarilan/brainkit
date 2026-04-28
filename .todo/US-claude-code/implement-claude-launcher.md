# implement-claude-launcher

## Context

`cli/claude.ts` is the analog of `cli/copilot.ts`. It owns per-launch setup: ensure brainkit's Claude config dir exists, **stage the plugin into the writable config dir**, generate skills into the staging dir, write `settings.json` and `system-prompt.txt`, set up onboarding workspace if needed, and spawn `claude` with the right env vars and flags.

**The critical change vs. v1 plan:** the plugin is treated as a read-only template at `<pkgRoot>/claude/`. Launcher copies it into `~/.config/brainkit/claude/plugin/` at launch (with a `.brainkit-version` marker for fast no-op skip on repeat launches), and `--plugin-dir` points at the staging copy. This eliminates the read-only `node_modules` write problem.

**Value delivered:** `launchClaude(args, vaultPath?)` function. After this task, `brainkit claude` works end-to-end. Auto-detection wiring is the next task.

## Related Files

- `cli/copilot.ts` — closest reference; mirror its structure
- `cli/launch.ts` — `LaunchFn` signature
- `cli/spawn.ts` — cross-platform spawn wrapper
- `core/skill-installer.ts` (from `extract-skill-installer.md`)
- `core/system-prompt.ts` — `buildSystemPrompt`
- `core/onboarding-prompt.ts` — `buildOnboardingPrompt("claude")`
- `core/harness-version.ts` — Claude version check (from `pin-claude-version.md`)

## Dependencies

- `extract-skill-installer.md`
- `add-claude-onboarding-mode.md`
- `extract-staleness-helper.md`
- `pin-claude-version.md`
- `scaffold-claude-plugin.md`
- `implement-plugin-scripts.md`

## Acceptance Criteria

- [ ] `cli/claude.ts` exports `launchClaude(args, vaultPath?)` matching `LaunchFn` signature.
- [ ] **Config-dir setup:** ensures `~/.config/brainkit/claude/` exists.
- [ ] **Plugin staging:** ensures `~/.config/brainkit/claude/plugin/` exists. Reads `.brainkit-version` marker. If unchanged from installed package version, skip steps below (fast path). Otherwise:
  - Copy entire `<pkgRoot>/claude/` tree to `~/.config/brainkit/claude/plugin/` (preserving exec bits on `scripts/*.mjs`).
  - Generate skills via `core/skill-installer.ts` into `~/.config/brainkit/claude/plugin/skills/`. Hand-authored `doctor/` survives because it's already present from the cp step.
  - Write `.brainkit-version` marker.
- [ ] **System prompt:** writes `~/.config/brainkit/claude/system-prompt.txt` from `buildSystemPrompt(config, vaultPath, { mode: "cli" })`. Always regenerated.
- [ ] **User settings:** writes `~/.config/brainkit/claude/settings.json` with `theme: "brainkit"`, `statusLine` command (pointing at staged scripts), `companyAnnouncements` (count/content per smoke test Q4), `enabledPlugins` (key format per smoke test Q2). Always regenerated.
- [ ] **Onboarding branch:** when `vaultPath === undefined`, creates `~/.config/brainkit/onboarding/` with `CLAUDE.md` containing `buildOnboardingPrompt("claude")`. Spawns from that cwd. Cleans up `~/.config/brainkit/onboarding/` on next non-onboarding launch (same shared workspace as Copilot — different filenames avoid conflict).
- [ ] **Spawn:** `spawnHarness('claude', [...launchArgs], { env: { ...process.env, CLAUDE_CONFIG_DIR, BRAINKIT_VAULT_PATH }, cwd: vaultPath ?? onboardingDir })`. Launch args: `--plugin-dir ~/.config/brainkit/claude/plugin --append-system-prompt-file ~/.config/brainkit/claude/system-prompt.txt` plus user-supplied args. **NO `--add-dir`** (cwd is the vault, redundant).
- [ ] **Cross-platform:** `node:path`/`node:os`. Uses existing `spawnHarness()` from `cli/spawn.ts`.
- [ ] **Version check:** invokes `harness-version.ts` Claude entry. Warns if older than minVersion.
- [ ] **No globals touched:** never reads or writes `~/.claude/`. Never writes to `<pkgRoot>/claude/`. Asserted by integration test (covered by `claude-isolation-test.md`).

## Verification

- **Automated:** new `cli/__tests__/claude.test.ts` mirroring `copilot.test.ts`. Covers: settings generation shape, system-prompt-file content, plugin staging (cp + installer with version-marker skip), onboarding workspace creation/cleanup, args composition for spawn (assert without actually spawning).
- **Ad-hoc:** `node dist/cli/index.js claude` (after build) launches Claude with brainkit, current vault detected, statusline appears, generated skills visible in `/`, no errors. Test in a temp HOME so the user's real `~/.claude/` is observably untouched.

## Notes

Use `fs.cpSync(src, dest, { recursive: true })` for the staging copy (Node 16.7+). Preserve mode bits for executable scripts (Node should handle this automatically on Unix; on Windows the exec bit is meaningless).

The `enabledPlugins` exact format and `companyAnnouncements` count are nailed down in smoke test (Q2, Q4). Reference those findings in this task's notes when complete.

If smoke test Q1 revealed Option D fallback (skip plugin model), this task changes substantially — write skills/hooks/scripts directly into `$CLAUDE_CONFIG_DIR/{skills,hooks}/` instead of staging. Re-scope before starting.
