# Meeting Note Processing

## Problem

Meeting notes currently sit where they're filed forever. They accumulate in project and area directories alongside active documents. The useful content inside them (action items, decisions, new contacts, accomplishments) stays buried in the note unless the user manually extracts it. Nobody does that.

A meeting note is a capture format, not a storage format. The information inside it should live where you'll search for it, not where you happened to write it down.

## Solution

After creating a meeting note, the agent offers to process it. Processing means extracting the useful parts and distributing them to the right places in the vault, then archiving the original note. The original stays intact as a record.

This is entirely skill-driven. No TypeScript changes. The agent learns the behavior from updated skill files and docs.

## Design

### Processing flow

1. Agent creates the meeting note (existing behavior, unchanged).
2. Agent offers: "Want me to process this note?"
3. If yes, the agent reads the note and extracts:
   - **Action items with deadlines** → the relevant project or area README, or its task list if one exists.
   - **Accomplishments** → bragfile, if the meeting was professional. Follows existing bragfile skill rules for what counts as an accomplishment.
   - **New people** → `03_resources/contacts.md`, following contacts skill format.
   - **Key decisions** → the relevant project or area README.
   - **Reference information** → relevant resource notes.
4. Agent moves the original file (intact) to `04_archive/meeting-notes/`.
5. Agent confirms what was extracted and where each piece went.

Not every note will have all five types of content. A quick standup might only produce action items. A doctor appointment might produce nothing worth extracting. The agent uses judgment.

### Triggers

Two ways processing starts:

- **Right after creating a meeting note.** The agent asks "Want me to process this?" as part of the natural flow. The user can say no and the note stays where it is.
- **On demand.** The user says "process my meeting notes" or something similar. The agent finds unprocessed notes (anything in a non-archive PARA directory matching the meeting note naming convention) and processes them one at a time, confirming each.

### Archive location

`04_archive/meeting-notes/` — a flat directory. All processed notes go here regardless of where they originally lived. The date prefix in the filename (`YYYY-MM-DD-topic.md`) keeps them sortable and identifiable.

### Original file handling

The original note is moved to the archive directory unchanged. It's a record. No content is removed, no "processed" flag is added, no metadata is appended. If you need to go back and check what was said in a meeting, the full note is in the archive.

### Extraction rules

Each extraction type follows existing skill conventions:

| Content type    | Destination                      | Skill rules                                                                                                                                              |
| --------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action items    | Project/area README or task list | Checkbox format with owner and deadline when known                                                                                                       |
| Accomplishments | Bragfile                         | Only professional meetings. Must pass the same bar as the bragfile skill's auto-detection (shipped something, received recognition, led something, etc.) |
| New contacts    | `03_resources/contacts.md`       | Contacts skill format. Agent should check if the person already exists before adding.                                                                    |
| Key decisions   | Project/area README              | Bold format, same as the meeting note template uses                                                                                                      |
| Reference info  | Relevant resource notes          | Agent picks the right resource file or creates one                                                                                                       |

The agent should not extract mechanically. A decision like "we'll use the same API" is not worth pulling into a README. The bar is: would someone searching the vault later benefit from finding this outside the meeting note?

### What doesn't get processed

- Notes the user declines to process. They stay where they are.
- Notes that have nothing worth extracting. The agent should still offer to archive them ("Nothing to extract here, but want me to move it to the archive?").
- Personal meeting notes with no actionable content (a casual catch-up, for example). Same offer to archive.

## Files changed

| File                            | Change                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `skills/meeting-notes/SKILL.md` | Add a "Processing" section describing the extraction and archive flow                    |
| `docs/meeting-notes.md`         | Add processing behavior documentation with the same level of detail as existing sections |
| `README.md`                     | Update the meeting notes feature one-liner to mention processing/archiving               |

No TypeScript changes. No new files. No changes to `core/`, `opencode/`, or `cli/`.

## What this does NOT cover

- Automatic processing without asking. The agent always asks first.
- Batch processing of old notes on first install. Users can ask for it, but the agent doesn't volunteer.
- Any change to how meeting notes are created. The template, naming, and placement rules are unchanged.
- Structured task management. Action items get appended to the relevant README, not tracked in a separate system.
