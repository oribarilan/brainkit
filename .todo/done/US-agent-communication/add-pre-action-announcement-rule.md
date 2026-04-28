# add-pre-action-announcement-rule

## Context

User feedback: when asking brainkit to update a task, the agent responds with bare tool calls like "Update README.md" without saying _which_ project or area is being modified. The user can't confirm the agent is targeting the right place.

This task adds a behavioral rule to the client-side system prompt that requires the agent to briefly announce its intended vault change — with concrete context (project name, contact name, file area) — before performing it. Read-only operations stay silent.

**Value delivered**: Users get a one-line, contextual heads-up before any vault edit, so they can catch wrong-target actions before they happen.

## Related Files

- `core/prompt-sections.ts` — `buildBehavioralRules` (lines 151–163) is the target location
- `core/system-prompt.ts` — composes the sections (no change expected)
- `core/__tests__/prompt-sections.test.ts` (or equivalent — verify exact path) — add the contract test here

## Dependencies

- None

## Implementation Guidance

The recommended shape is a short `### Before editing` subsection appended to the output of `buildBehavioralRules`, _not_ another bullet in the existing list. Reason: the surrounding bullets are all _vault_ behavior (how to manipulate files); this rule is _meta_-behavior (how to talk to the user). A small subsection reads cleaner and signals the distinction.

The rule must convey, at minimum:

1. **When**: before any vault-modifying action (write, edit, create, move, delete).
2. **What**: a one-line natural-language sentence naming the concrete subject (project / contact / meeting / area), not a restatement of the tool call.
3. **Not when**: skip for read-only ops (search, read, list).
4. **Granularity**: one announcement per user-visible change, not per tool call. During onboarding, one upfront announcement covers the whole setup.
5. **Examples** (include in the prompt — they ground the model):
   - "Updating project _Acme Redesign_ with the new Q3 deadline"
   - "Adding John Doe as a new contact"
   - "Logging today's standup notes under _Team Sync_"

Avoid prescribing exact wording in the prompt — describe the shape, give examples, let the model phrase it naturally.

## Acceptance Criteria

- [x] A `### Before editing` subsection (or equivalent — see Implementation Guidance) is added to `buildBehavioralRules` in `core/prompt-sections.ts`, covering the five points above.
- [x] The rule explicitly states announcements apply to **modifying** actions only, not reads/searches.
- [x] The rule includes the three example phrasings listed above (or close equivalents).
- [x] A unit test in `core/__tests__/` asserts the **contract** of the rule (not just its presence). The test must fail if any of these change:
  - The rule disappears from `buildBehavioralRules(ctx)` output.
  - The announce/say/state semantics is dropped.
  - No context noun (`project`, `contact`, `file`, or `where`) is mentioned.
  - The scoping to write/edit/modify actions is removed.
  - All three example phrasings are deleted (test should require at least one).
- [x] Existing tests for `prompt-sections` and `system-prompt` still pass.
- [x] `just check` passes (lint + format + test). _Note: lint + typecheck + tests pass; pre-existing prettier warnings in `.todo/*` and `specs/*` markdown are unrelated to this task._

## Verification

- **Automated** (the gate for merge):
  - Add a contract test per the criteria above. Run `just test` and confirm it passes alongside the existing suite.
  - Run `just check` and confirm zero failures.
- **Smoke test** (sanity only, not a gate — LLM behavior is non-deterministic):
  - Run `just dev`, ask the agent to "update my Acme project README with a new deadline of Friday" and to "add Jane Smith as a contact". Confirm the agent emits a contextual one-liner before the edit tool call in both cases.
  - One pass is a sanity signal, not proof. The contract test is what gates correctness; if users still report missing announcements after shipping, follow up per the limitations note in `main.md`.

## Notes

- Keep this client-side. Don't add the rule to `skills/brainkit/SKILL.md` or to this repo's `AGENTS.md`.
- Don't break out a new top-level section function in `system-prompt.ts` — keep the change inside `buildBehavioralRules` to avoid prompt-architecture churn for a ~5-line addition.
- If the test framework / file location for `core/__tests__/` differs from what's assumed here, follow the existing convention in the repo — don't introduce new test infrastructure.
