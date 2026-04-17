# Brainkit Features

Brainkit's feature set, defined independent of any specific coding harness. The current implementation targets OpenCode, but the feature definitions are harness-agnostic to allow future harness support.

## Vault Foundation

### PARA Structure

The vault is organized using the PARA method. This is always enabled — it is not a toggleable feature.

| Directory       | Purpose                                 | Examples                                 |
| --------------- | --------------------------------------- | ---------------------------------------- |
| `01_projects/`  | Active efforts with a goal and deadline | `launch-api-v2/`, `hire-frontend-dev/`   |
| `02_areas/`     | Ongoing responsibilities, no end date   | `career/`, `health/`, `team-management/` |
| `03_resources/` | Topics of interest, reference material  | `rust-notes/`, `architecture-patterns/`  |
| `04_archive/`   | Inactive items from the above three     | Completed projects, old resources        |

**Rules:**

- Every directory has a `README.md` entry point
- Subdirectories use kebab-case
- Never delete content — archive instead, with a note and date in README.md
- Decision framework: has a deadline → project, ongoing → area, just useful → resource, done → archive

### Vault Config

Global config at `~/.config/brainkit/config.toml`. Stores:

- `vault_path` — absolute path to the vault directory
- `user` — name, role, expertise, scope, tone, context, custom rules
- `features` — toggles for bragfile, contacts

### Vault Discovery

Brainkit finds the vault by reading the global config. Works from any directory — the vault is always accessible regardless of cwd.

## Features

### Bragfile

A running log of professional accomplishments at `02_areas/career/bragfile.md`.

**Toggle:** `features.bragfile` in config.

**Format:**

- Organized by half-year (H1/H2), then by month
- Each entry: `- **YYYY-MM-DD**: description`
- Append only — never modify existing entries

**Quality criteria for entries:**

- Specific and quantified ("Reduced API latency by 30%" not "Improved performance")
- Mentions impact, not just activity
- Includes project/team names (bolded)
- Action verbs: shipped, led, designed, fixed, mentored

**Operations:**

- Add entry — find/create the right half-year and month section, append formatted entry
- Read stats — last entry date, total count, staleness in days

### Contacts

A people index at `03_resources/contacts.md`.

**Toggle:** `features.contacts` in config.

**Format:**

- H2 heading per person
- Fields: Role, Team, Relation, Connection, Relevant For, Alias (all optional except name)

**Operations:**

- Search contacts — fuzzy search across all fields
- Add contact — append formatted contact section
- Cross-reference — when people are mentioned in conversation, check the index

### Meeting Notes

Structured notes filed under the relevant PARA directory.

**Always enabled** (no toggle — uses vault write).

**Placement:**

- Related to active project → `01_projects/<project-name>/`
- Related to ongoing area → `02_areas/<area-name>/`
- General/recurring → `03_resources/meetings/`

**Naming:** `YYYY-MM-DD-topic.md`

**Structure:** Date, attendees (bolded, cross-referenced with contacts), summary, discussion, decisions (bolded), action items with owners.

### Vault Search

Full-text search across all markdown files in the vault.

**Always enabled.**

**Operations:**

- Search by query string across all `.md` files
- Optional scope filter: projects, areas, resources, archive, or all
- Returns top matches with surrounding context lines

### Vault Read/Write

Direct file operations within the vault.

**Always enabled.**

**Operations:**

- Read file by vault-relative path
- Write file by vault-relative path (creates parent dirs)
- Path traversal protection — all paths validated within vault boundary
- Archive writes blocked unless explicitly requested

### Vault Health (Doctor)

Health check and auto-fix for the vault.

**Always enabled.**

**Fix phase** (runs first):

- Creates missing PARA directories
- Creates missing bragfile (if enabled)
- Creates missing contacts file (if enabled)

**Report phase:**

- Config validity
- PARA directory structure
- Key files existence
- Naming convention compliance (kebab-case)
- Orphaned files in vault root
- GitHub repo privacy check (warns if vault repo is public)

## Agent Behaviors

These behaviors are implemented by the agent via system prompt injection and skills, not via deterministic code.

### System Prompt Injection

Every turn, the agent receives fresh context about the vault:

1. User identity (name, role, expertise, scope)
2. Vault structure (PARA description)
3. Key files and their rules (conditional on enabled features)
4. Conventions (naming, formatting, tone, first person)
5. Custom user rules
6. Behavioral rules (search first, cite sources, never delete, archive instead)
7. Smart project detection — if cwd matches a `01_projects/` entry, inject that project's context

### Bragfile Staleness Reminder

When the bragfile hasn't been updated in 14+ days, the system prompt includes a gentle reminder. The agent mentions it naturally — not as a notification, but as part of its awareness.

### Auto-Brag Detection

After each agent response, scan for accomplishment keywords ("shipped", "launched", "completed", "deployed", etc.) near "you"/"your" — detecting when the agent describes the user's accomplishment. If detected, surface a suggestion to capture it.

### Skill-Driven Judgment

Skills teach the agent when and how to use features:

- Recognize accomplishments in casual conversation → offer bragfile capture
- Detect meeting recaps or transcripts → offer to create meeting notes
- Notice new people mentioned → offer to add to contacts
- Cross-reference contacts when people come up

### Fresh Vault Onboarding

When the vault is newly created and has no content, the agent guides the user through first entries conversationally — not as a checklist.

## UI Features

### Branding

- ASCII art displayed on home screen
- Brainkit identifier in session name or status area

### Status / Hints

Rotating tips cycle through available features:

- Command references (/setup, /doctor)
- Feature references (search, brag, contacts)
- Usage tips ("mention an accomplishment and I'll offer to capture it")

### Vault Status Display

Show vault connection status:

- Vault name and path
- Bragfile staleness with visual indicator
- Feature toggles

## Automation

### Auto-Commit

After each agent turn, schedule a debounced git commit of vault changes (30-second window). On session end, flush immediately. Skips silently if the vault isn't a git repo.

Commit message: `brainkit: auto-save YYYY-MM-DD`

### Desktop Notification

Notify the user (via OS notification or toast) when:

- An accomplishment is detected and bragfile capture is suggested

## OpenCode Implementation

Current implementation uses OpenCode as the coding harness. Skills + system prompt guide the agent to use its built-in file editing tools. No custom typed tools for v1 — if formatting reliability becomes a problem (especially bragfile's nested section structure), typed tools can be added later via the server plugin's `tool()` API.

| Feature                 | OpenCode Implementation                                               |
| ----------------------- | --------------------------------------------------------------------- |
| **Brag operations**     | Agent uses built-in file edit, guided by skills + system prompt       |
| **Contact operations**  | Agent uses built-in file edit, guided by skills + system prompt       |
| **Vault search**        | Agent uses built-in grep/search                                       |
| **Vault read/write**    | Agent uses built-in read/write                                        |
| **Doctor**              | Agent follows skills, uses built-in tools                             |
| **Setup**               | Agent guides setup conversationally on first run (onboarding skill)   |
| **System prompt**       | `experimental.chat.system.transform` server plugin                    |
| **Auto-brag detection** | `session.idle` event + toast                                          |
| **Auto-commit**         | `session.idle` event + `child_process.execFile` for git               |
| **ASCII art**           | `home_logo` TUI slot                                                  |
| **Hints**               | `home_bottom` TUI slot                                                |
| **Vault stats sidebar** | `sidebar_content` TUI slot                                            |
| **Custom theme**        | Theme file + `set_theme`                                              |
| **Compaction hook**     | `experimental.session.compacting`                                     |
| **Skill distribution**  | `instructions` config or `.opencode/skills/`                          |
| **Launch**              | `brainkit` or `brainkit oc` (sets `OPENCODE_CONFIG`, spawns opencode) |
