# claude-onboarding-auto-relaunch

## Context

After Claude Code onboarding completes, brainkit currently tells the user to `/exit` and re-run `brainkit claude` manually. The first run has no plugin, no theme, no skills loaded — it's just the agent walking through setup against `CLAUDE.md` as project memory. Only the _second_ run picks up the full plugin (theme, statusline, 7 skills, etc.).

This restart is the single biggest UX wart in the v0.9.x Claude release. Reviewers all flagged it. From the design review: "After 5 minutes of setup, the user is told to /exit and re-run. It feels like the tool didn't finish its job. There's no transition — no 'great, your vault is at ~/brain/work, here's what I just created, now run brainkit claude and try saying I shipped X today.'"

The mechanism for the manual restart exists because the launcher's `launchClaude` function decides at spawn time whether to use the onboarding branch (no plugin) or the main branch (full plugin). After onboarding writes `~/.config/brainkit/config.toml`, the _next_ invocation will take the main branch — but the user has to trigger that next invocation themselves.

**Value delivered:** seamless first-run experience. User completes onboarding → Claude exits → brainkit immediately re-spawns Claude with the full plugin loaded + a tailored kickoff prompt ("Welcome back. Your vault is at <path>. Try saying 'I shipped X today' or run `/brainkit:doctor`."). One continuous flow, no manual restart.

## Related Files

- `cli/claude.ts` — `launchClaude` orchestrator, especially the onboarding `child.on("exit", ...)` handler
- `core/onboarding-prompt.ts` — `CLAUDE_CLOSING` block (the "Restart required" instruction the agent currently delivers); this would be removed or rewritten
- `core/__tests__/onboarding-prompt.test.ts` — tests asserting the closing text
- `cli/__tests__/claude.test.ts` — tests of the onboarding spawn behavior

## Dependencies

- None. This is self-contained inside the Claude launcher + onboarding prompt.

## Acceptance Criteria

- [ ] After Claude exits cleanly (exit code 0) from the onboarding branch, `launchClaude` checks whether `readGlobalConfig()` now returns a configured brain path.
- [ ] If yes: immediately re-spawn `claude` via the main branch (full plugin, theme, system prompt, statusline) WITH a tailored kickoff prompt: "Welcome back. Your vault is at `<path>`. Try saying 'I shipped X today' or run `/brainkit:doctor` to see your vault health."
- [ ] If no (onboarding was abandoned): exit normally with the onboarding child's exit code.
- [ ] If onboarding exited with non-zero code: do NOT auto-relaunch — pass the exit code through.
- [ ] `CLAUDE_CLOSING` in `core/onboarding-prompt.ts` is updated. The agent no longer instructs the user to "/exit and re-run". Instead it says "I'll hand you off to brainkit-mode now" or similar.
- [ ] Tests verify: (a) successful onboarding triggers a second spawn with main-branch args, (b) abandoned onboarding does NOT trigger a second spawn, (c) failed onboarding does NOT trigger a second spawn.

## Verification

- **Automated:** new tests in `cli/__tests__/claude.test.ts` mock both spawn invocations and assert the second-spawn behavior.
- **Ad-hoc:** wipe `.dev/user-config/`, run `just fresh`, complete onboarding through the agent, observe that Claude doesn't exit to terminal — it immediately reloads with the full plugin.

## Notes

The simplest implementation in `cli/claude.ts:launchClaude`:

```ts
child.on("exit", (code) => {
  if (code === 0) {
    const newConfig = readGlobalConfig();
    if (newConfig?.brain_path) {
      // Onboarding succeeded — re-spawn into main branch
      launchClaude([...args, "Welcome back..."], newConfig.brain_path);
      return;
    }
  }
  process.exit(code ?? 0);
});
```

But beware: `launchClaude` calls `process.exit` itself in the main branch's child handler. Need to think about double-exit semantics and whether the recursive call is the right shape vs splitting `launchClaude` into `launchClaudeOnboarding` and `launchClaudeMain` so the recursive case is explicit.

Consider also: the kickoff prompt for the second spawn is _promotional_ — it tells the user how to use brainkit. This is the only place we get to "introduce" brainkit's capabilities to a brand-new user. Worth iterating on the copy. Per the design review: this is the highest-leverage moment in the entire first-run flow.

Deferred from US-claude-code per user decision after the pre-release review (2026-04-29) — "ship what works, defer optimizations".
