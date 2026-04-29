# register-claude-harness

## Context

Wire the new `launchClaude` into brainkit's harness registry, add the `claude` and `cc` aliases, and update auto-detection so bare `brainkit` includes Claude in the search.

**Value delivered:** `brainkit claude`, `brainkit cc`, and bare `brainkit` (when only Claude is installed) all work. Multi-harness disambiguation prompts include Claude.

## Related Files

- `cli/launch.ts` — `HARNESSES` registry, `detectAndLaunch`, `selectVault`
- `cli/index.ts` — alias dispatch
- `cli/__tests__/harness-detection.test.ts` — must extend with Claude scenarios

## Dependencies

- `implement-claude-launcher.md`

## Acceptance Criteria

- [ ] `HARNESSES` array in `cli/launch.ts` includes:
  ```ts
  { name: "Claude Code", binaries: ["claude"], aliases: ["claude", "cc"], launch: launchClaude }
  ```
- [ ] `cli/index.ts` recognizes `claude` and `cc` as harness aliases (no behavior change needed if the registry-driven dispatch in `launchHarness` already handles aliases generically).
- [ ] Bare `brainkit` auto-detects the `claude` binary alongside `opencode` and `copilot`.
- [ ] Multi-harness scenarios (e.g. user has all three installed) prompt the user to pick one, with Claude in the list, and the saved `default_harness` honors `claude`.
- [ ] `cli/__tests__/harness-detection.test.ts` extended with Claude scenarios: claude-only, claude+opencode, claude+copilot, all three.

## Verification

- **Automated:** `just test` passes including new scenarios in `harness-detection.test.ts`.
- **Ad-hoc:** in a shell where only `claude` is on `$PATH`, bare `brainkit` launches Claude. With multiple, the prompt offers Claude as a choice.

## Notes

Verify that the registry-driven dispatch is fully generic — there shouldn't be Copilot-specific or OpenCode-specific code paths in `cli/index.ts` that need duplicating for Claude. If there are, that's a sign of a needed refactor (file a follow-up task; don't expand this one's scope).
