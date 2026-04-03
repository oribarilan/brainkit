# Agent Skills Specification

## Overview

Brainkit ships agent skills as SKILL.md files following the [Agent Skills specification](https://agentskills.io/specification). Each skill is a self-contained markdown file with YAML frontmatter that teaches an AI agent how to perform a specific operation on the vault.

Skills are installed by the brainkit CLI into provider-specific directories. They are never executed by brainkit — only by the user's AI agent.

## Skill Naming

All brainkit skills are prefixed with `brainkit-` to avoid collisions with other skills:

- `brainkit` — Core vault skill (always installed)
- `brainkit-config` — Configuration management
- `brainkit-add-brag` — Bragfile management
- `brainkit-process-notes` — Meeting notes processing
- `brainkit-query-contacts` — People lookup
- `brainkit-review` — Self-review drafting
- `brainkit-doctor` — Vault setup, maintenance, and health check

## Skill File Format

Each skill follows the Agent Skills spec:

```markdown
---
name: brainkit-<skill-name>
description: "One-line description of what this skill does."
user-invocable: true
argument-hint: "[optional argument hint]"
---

[Skill instructions in markdown]
```

### Frontmatter fields used

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Skill identifier (1-64 chars, lowercase/numbers/hyphens) |
| `description` | Yes | What the skill does (1-1024 chars) |
| `user-invocable` | Yes | Always `true` for brainkit skills (they're slash commands) |
| `argument-hint` | No | Hint shown during autocomplete |

## Skill Directory Structure

```
.agents/
  skills/
    brainkit/
      SKILL.md                    # Core vault skill
    brainkit-config/
      SKILL.md                    # /config command
    brainkit-add-brag/
      SKILL.md                    # /add-brag (only if bragfile enabled)
    brainkit-process-notes/
      SKILL.md                    # /process-notes (only if meeting-notes enabled)
    brainkit-query-contacts/
      SKILL.md                    # /query-contacts (only if contacts enabled)
    brainkit-review/
      SKILL.md                    # /review (only if self-review enabled)
    brainkit-doctor/
      SKILL.md                    # /doctor (only if vault-health enabled)
```

Only skills for enabled features are installed. Disabling a feature removes its skill files.

---

## Skill: brainkit (Core)

**Installed:** Always  
**User-invocable:** No (loaded automatically, not a slash command)  

This is the foundational skill that teaches the agent about the vault. It's essentially a pointer to AGENTS.md with a brief summary.

```markdown
---
name: brainkit
description: "Core instructions for working with this second brain vault. Read AGENTS.md for full conventions."
user-invocable: false
---

This vault is a personal second brain managed with brainkit conventions.
Read the root `AGENTS.md` file for complete instructions on structure,
naming conventions, writing style, key files, and behavioral rules.

Always consult AGENTS.md before creating, editing, or organizing content
in this vault.
```

---

## Skill: /config

**Installed:** Always  
**User-invocable:** Yes  
**Argument hint:** `[what to configure]`

The /config skill handles interactive configuration of the vault. It edits brainkit.toml and patches AGENTS.md in-place.

### Behavior

1. Ask the user what they want to configure (or accept as argument).
2. Walk through relevant configuration interactively.
3. Edit brainkit.toml with the changes.
4. Patch the corresponding sections of AGENTS.md.
5. Suggest running /doctor to align vault structure if features changed.

### Configurable areas

- **Features**: Enable/disable bragfile, contacts, meeting-notes, self-review, vault-health
- **Personalization**: Name, role, expertise, tone, scope, context
- **Rules**: Add, remove, or edit custom behavioral rules
- **Providers**: Add/remove AI agent provider directories

### Skill content (conceptual)

```markdown
---
name: brainkit-config
description: "Interactively configure the vault: edit brainkit.toml and patch AGENTS.md to match."
user-invocable: true
argument-hint: "[what to configure]"
---

Interactively configure this brainkit vault by editing `brainkit.toml` and
patching `AGENTS.md` to reflect the changes.

## Steps

1. If the user specifies what to configure (as argument or in prompt), go
   directly to that area. Otherwise, present the configurable areas and ask.
2. Walk through the relevant settings interactively — show current values and
   ask for new ones.
3. Edit `brainkit.toml` with the changes.
4. Patch the corresponding section(s) of `AGENTS.md` in-place to reflect the
   new configuration.
5. If features were enabled or disabled, suggest running `/doctor` to align
   the vault structure.

## Configurable Areas

### Features
Enable or disable optional features: bragfile, contacts, meeting-notes,
self-review, vault-health. Enabling a feature will add its skill and update
AGENTS.md; disabling removes the skill.

### Personalization
Edit `[user]` config: name, role, expertise, tone, scope, context.
These values flow into AGENTS.md's "Who Am I" and "Writing Style" sections.

### Rules
Add, remove, or edit custom behavioral rules in `[user] rules`.
Rules appear in the "Custom Rules" section of AGENTS.md.

### Providers
Add or remove AI agent provider directories (e.g., `.cursor/`, `.copilot/`).
This controls where skill files are installed.

## Important

- Always show the user what will change before writing to files.
- Never remove config fields — set them to empty or default values instead.
- After editing, confirm the changes were applied successfully.
```

---

## Skill: /add-brag

**Installed:** When `bragfile` feature is enabled  
**User-invocable:** Yes  
**Argument hint:** `[accomplishment description]`  

### Skill content (conceptual)

```markdown
---
name: brainkit-add-brag
description: "Add an accomplishment entry to the bragfile following vault conventions."
user-invocable: true
argument-hint: "[accomplishment description]"
---

Add a new entry to `02_areas/career/bragfile.md` following these rules:

1. Open `02_areas/career/bragfile.md`.
2. Find the current month's section (H3 heading with month name under the current half's H2).
3. If the current month's section doesn't exist, create it.
4. Append a new entry: `- **YYYY-MM-DD**: [description]`
5. Bold key project names, people names, and metrics in the description.
6. Keep entries concise — one to two lines.
7. Never modify existing entries.

If the user provides the accomplishment as an argument, use it directly.
If not, ask what they accomplished.

### Examples
- "Shipped threat detection dashboard MVP — reduced triage time by 40%"
- "Led architecture review for **onboarding automation** with **Sarah Chen**"
- "Gave GenAI course session 3 to 12 attendees — highest engagement score yet"
```

---

## Skill: /process-notes

**Installed:** When `meeting-notes` feature is enabled  
**User-invocable:** Yes  
**Argument hint:** `[meeting notes or file path]`  

### Skill content (conceptual)

```markdown
---
name: brainkit-process-notes
description: "Process meeting notes: extract decisions, action items, and file into the vault."
user-invocable: true
argument-hint: "[meeting notes text or file path]"
---

Process meeting notes and integrate them into the vault:

1. Accept meeting notes as inline text or a file path.
2. Identify the relevant project or area for these notes.
3. Extract and organize:
   - **Key decisions** → add to the project/area README under "Key Decisions"
   - **Action items** → highlight in the notes
   - **People mentioned** → cross-reference with `03_resources/contacts.md`, suggest adding unknown people
   - **Accomplishments** → suggest adding to bragfile via /add-brag
4. Save the processed notes as `YYYY-MM-DD-topic.md` in the appropriate project/area directory.
5. Add a status marker to indicate the notes have been processed.

Ask the user which project/area the notes relate to if it's not obvious from context.
```

---

## Skill: /query-contacts

**Installed:** When `contacts` feature is enabled  
**User-invocable:** Yes  
**Argument hint:** `[query about a person]`  

### Skill content (conceptual)

```markdown
---
name: brainkit-query-contacts
description: "Look up people in the contacts index by name, role, team, or how you met them."
user-invocable: true
argument-hint: "[query about a person]"
---

Search `03_resources/contacts.md` to answer people-related queries.

Supported query types:
- By name: "Who is Sarah Chen?"
- By role/team: "Who works on the platform team?"
- By connection: "Who did I meet at the offsite?"
- By relevance: "Who should I loop in on the API project?"
- Cross-reference: "Who is mentioned in the threat detection dashboard notes?"

When answering:
1. Search `03_resources/contacts.md` for matching entries.
2. If cross-referencing, also search relevant project/area files for mentions.
3. Present results with the person's key details.
4. If the person isn't in contacts, say so and offer to add them.
```

---

## Skill: /review

**Installed:** When `self-review` feature is enabled  
**User-invocable:** Yes  
**Argument hint:** `[time period, e.g., "last 6 months"]`  

### Skill content (conceptual)

```markdown
---
name: brainkit-review
description: "Draft a self-review by synthesizing bragfile entries, 1on1 notes, and project outcomes."
user-invocable: true
argument-hint: "[time period, e.g., 'H1 2026' or 'last 6 months']"
---

Draft a self-review document by synthesizing vault data:

1. Read the bragfile at `02_areas/career/bragfile.md` (current year + carry-forward from prior years if relevant).
2. Scan for 1on1 notes (typically in `02_areas/career/`).
3. Review project READMEs for outcomes and key decisions.
4. Check the "Constructive Feedback" section for growth areas.

Structure the output as:
- **Key Accomplishments** — grouped by theme or project, with impact metrics
- **Technical Growth** — new skills, technologies, or areas of expertise
- **Leadership & Collaboration** — mentoring, workshops, cross-team work
- **Growth Areas** — from constructive feedback, with progress notes
- **Goals for Next Period** — suggested based on current trajectory

Present as a draft for the user to edit, not a final document.
```

---

## Skill: /doctor

**Installed:** Always  
**User-invocable:** Yes  
**Argument hint:** None  

The /doctor skill handles initial vault setup, ongoing maintenance, and health checks. It subsumes the former /setup functionality.

### Skill content (conceptual)

```markdown
---
name: brainkit-doctor
description: "Set up, maintain, and health-check the vault: ensure structure, files, and config are consistent."
user-invocable: true
---

Perform vault setup, maintenance, and health checks. This skill handles both
initial vault bootstrapping and ongoing consistency verification.

## Setup (run on first use or when features change)

1. Read `brainkit.toml` to determine enabled features.
2. Create PARA directories if they don't exist (`01_projects/`, `02_areas/`, `03_resources/`, `04_archive/`).
3. Add a `.gitkeep` to empty directories and a brief `README.md` in each with the category's purpose.
4. If bragfile feature is enabled, create `02_areas/career/bragfile.md` if it doesn't exist:
   - Use the current year for the H1 heading
   - Include H2 for current half, H3 for current month
   - Include a "Carry-forward" section and "Constructive Feedback" section
   - See AGENTS.md for the full bragfile format and conventions
5. If contacts feature is enabled, create `03_resources/contacts.md` if it doesn't exist:
   - Include an H1 heading and one example contact entry
   - Use the list-based format (H2 per person with field bullet points)
   - See AGENTS.md for the full contacts format
6. If existing content conflicts with the desired structure, ask the user how to proceed (never move files silently).

## Cleanup (when features are disabled)

When a feature has been disabled but its content still exists:
1. Identify content that belongs to the disabled feature.
2. Offer to archive the content to `04_archive/` — **never delete**.
3. Only proceed with archival after explicit user confirmation.
4. Report what was archived and where.

## Health Checks

1. **Config validity**: Can `brainkit.toml` be parsed? Are all required fields present?
2. **Structure**: Do all PARA directories exist? Are there unexpected top-level directories?
3. **Naming conventions**: Are directory/file names kebab-case? Are meeting notes using YYYY-MM-DD format?
4. **Key files**: Do `02_areas/career/bragfile.md` and `03_resources/contacts.md` exist (if enabled)? Are they in the expected format?
5. **Bragfile health**: Is it append-only (no entries appear to have been removed)? Is yearly rotation up to date?
6. **Contacts health**: Do all entries have the required fields (at minimum Name and Role)?
7. **AGENTS.md consistency**: Does AGENTS.md match the current `brainkit.toml` config? Warn if it appears stale or out of sync.
8. **Orphaned content**: Are there files in the vault root that should be in a PARA category?

## Output format

Report results as:
- ✓ Check passed
- ⚠ Warning (non-critical, suggestion)
- ✗ Error (something is broken or missing)

Provide actionable suggestions for each warning and error. If setup actions
were performed, report what was created. If cleanup was offered, report what
was archived.
```

---

## Placeholder System

Skill templates may use placeholders that are replaced during installation based on `brainkit.toml`:

| Placeholder | Replaced with |
|---|---|
| `{{user_name}}` | User's name from config |
| `{{user_role}}` | User's role from config |
| `{{vault_scope}}` | "professional", "personal", or "both" |
| `{{bragfile_path}}` | `02_areas/career/bragfile.md` |
| `{{contacts_path}}` | `03_resources/contacts.md` |
| `{{archive_path}}` | `04_archive/` |

Since PARA is mandatory, these paths are effectively constants. They are kept as placeholders for potential future customization (e.g., if a user wants a non-standard PARA layout), but the defaults are always the canonical paths shown above.
