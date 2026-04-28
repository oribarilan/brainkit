# scaffold-claude-plugin

## Context

Create the `claude/` plugin TEMPLATE directory in the repo. This is the read-only source that the launcher copies into `~/.config/brainkit/claude/plugin/` at runtime.

After this task, `claude --plugin-dir <repo>/claude` should load the plugin without error (good for development), and the directory ships with the npm package for the launcher to copy.

**Value delivered:** A loadable Claude Code plugin scaffold. Verifiable: launching Claude with `--plugin-dir claude/` succeeds and the brainkit theme is selectable via `/theme`.

## Related Files

- `opencode/brainkit.json` — palette source for the theme port (only ~5 tokens map)
- `opencode/tui.tsx:108-118` — body for the doctor skill

## Dependencies

- `smoke-test-claude-extensibility.md` (need verified plugin layout, theme registration, scripts invocation, etc.)

## Acceptance Criteria

- [ ] `claude/.claude-plugin/plugin.json` with `name: "brainkit"`, `version` (sync with `package.json` at publish time), description, repo, license.
- [ ] `claude/themes/brainkit.json` — minimal port of the rose/pink palette into Claude's theme JSON shape: `{ name, base: "dark", overrides: { claude: "#E8A0BF", success: "#50E880", error: "#E85050" } }` (or similar — actual brand color from `opencode/brainkit.json`). Acknowledge in spec parity table that markdown/syntax/diff tokens have no Claude equivalent.
- [ ] `claude/skills/doctor/SKILL.md` hand-authored — frontmatter `disable-model-invocation: true`, `user-invocable: true`, body matches OpenCode's `/doctor` invocation in `opencode/tui.tsx:108-118`.
- [ ] `claude/hooks/hooks.json` wired with `SessionEnd` and `PreCompact` entries pointing at `${CLAUDE_PLUGIN_ROOT}/scripts/auto-commit.mjs` and `${CLAUDE_PLUGIN_ROOT}/scripts/precompact.mjs`. NO `SessionStart` hook (cut from v1).
- [ ] `claude/scripts/auto-commit.mjs`, `claude/scripts/precompact.mjs`, `claude/scripts/statusline.mjs` exist as executable Node ESM scripts (shebang + chmod 755). Stub bodies — no real logic yet (next task).
- [ ] **NO `claude/settings.json`** — only `agent` and `subagentStatusLine` plugin settings are honored, neither is needed. Theme/statusLine/announcements all live in launcher-written user `settings.json`.
- [ ] `package.json` `files` array includes `claude/`.
- [ ] Launching `claude --plugin-dir <repo>/claude` succeeds — no errors at startup, plugin appears in `/plugin` listing.
- [ ] Brainkit theme is selectable via `/theme` after enabling the plugin.

## Verification

- **Ad-hoc:** `claude --plugin-dir $(pwd)/claude` from the repo root. Confirm no errors. Run `/plugin`, confirm `brainkit` is listed. Run `/theme`, confirm `brainkit` is in the list. Run `/` and confirm `/brainkit:doctor` is in the menu.

## Notes

Auto-generated skills (`brainkit`, `para`, `bragfile`, etc.) are NOT scaffolded here — they're generated at launch by the launcher into the staging dir (`implement-claude-launcher`). The plugin works fine at this stage with only the hand-authored `doctor` skill present.
