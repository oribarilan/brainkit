# add-claude-onboarding-mode

## Context

Add `"claude"` mode to `core/onboarding-prompt.ts` with a Claude-appropriate closing instruction. Small, isolated change.

The Claude onboarding workspace shares `~/.config/brainkit/onboarding/` with Copilot. There's a narrow race if a user runs Copilot and Claude onboarding concurrently in two terminals, but it's rare enough not to justify a per-harness dir split — accepted as a known limitation.

**Value delivered:** `buildOnboardingPrompt("claude")` returns the right prompt for first-run Claude Code users.

## Related Files

- `core/onboarding-prompt.ts`
- `core/__tests__/onboarding-prompt.test.ts`

## Dependencies

- None

## Acceptance Criteria

- [ ] `OnboardingMode` type accepts `"claude"`.
- [ ] `buildOnboardingPrompt("claude")` returns a prompt with a Claude-specific closing ("When done, exit and re-run `brainkit claude` from your terminal").
- [ ] Existing `opencode` and `copilot` mode behavior is unchanged.
- [ ] Test coverage in `core/__tests__/onboarding-prompt.test.ts` for the new mode, asserting the closing text appears.

## Verification

- **Automated:** new tests in `core/__tests__/onboarding-prompt.test.ts` cover `buildOnboardingPrompt("claude")`. Existing tests still pass.

## Notes

Mirror the existing test pattern for `copilot` mode (see `COPILOT_CLOSING` in source).
