# Skill: PARA method

PARA is a system by Tiago Forte for organizing information into four categories: **Projects**, **Areas**, **Resources**, and **Archive**. brainkit uses PARA as the top-level vault structure.

## The four categories

### `01_projects/` — Active efforts with a deadline

Short-term work with a clear goal AND a clear end state. When it's done, it's done.

Examples: `launch-api-v2/`, `hire-frontend-dev/`, `migrate-to-aws/`

### `02_areas/` — Ongoing responsibilities

Long-term responsibilities with NO end date. Maintained continuously over time.

Examples: `career/`, `health/`, `team-management/`, `finances/`

### `03_resources/` — Reference material

Topics of interest or useful reference. Not tied to a specific responsibility.

Examples: `rust-notes/`, `architecture-patterns/`, `interview-questions/`

### `04_archive/` — Inactive items

The graveyard for completed projects, abandoned efforts, and outdated resources. Items from any of the above three categories end up here.

## How to decide where something goes

- **Has a deadline?** → Project (`01_projects/`)
- **Ongoing responsibility?** → Area (`02_areas/`)
- **Just interesting or useful?** → Resource (`03_resources/`)
- **Done or no longer relevant?** → Archive (`04_archive/`)

## Directory structure rules

- Every directory MUST have a `README.md` as its entry point
- Subdirectories use kebab-case (`my-sub-topic/`)
- Projects have a clear lifecycle: **create → work → complete → archive**

## Archival rules

- When a project is complete or no longer active, move its directory to `04_archive/`
- **Never delete. Always archive.**
- When archiving, add a note to the item's `README.md` explaining why it was archived and when

## Key files within PARA

- `02_areas/career/bragfile.md` — accomplishments log, tracked via `brain_add_brag`
- `03_resources/contacts.md` — people index, managed via `brain_query_contacts` / `brain_add_contact`
