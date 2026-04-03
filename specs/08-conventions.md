# Vault Conventions

These are the opinionated conventions that brainkit encodes into AGENTS.md and skills. They are the "rules of the road" for both humans and agents working in a brainkit vault.

## File & Directory Naming

- **Lowercase with hyphens** for all file and directory names: `my-project/`, `meeting-notes.md`
- **No spaces, underscores, or camelCase** in file/directory names (exception: PARA prefix like `01_projects/`)
- **`README.md`** is the canonical entry point for every directory
- **Meeting notes** use the format: `YYYY-MM-DD-topic.md` (e.g., `2026-03-12-api-review.md`)
- **Semester directories** (for workshops/courses) use: `YYYY-season/` (e.g., `2025-spring/`)

## Note Format

Plain markdown. No YAML frontmatter by default.

- **H1 heading** serves as the document title
- **Inline metadata** uses bold key-value pairs: `- **Status**: In Progress`
- **Blockquotes** for status markers: `> **Status**: Completed`
- No `created`/`updated` timestamps — git history serves that purpose
- **Standard markdown links** for cross-references between notes

### Example note

```markdown
# API Gateway Architecture

Notes on the gateway design for the threat detection platform.

- **Status**: Active
- **Lead**: Ori Bar-ilan
- **Stakeholders**: Sarah Chen, Jake Morrison

## Overview

...

## Key Decisions

- **2026-01-15**: Chose gRPC over REST for internal services (latency requirements)
- **2026-02-01**: Will use Envoy as the edge proxy

## Open Questions

- Rate limiting strategy?
- Auth token rotation policy?

## Meeting Notes

See individual meeting note files in this directory.
```

## Writing Style

- Keep notes concise and scannable — bullet points over paragraphs.
- Use **bold** for key names, decisions, action items, and people.
- No fluff or filler. Direct, informal, technical when needed.
- Use first person ("I", "my") — this is a personal vault.
- Dates in entries use `YYYY-MM-DD` format.

## PARA Method Conventions

The vault follows the PARA method. Each category has specific semantics:

### Projects (`01_projects/`)

Active, short-term efforts with a clear goal and an end state.

- Each project gets its own subdirectory with a `README.md`.
- README contains: overview, goals, status, stakeholders, key decisions, open questions.
- Meeting notes within projects use dated filenames.
- When a project is complete, move its directory to `04_archive/`.

### Areas (`02_areas/`)

Ongoing responsibilities maintained over time — no end date.

- Each area gets its own subdirectory with a `README.md`.
- Examples: career tracking, workshops/courses, team processes.
- Areas can contain sub-areas (e.g., `02_areas/workshops/genai-course/`).
- Recurring items like 1on1 notes live in the relevant area.

### Resources (`03_resources/`)

Topics of interest or useful reference material — things you want to remember but don't actively maintain.

- Can be individual files or directories.
- Examples: contacts.md, tools-to-evaluate.md, reading-notes/.
- Less structured than projects or areas.

### Archive (`04_archive/`)

Completed or inactive items from the above three categories.

- **Never delete, always archive.** Move here when something is no longer active.
- Rotated bragfiles live here (e.g., `bragfile-2025.md`).
- Completed projects move here with their full directory intact.
- Archive entries can include a reason for archival: `> **Status**: Archived — handed off to Infra team`

## Bragfile Conventions

The canonical location is `02_areas/career/bragfile.md`.

- **Append only** — never overwrite or reorganize existing entries.
- Organized by half (H1/H2) with monthly sub-sections (H3).
- Entry format: `- **YYYY-MM-DD**: Description`
- Bold project names, people, and metrics.
- Yearly rotation: archive to `04_archive/bragfile-YYYY.md` at year start.
- New year's bragfile carries forward key highlights from the prior year.
- "Constructive Feedback" section at the bottom for growth tracking.

## Contacts Conventions

The canonical location is `03_resources/contacts.md`.

- List-based format: each person is an H2 section.
- Required fields: Name (as H2), Role/Title.
- Optional fields: Alias, Team, Relation, Connection, Relevant For.
- **Relation**: organizational/structural (e.g., "Direct manager", "Cross-team").
- **Connection**: associative trigger for recall (e.g., "Met at 2025 offsite").
- Used as the "join table" for cross-referencing people across the vault.

## Agent Behavioral Rules

Default rules encoded in every brainkit vault:

1. **Search before answering.** Don't guess — find the source in the vault.
2. **Preserve structure.** When editing files, maintain existing formatting and organization.
3. **Cite sources.** When summarizing, cite which file the information came from.
4. **Archive is read-only** (unless the user explicitly asks to modify it).
5. **No external exposure.** Don't share vault content outside the current context without permission.
6. **Respect append-only.** Bragfile entries are never modified or deleted.
