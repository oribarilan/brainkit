# PARA Structure

The vault is organized using the PARA method, a system by Tiago Forte that splits all information into four categories: Projects, Areas, Resources, and Archive. These map to four top-level directories in every brainkit vault. PARA is always enabled — it is the vault's skeleton, not a toggleable feature. Everything the user stores goes into one of these four buckets, whether it's a work project, a personal goal, a recipe collection, or a completed effort that's no longer active.

## Behavior

### The four directories

`01_projects/` holds active efforts with a clear goal and a clear end state. A project has a deadline, or at least a finish line. When it's done, it's done. Examples: `launch-api-v2/`, `hire-frontend-dev/`, `home-renovation/`, `half-marathon-training/`, `learn-rust/`. Note that personal and professional items sit side by side — the vault doesn't distinguish between the two.

`02_areas/` holds ongoing responsibilities with no end date. These are things the user maintains continuously. Examples: `career/`, `health/`, `finances/`, `team-management/`, `parenting/`, `home/`. An area never "completes" — it can only be archived if the user's life changes (e.g., they leave a management role).

`03_resources/` holds reference material and topics of interest. These aren't tied to a responsibility or a deadline. They're just useful or interesting. Examples: `rust-notes/`, `architecture-patterns/`, `cooking-recipes/`, `book-notes/`, `travel-planning/`.

`04_archive/` is where completed, cancelled, or inactive items from the other three categories go. Nothing gets deleted from a brainkit vault — it gets archived.

### Decision framework

When deciding where something belongs, work through these questions in order:

1. Does it have a deadline or a finish line? → `01_projects/`
2. Is it an ongoing responsibility? → `02_areas/`
3. Is it just interesting or useful reference material? → `03_resources/`
4. Is it done, cancelled, or no longer relevant? → `04_archive/`

These are mutually exclusive. If something has a deadline, it's a project even if it relates to an ongoing area. A project called `performance-reviews-q2/` lives in projects, not under `02_areas/career/`, because it has a concrete end date. Once it's done, it moves to archive.

### Directory and naming rules

Every directory in the vault must have a `README.md` file as its entry point. This is non-negotiable. The README describes what the directory contains and why it exists.

All directory names use kebab-case: lowercase letters, words separated by hyphens. No spaces, no underscores, no camelCase. `home-renovation/` is correct. `Home Renovation/` and `home_renovation/` are not.

### Key files with fixed locations

Two files have canonical locations within PARA:

- The bragfile lives at `02_areas/career/bragfile.md`. It's a running log of accomplishments (see the bragfile feature doc for details). The `career/` area directory must exist for this file to have a home.
- The contacts file lives at `03_resources/contacts.md`. It's a people index used for cross-referencing across the vault.

Both files are only present when their respective features are enabled in `brainkit.toml`.

### Archival rules

The cardinal rule: **never delete, always archive.** If something is done, inactive, or no longer relevant, it moves to `04_archive/`. The user's past work, abandoned projects, and old reference material all have value — at minimum as a record of what happened.

The archival process has specific steps:

1. Read the item's `README.md` to understand its current state.
2. Append an archive note at the bottom: a horizontal rule, then `**Archived on YYYY-MM-DD.** Reason: [why]`.
3. Recreate the directory and its contents under `04_archive/`.
4. Confirm with the user before doing any of this. Never archive without asking.

Archival is appropriate when the user says a project shipped, was cancelled, or was abandoned. It's also appropriate when the user says something is "no longer relevant" or asks to clean up the vault. The maintenance skill handles periodic staleness checks that can surface archival candidates, but the agent always asks before acting.

### Scope: personal and professional

PARA makes no distinction between personal and professional content. A user's vault might contain `01_projects/launch-api-v2/` next to `01_projects/home-renovation/`, and `02_areas/career/` next to `02_areas/health/`. The `scope` setting in `brainkit.toml` can be set to `professional` to narrow the agent's focus, but the PARA structure itself accommodates everything.

## Harness implementation

| Capability | OpenCode | Copilot CLI |
|---|---|---|
| Structure creation | Agent creates directories and `README.md` files using built-in file tools, guided by the PARA skill and system prompt | Agent creates directories and files using built-in tools, guided by PARA skill in `.agents/skills/brainkit/` and AGENTS.md |
| Filing decisions | Agent uses PARA skill knowledge to decide placement; the system prompt injects a vault structure description each turn so the agent always knows what directories exist | Agent uses PARA skill knowledge; AGENTS.md provides vault structure description (static, generated at launch) |
| Archival workflow | Agent follows the skill-defined steps: reads README, appends archive note with date and reason, recreates contents in `04_archive/`, confirms with user before proceeding | Same — agent follows skill instructions using built-in tools |
| Project detection | If the user's working directory matches a `01_projects/` entry, the system prompt injects that project's context automatically | Not injected at launch (CWD is vault root); works if user navigates into a project subdirectory |
