# claude-onboarding-deep-vault-detection

## Context

The Claude onboarding prompt (`core/onboarding-prompt.ts`) tells the agent to detect existing vaults by looking for `*/brainkit.toml` one level deep under the user-specified brain path. From the architecture review:

> A user who organized brains as `~/brain/work/active/brainkit.toml` (two levels) will be misclassified as Scenario C and get the new-vault flow — not data loss (the safety rules at top still prevent overwrite), but a re-onboarding when none was needed.

The single-level-only check covers the documented brainkit pattern (`<brain>/<vault>/brainkit.toml`) but doesn't cover users who organize differently or who nest vaults under category directories.

**Value delivered:** more users who already have brainkit data get the fast-path Scenario B reuse instead of being asked to re-onboard a vault that already exists somewhere under their brain path.

## Related Files

- `core/onboarding-prompt.ts` — the agent-driven Scenario A/B/C branching
- `core/vault.ts` — `discoverVaults` (this already does the recursive walk! the onboarding prompt could just say "use brainkit's `discoverVaults` semantics")

## Dependencies

- None.

## Acceptance Criteria

- [ ] Update the onboarding prompt's Scenario B detection step to recurse multiple levels deep (or use `discoverVaults` semantics — read `core/vault.ts:discoverVaults` to see exactly what it does).
- [ ] Test by typing a nested path (`~/brain/work/active/brainkit.toml` style) during onboarding and confirming Scenario B fires.
- [ ] Existing single-level Scenario B still works.

## Verification

- **Ad-hoc:** create a test brain dir with `~/test-brain/category-a/vault-1/brainkit.toml`. Run `just fresh`, complete onboarding pointing at `~/test-brain`. Confirm the agent detects vault-1 and triggers Scenario B (no re-onboarding).

## Notes

This is a small prompt edit, but worth verifying that the agent actually does the recursive walk correctly when instructed. May need to be more explicit in the prompt (e.g. "use `find <brain_path> -name brainkit.toml -not -path '*/node_modules/*'`").

Deferred from US-claude-code per pre-release review (2026-04-29). Low-frequency edge case; ship 0.9.x with single-level detection and revisit based on user feedback.
