# Features

## PARA Structure (Mandatory Foundation)

PARA is always enabled. It is the organizational backbone of the vault, not a toggleable feature.

### Categories

| Directory       | Purpose                                   | Examples                                 |
| --------------- | ----------------------------------------- | ---------------------------------------- |
| `01_projects/`  | Active efforts with a goal AND a deadline | `launch-api-v2/`, `hire-frontend-dev/`   |
| `02_areas/`     | Ongoing responsibilities, no end date     | `career/`, `health/`, `team-management/` |
| `03_resources/` | Topics of interest, reference material    | `rust-notes/`, `architecture-patterns/`  |
| `04_archive/`   | Inactive items from the above three       | Completed projects, old resources        |

### Decision Framework

- Has a deadline? → Project
- Ongoing responsibility? → Area
- Just interesting/useful? → Resource
- Done or no longer relevant? → Archive

### Structure Rules

- Every directory has a `README.md` as entry point
- Subdirectories use kebab-case
- Projects have a lifecycle: create → work → complete → archive
- When archiving, add a note to README.md with reason and date

## Bragfile

A running log of professional accomplishments at `02_areas/career/bragfile.md`.

### Format

- Organized by half-year (H1/H2), then by month
- Each entry: `- **YYYY-MM-DD**: description`
- Append only — never modify existing entries

### What Makes a Good Entry

- Specific and quantified ("Reduced API latency by 30%" not "Improved performance")
- Mentions impact, not just activity
- Includes project/team names (bolded)
- Action verbs: shipped, led, designed, fixed, mentored

### Tool

`brain_add_brag` — typed tool that programmatically finds the right section, creates it if missing, appends with correct format. The agent suggests capturing brags when the conversation mentions accomplishments.

## Contacts

A people index at `03_resources/contacts.md`.

### Format

- H2 heading per person
- Fields: Role, Team, Relation, Connection, Relevant For, Alias (all optional except name)

### Tools

- `brain_query_contacts` — search by any field
- `brain_add_contact` — add a new person

### Behavior

- Agent cross-references contacts when people are mentioned in conversation
- Agent suggests adding contacts for new people who seem professionally relevant
- Agent links attendees to contacts when creating meeting notes

## Meeting Notes

Structured notes filed under the relevant PARA directory.

### Placement

- Related to active project → `01_projects/<project-name>/`
- Related to ongoing area → `02_areas/<area-name>/`
- General/recurring → `03_resources/meetings/` or relevant resource dir

### Naming

`YYYY-MM-DD-topic.md`

### Structure

Standard template: date, attendees (bolded, cross-referenced with contacts), summary, discussion, decisions (bolded), action items with owners.

### Tool

No dedicated tool. Agent uses `brain_write` guided by the meeting-notes skill, which teaches proper placement, naming, and structure.

## Vault Health (/doctor)

The `/doctor` command checks vault health AND fixes issues.

### Fix Phase (runs first)

- Creates missing PARA directories
- Creates missing bragfile (if enabled)
- Creates missing contacts file (if enabled)

### Report Phase

- Config validity
- PARA directory structure
- Key files existence
- Naming convention compliance (kebab-case)
- Orphaned files in vault root

### Display

Custom TUI panel showing fixes applied and health results with ✓/⚠/✗ indicators.

## Self-Review (Future)

Not implemented in v1. Planned: generate self-review summaries from bragfile entries for a given time period.
