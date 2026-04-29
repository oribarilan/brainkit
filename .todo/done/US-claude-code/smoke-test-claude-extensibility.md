# smoke-test-claude-extensibility

## Context

Several design assumptions depend on Claude Code behaviors that aren't fully clear from the docs alone. Verifying them with the real `claude` binary before writing the launcher and plugin code de-risks everything downstream. If any assumption is wrong, the design changes here, not after we've built dependent code.

**Value delivered:** A short verification report (added as notes to this task or to `specs/US-claude-code.md`) confirming or revising the seven open questions. No production code changes.

## Related Files

- `specs/US-claude-code.md` § Open Questions (questions 1–7)

## Dependencies

- None (must run first)

## Acceptance Criteria

- [ ] **Q1: `--plugin-dir` from staged config-dir copy verified.** Stage a throwaway plugin under a tmp `$CLAUDE_CONFIG_DIR/plugin/`, launch `claude --plugin-dir <that>`. Confirm: (a) Claude reads from this path correctly; (b) Claude does NOT mutate `<pkgRoot>` or copy elsewhere unexpectedly; (c) plugin auto-update behavior under custom `CLAUDE_CONFIG_DIR` (does Claude try to update plugins automatically? if so, where?). **Note:** the broader staging-into-`~/.config/brainkit/<harness>/` pattern is already production-validated via Copilot's `COPILOT_HOME` flow (shipped in v0.9.0) — only Claude-specific `--plugin-dir` semantics are in question here.
- [ ] **Q2: `enabledPlugins` exact key format verified.** Iterate `"brainkit"`, `"brainkit@local"`, `"brainkit@brainkit"` etc. in `$CLAUDE_CONFIG_DIR/settings.json`. Confirm which causes the plugin to actually load. Document the format in this task's notes.
- [ ] **Q3: Theme registration via launcher-written settings verified.** Write `theme: "test-theme"` to `$CLAUDE_CONFIG_DIR/settings.json`. Plugin ships `themes/test-theme.json`. Launch. Confirm theme is active on launch (not just selectable via `/theme`).
- [ ] **Q4: `companyAnnouncements` cycling behavior verified.** Set 3 entries. Launch 5 times in a row, record what's shown. Document: cycles, random, single (always shows entry 0), or something else.
- [ ] **Q5: Cross-platform script invocation noted.** How Claude invokes `${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs` on macOS/Linux (shebang? direct node?). Document Windows behavior even if testing happens later in CI — research what's documented.
- [ ] **Q6: `UserPromptSubmit` stdout visibility verified.** Hook script that prints `"USER_VISIBLE_MARKER"` to stdout. Submit a prompt. Confirm whether the user sees the marker (toast/output equivalent) or only the agent sees it as context.
- [ ] **Q7: `PreCompact` stdout-as-summary behavior verified.** Hook script that prints `"COMPACTION_MARKER"`. Trigger compaction. Confirm whether the marker appears in the compaction summary the model uses post-compact, or only in logs.
- [ ] **Fallback decision recorded.** If Q1 reveals `--plugin-dir` is unworkable for any reason, document the Option D fallback decision (skip plugin model, write skills/hooks/scripts directly into `$CLAUDE_CONFIG_DIR/{skills,hooks}/`) and update spec accordingly before downstream tasks start.

## Verification

- **Ad-hoc:** the throwaway artifacts live under `/tmp/brainkit-smoke/` and are removed after. Findings recorded as notes in this task file or appended to `specs/US-claude-code.md` § Open Questions. If any answer changes the design, edit `specs/US-claude-code.md` before completing this task.

## Notes

Throwaway artifacts are fine — they don't ship. The goal is evidence, not infrastructure.
