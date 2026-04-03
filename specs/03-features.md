# Features Catalog

Each feature is a self-contained concept that brainkit can install into a vault. Enabling a feature may:

- Add entries to `brainkit.toml`
- Install agent skill files (SKILL.md)
- Add sections to the generated `AGENTS.md`

Features never directly create vault content (markdown files, folders). That's the agent's job via the `/doctor` skill.

> **Note:** PARA is the mandatory organizational foundation — it is always enabled and not listed as a toggleable feature below. The features below are opt-in additions on top of PARA.

## PARA Structure (Mandatory Foundation)

**Always enabled** — not a toggleable feature.  
**Skills installed:** Contributes to `/doctor` behavior  
**AGENTS.md sections:** Folder structure documentation, naming conventions  

### What it does

Provides the PARA method folder organization as the mandatory vault structure. Categories are fixed in v1:

- **01_projects/** — Active, short-term efforts with a goal and deadline
- **02_areas/** — Ongoing responsibilities maintained over time
- **03_resources/** — Topics of interest or useful reference material
- **04_archive/** — Inactive items from the above three categories

PARA has no config toggle — it is always on. There is no `[features.para]` section in `brainkit.toml`.

### What the agent does on /doctor

- Creates the category directories if they don't exist.
- If files already exist in the vault root, proposes how to categorize them and asks the user before moving anything.
- Places a `.gitkeep` in each empty directory.
- Creates a `README.md` entry point in each directory with a brief description of the category's purpose.

### AGENTS.md contribution

Documents the folder structure, what each directory is for, and the naming conventions:
- Directory names: lowercase with hyphens
- Items within categories get their own subdirectory with a `README.md`
- Meeting notes within projects: `YYYY-MM-DD-topic.md`

---

## Feature: Bragfile

**ID:** `bragfile`  
**Default:** Recommended during onboarding  
**Skills installed:** `/add-brag`  
**AGENTS.md sections:** Bragfile rules, yearly rotation conventions  

### What it does

A running log of accomplishments, updated throughout the year. Used for performance reviews, promotion discussions, and keeping focus on impactful work.

### Bragfile format

```markdown
# Brag Document — 2026

A running log of accomplishments.

## H1 2026

### January

- **2026-01-15**: Shipped threat detection dashboard MVP — reduced triage time by 40%
- **2026-01-22**: Led architecture review for onboarding automation

### February

...

## Carry-forward from 2025

- Key highlights from prior year (for context)

# Constructive Feedback

- Growth areas being actively worked on
```

### Conventions (encoded in AGENTS.md + /add-brag skill)

- **Append only.** Never overwrite or reorganize existing entries.
- New entries go under the current month with date prefix: `- **YYYY-MM-DD**: Description`
- Bold key names, projects, and people in entries.
- **Yearly rotation**: at year start, move to `04_archive/bragfile-YYYY.md`, create fresh file with carry-forward section.
- When querying past accomplishments, check both active and archived bragfiles.

### Location

`02_areas/career/bragfile.md`

### What the agent does on /doctor

- Creates `bragfile.md` at `02_areas/career/bragfile.md` with the template for the current year.
- Creates the parent directory (`02_areas/career/`) if it doesn't exist.
- If a bragfile already exists, leaves it untouched.

---

## Feature: Contacts Index

**ID:** `contacts`  
**Default:** Recommended during onboarding  
**Skills installed:** `/query-contacts`  
**AGENTS.md sections:** Contacts format, usage rules  

### What it does

A structured people index — a "join table" across the brain. Used to look up coworkers, recall how you met someone, and cross-reference people mentioned in notes and projects.

### Contacts format (list-based)

```markdown
# Contacts

## David Nowak
- **Alias**: davidn
- **Role/Title**: Engineering Manager
- **Team**: Threat Protection
- **Relation**: Direct manager
- **Connection**: Manager since 2024
- **Relevant For**: Career growth, project priorities, team planning

## Sarah Chen
- **Alias**: sarahc
- **Role/Title**: Senior Engineer
- **Team**: Platform
- **Relation**: Cross-team collaborator
- **Connection**: Met at 2025 Seattle offsite
- **Relevant For**: Platform API, onboarding automation
```

### Column definitions (encoded in AGENTS.md)

- **Relation**: Structural/organizational relationship (e.g., "Direct manager", "Cross-team")
- **Connection**: Associative trigger for recall — how you met or know the person
- **Relevant For**: Topics, projects, or areas this person connects to

### Conventions

- Use this file for any people-related queries.
- Cross-reference people mentioned in meeting notes, projects, and workshop attendees.
- Sections are alphabetically ordered by first name (or by whatever order the user prefers).

### Location

`03_resources/contacts.md`

### What the agent does on /doctor

- Creates `contacts.md` at `03_resources/contacts.md` with a header and one example entry.
- Creates the parent directory (`03_resources/`) if it doesn't exist.
- If contacts already exist (in any format), leaves them and notes in output that existing contacts were found.

---

## Feature: Meeting Notes Processing

**ID:** `meeting-notes`  
**Default:** Offered during onboarding  
**Skills installed:** `/process-notes`  
**AGENTS.md sections:** Meeting notes conventions, naming format  

### What it does

Teaches the agent how to process meeting notes: extract key decisions, action items, and file them into the right places in the vault.

### Conventions

- Meeting notes within projects use the format: `YYYY-MM-DD-topic.md`
- When processing notes, the agent should:
  1. Extract key decisions and add them to the project's README under "Key Decisions"
  2. Extract action items and highlight them
  3. Update contacts if new people are mentioned
  4. Update bragfile if accomplishments are mentioned
  5. File the notes in the appropriate project/area directory
- Mark processed notes with a status indicator.

---

## Feature: Self-Review

**ID:** `self-review`  
**Default:** Offered during onboarding  
**Skills installed:** `/review`  
**Dependencies:** `bragfile`  
**AGENTS.md sections:** Self-review guidance  

### What it does

Teaches the agent how to draft a self-review or performance summary by synthesizing data from the bragfile, 1on1 notes, and project outcomes.

### How /review works

1. Agent reads the bragfile (current year + carry-forward).
2. Agent scans for 1on1 notes, project READMEs, and any other relevant files.
3. Synthesizes into a structured self-review draft.
4. Presents to the user for editing.

---

## Feature: Vault Health Check

**ID:** `vault-health`  
**Default:** Offered during onboarding  
**Skills installed:** `/doctor`  
**AGENTS.md sections:** Health check criteria  

### What it does

Teaches the agent how to validate the vault's health and consistency. The `/doctor` skill also handles initial vault setup (creating directories, scaffolding files for enabled features) and feature disable cleanup.

- Config file parses correctly
- All enabled feature directories exist
- Naming conventions are followed (kebab-case, proper date formats)
- AGENTS.md is up to date with config
- No orphaned files in unexpected locations
- Bragfile follows append-only conventions
- Contacts entries have required fields

When features are disabled, `/doctor` offers to archive related content (never deletes).

---

## Feature: .gitignore

**ID:** `gitignore`  
**Default:** Always enabled  
**Skills installed:** None  
**AGENTS.md sections:** None  

### What it does

Brainkit generates a sensible `.gitignore` file. This is one of the few things brainkit writes directly (not via agent) because it's always safe and needed before any git operations.

### Default .gitignore content

```
# OS
.DS_Store
Thumbs.db

# Editors
*.swp
*.swo
*~
.vscode/
.idea/

# Obsidian
.obsidian/

# Brainkit internals (if any in future)
.brainkit-cache/
```

If a `.gitignore` already exists, brainkit merges its entries (appends missing lines) rather than overwriting.

---

## Future Features (Not in v1, but planned)

These are documented here to show the roadmap and ensure the architecture supports them.

- **Custom categories** — User-defined categories beyond PARA (e.g., "Bookmarks", "Recipes")
- **Templates** — Template system for new items in categories (like the original spec's `brainkit create`)
- **Quick capture** — A `/capture` skill for rapidly filing a note into the right place
- **Yearly rotation** — Automated bragfile rotation reminder/execution
- **Export** — Skills for exporting vault content (e.g., "export my bragfile as a PDF")
- **Import** — Skills for importing from other systems (Notion export, Obsidian vault)
