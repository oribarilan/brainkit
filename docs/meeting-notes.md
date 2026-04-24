# Meeting Notes

Meeting notes are structured markdown files that capture what happened in a meeting, what was decided, and what needs to happen next. The word "meeting" is broad here on purpose — it covers work standups, 1:1s, planning sessions, doctor appointments, parent-teacher conferences, contractor walkthroughs, financial advisor sessions, or any scheduled conversation worth writing down. The format stays consistent, but personal meetings can be lighter than professional ones.

## Behavior

### Placement within PARA

Meeting notes don't live in a single directory. They're filed based on what the meeting was about, following normal PARA logic:

- If the meeting relates to an active project, the note goes in `01_projects/<project-name>/`. A kickoff meeting for the API redesign goes in `01_projects/api-redesign/`.
- If the meeting relates to an ongoing area, the note goes in `02_areas/<area-name>/`. A doctor appointment goes in `02_areas/health/`. A parent-teacher conference goes in `02_areas/parenting/`. A financial advisor session goes in `02_areas/finances/`.
- If the meeting is general, recurring, or doesn't clearly belong to a project or area, the note goes in `03_resources/meetings/` or a relevant resource directory.

The agent uses judgment here. If a meeting could reasonably go in two places, the agent should pick the most specific one. A sprint retro for the API project goes under that project, not in a generic meetings folder.

### File naming

Files are named `YYYY-MM-DD-topic.md`. The topic part is kebab-case and should be descriptive enough to identify the meeting at a glance. Examples: `2026-04-03-api-redesign-kickoff.md`, `2026-04-03-annual-checkup.md`, `2026-04-15-q2-budget-review.md`.

If two meetings on the same topic happen on the same day (unlikely but possible), append a short disambiguator: `2026-04-03-standup-morning.md`, `2026-04-03-standup-afternoon.md`.

### Template

Every meeting note follows this structure:

```markdown
# Meeting: Topic Name

**Date**: YYYY-MM-DD
**Attendees**: **Name1**, **Name2**, **self**

## Summary

Brief 2-3 sentence summary of what the meeting was about and what was decided.

## Discussion

Key points discussed, organized by topic.

## Decisions

- **Decision**: Description of what was decided

## Action Items

- [ ] **Owner**: Task description — deadline if known
```

The template is a guide, not a straitjacket. All professional meetings should have each section. Personal meetings can be simpler — a doctor visit might only need notes and follow-up items, with no formal "Decisions" section. A contractor walkthrough might skip "Action Items" if the contractor is handling everything. The agent should use good judgment about which sections to include based on the meeting type.

### Formatting conventions

People's names are always bolded: `**Sarah Chen**`, `**Dr. Martinez**`. This creates a visual anchor and supports cross-referencing with the contacts file. When the agent encounters an attendee name, it should check `03_resources/contacts.md` to see if that person is already tracked. If they're a new contact worth remembering, the agent can offer to add them.

The vault owner is always referred to as `self` in the attendees list. The agent knows the owner's name from `brainkit.toml` but uses `self` in meeting notes to keep things simple and avoid ambiguity.

Decisions and action items are bolded for scannability. Action items use checkbox format (`- [ ]`) with an owner and a deadline when one is known. The owner's name is bolded: `- [ ] **Marcus**: Update the API spec — Friday`.

The goal is concise capture: decisions and actions, not a transcript. Discussion sections should distill the conversation into its key points, organized by topic rather than chronologically.

### When to create meeting notes

The agent should offer to create meeting notes when:

- The user says "I just had a meeting about..." or something similar.
- The user pastes a transcript or meeting agenda.
- The user asks to summarize a discussion.

If the user's request is vague — "capture notes from my meeting" — the agent should ask clarifying questions: Who was in the meeting? What project or area does this relate to? What date was it? The agent needs enough context to pick the right PARA directory and fill in the template.

## Harness implementation

| Capability | OpenCode | Copilot CLI |
|---|---|---|
| File creation | Agent creates the markdown file in the correct PARA directory using built-in file tools | Same — agent creates files using built-in tools |
| Placement decision | Agent applies meeting-notes skill knowledge to pick the right PARA directory; system prompt injects current vault structure and, if the user's working directory matches a project, that project's context | Agent applies skill knowledge; AGENTS.md provides vault structure (static at launch) |
| Contact cross-referencing | Agent checks `03_resources/contacts.md` when attendees are mentioned, bolding names consistently and optionally offering to add new contacts | Same — agent follows contacts skill instructions |
| Template formatting | Agent follows the template defined in the meeting-notes skill; there is no typed tool for this — the agent writes the file directly, relying on skill guidance for structure | Same — agent follows skill template |
