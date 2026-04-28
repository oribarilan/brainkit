# US-agent-communication

## Goal

Improve how the brainkit agent communicates intent to the user before acting on the vault. Today, the agent often jumps straight to a tool call (e.g. "Update README.md") without telling the user *what* is being changed and *where* — leaving the user without enough context to confirm the action is correct.

This story adds a behavioral rule to the client-side system prompt requiring the agent to briefly announce what it is about to do, with concrete context (which project, which contact, which file area) before performing vault **edits** (writes only, not reads).

## Definition of Done

- [x] Before any vault-**modifying** action (write/edit/create/move/delete), the brainkit agent emits a short, contextual sentence describing the change (e.g. "Updating project _Acme Redesign_ with the new Q3 deadline" / "Adding John Doe as a new contact").
- [x] Read-only operations (search, read, list) do **not** trigger announcements.
- [x] Batched/multi-step edits get **one announcement per user-visible change**, not one per tool call.
- [x] The behavior is driven by the client-side system prompt (`core/prompt-sections.ts`), so it applies across all vault interactions — not relegated to a skill.
- [x] A unit test locks in the **contract** of the rule (not just its existence). Specifically, the test asserts the rule text:
  - Appears in the output of `buildBehavioralRules(ctx)` (and therefore `buildSystemPrompt(...)`).
  - References announce/say/state semantics.
  - References at least one context noun (`project`, `contact`, `file`, or `where`).
  - Scopes itself to write/edit/modify actions (not "always announce").
  - Includes at least one of the example phrasings (so silent example removal fails the test).
- [x] Existing tests for `prompt-sections` and `system-prompt` still pass.
- [x] `just check` passes (lint + format + test). _Note: lint + typecheck + tests pass; pre-existing prettier warnings in `.todo/*` and `specs/*` markdown are unrelated to this story._

## Task Priority

1. `add-pre-action-announcement-rule.md` — only task; ships the change.

## Cross-Cutting Concerns

- **Client-side, not dev-side**: this changes runtime behavior for brainkit users (see `AGENTS.md` § Dev-Side vs Client-Side). The change belongs in `core/prompt-sections.ts` — not in `.opencode/`, not in `skills/`, not in this repo's `AGENTS.md`.
- **One source of truth**: keep the rule in the system prompt only. Don't duplicate into `skills/brainkit/SKILL.md` — skills are pulled on demand, the system prompt is always present, and duplication invites drift.
- **Keep it brief**: the rule must encourage a *short* one-line announcement, not a verbose plan. Brainkit is a personal vault tool — verbosity is friction.
- **Don't double-up with existing tooling**: OpenCode already shows tool calls in the UI. The announcement is a natural-language preface ("Adding John as a new contact"), not a re-statement of the tool call.
- **Scope (writes only)**: announcements apply to vault-modifying actions only. Reads, searches, and listings stay silent — otherwise we'd contradict the existing "Search the vault before answering" rule and add the very friction we're trying to remove.
- **Scope (out)**: post-action summaries are explicitly out of scope. If users want them later, that's a separate story.
- **Onboarding interaction**: during first-run onboarding the agent creates many files. A single upfront announcement ("I'll set up your PARA directories and a starter README") is sufficient — don't announce each file. Reflect this in the rule wording.
- **Custom rules win**: users may add `customization.rules` in `brainkit.toml` (e.g. "be terse, no preamble"). User custom rules override the announcement default; this is fine and doesn't need special handling, but worth knowing.
- **Bragfile reminder is unaffected**: the reminder is a passive nudge, not an action — no collision with the announcement rule.

## Known Limitations / Follow-ups

- This is a **soft** behavioral rule in a system prompt. The model may still skip it occasionally — there's no enforcement mechanism. If after shipping users still report missing announcements, the next iteration should consider a hook in `opencode/server.ts` that intercepts vault writes and verifies a preceding assistant message exists. That's a separate story, not this one.
