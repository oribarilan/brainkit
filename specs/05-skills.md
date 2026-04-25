# Skills Design

## Philosophy

Skills are markdown files that teach the agent domain knowledge. Each skill covers one feature completely — what it is, how it works, when to use it, and how the agent should act on it.

### Skill Per Feature, Not Per Workflow

A skill describes a **feature**, not a workflow:

- **Good**: "The bragfile skill teaches everything about the bragfile — format, quality criteria, when to suggest entries, how to write them"
- **Bad**: "The add-brag skill teaches how to add a brag entry" (too narrow, misses the bigger picture)

This means the agent understands the full context of each feature, not just mechanical steps. It can make judgment calls — like recognizing an accomplishment in casual conversation and offering to capture it.

### Conditional Loading

Skills are loaded from the `skills/` directory. Currently all skills are always loaded. Future: skills could be conditionally loaded based on `config.features` to avoid cluttering the agent's context with disabled features.

## Skill Inventory

### brainkit (root)

- **Always loaded**
- What brainkit is, vault overview
- General conventions (naming, formatting, first person, bold usage)
- Available commands (brief reference)
- Discoverability principle — when to mention features proactively

### para

- PARA method: Projects, Areas, Resources, Archive
- Decision framework (deadline → project, ongoing → area, etc.)
- Directory structure rules (README.md, kebab-case)
- Archival rules (never delete, always archive with notes)
- Key files that live within PARA (bragfile path, contacts path)

### bragfile

- What it is and why it matters (performance reviews, self-advocacy)
- Format: half-year → month → dated entries
- Quality criteria: specific, quantified, impact-focused, action verbs
- Append-only rule
- The agent adds entries using built-in file editing, guided by the skill's format rules
- When to suggest: shipping, fixing, leading, mentoring — gently, not pushily

### contacts

- What the people index is
- Format: H2 per person, structured fields
- The agent reads and writes contacts using built-in file editing
- Cross-referencing: mention contacts when people come up in conversation
- When to suggest adding: new professionally relevant people, after meeting notes

### meeting-notes

- Placement rules (project → project dir, area → area dir, general → resources)
- Naming: `YYYY-MM-DD-topic.md`
- Structure template: date, attendees, summary, decisions, action items
- Conventions: bold people names, bold decisions, use `self` for vault owner
- The agent creates meeting notes using built-in file writing
- When to create: user mentions a meeting, pastes transcript, asks to summarize

### maintenance

- What vault health means
- What /doctor checks and fixes
- Naming conventions (kebab-case, exceptions)
- Archive workflow
- Post-update alignment
- Common issues and fixes
- The "never delete" rule

## How Skills Complement the Plugin

The OpenCode plugin provides the **mechanism** (system prompt injection, event hooks, auto-brag detection, TUI). Skills provide the **intelligence** (when, why, judgment). The agent uses its built-in file tools to execute — skills teach it how to use them correctly for vault operations.

Example flow when user says "I just had a 1:1 with Sarah about the migration":

1. **Meeting-notes skill** → agent knows to create meeting notes, asks clarifying questions
2. **Contacts skill** → agent checks if Sarah is in contacts, cross-references
3. **PARA skill** → agent decides where to file (under the migration project if it exists)
4. **Built-in file tools** → agent reads contacts to find Sarah, writes the meeting notes file
5. **Bragfile skill** → if something noteworthy was accomplished, suggests adding to bragfile
