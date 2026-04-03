# Extension Design

## Tools

All tools are prefixed with `brain_` and registered via `pi.registerTool()`. Each has typed parameters via TypeBox, custom rendering via pi's theme system, and returns structured `{ content, details }` responses.

### brain_add_brag

- **Parameters**: `description` (string), `date?` (YYYY-MM-DD), `project?` (string)
- **Behavior**: Programmatically parses bragfile, finds/creates half-year and month sections, appends formatted entry
- **Rendering**: Shows `✓ - **2026-04-03**: description` in success/muted colors

### brain_query_contacts

- **Parameters**: `query` (string)
- **Behavior**: Reads contacts, parses into structured data, fuzzy searches across all fields
- **Rendering**: Contact cards with name in accent, fields in muted

### brain_add_contact

- **Parameters**: `name`, `role`, `team?`, `relation?`, `connection?`, `relevantFor?`
- **Behavior**: Appends formatted contact section to contacts.md

### brain_search

- **Parameters**: `query` (string), `scope?` ("all" | "projects" | "areas" | "resources" | "archive")
- **Behavior**: Recursively searches .md files, returns top 10 matches with context lines
- **Rendering**: File paths in accent, matching content in muted

### brain_read

- **Parameters**: `path` (relative to vault)
- **Behavior**: Reads file, validates path within vault (no traversal)

### brain_write

- **Parameters**: `path` (relative to vault), `content` (string)
- **Behavior**: Writes file, creates parent dirs, validates path, blocks archive writes

### brain_setup_vault

- **Parameters**: `vaultPath` (string)
- **Behavior**: Sets vault path in global config (`~/.config/brainkit/config.json`), creates vault directory if it doesn't exist

### brain_doctor

- **Parameters**: none
- **Behavior**: Creates missing PARA directories and key files (bragfile, contacts), runs health checks, returns structured results with fixes shown

## Commands

### /setup

Thin wrapper that sends a message to trigger the agent. The agent uses skills for guidance and tools for execution.

### /doctor

Thin wrapper that sends a message to trigger the agent. The agent uses skills for guidance and tools for execution.

## UI Components

### Custom Header

Rose ASCII art in accent color with "brainkit" tagline and command quick reference. Displayed on session start, replaces pi's default header.

### Status Bar

`[brainkit] vault-name ✓ · rotating hint`

Rotating hints cycle every 12 seconds through tips about commands, tools, and features. Hints include:

- /setup, /doctor references
- brain_search, brain_add_brag, brain_query_contacts references

### Session Naming

Session is named `[brainkit]` for identification in pi's session selector.

## Event Hooks

### before_agent_start — System Prompt Injection

Every turn, builds and injects the vault system prompt:

- User identity, role, expertise, scope
- PARA structure description
- Key files and their rules (conditional on enabled features)
- Conventions (naming, formatting, tone)
- Custom user rules
- Smart project detection: if cwd matches a project in `01_projects/`, injects that project's context

### agent_end — Auto-Brag Detection

Scans assistant's last message for accomplishment keywords ("shipped", "launched", "completed", etc.) near "you"/"your". If detected, sends a desktop notification suggesting capture. Tracks already-suggested messages to avoid repeating.

### session_start — Initialization

Loads vault config, sets up UI, starts hint rotation timer.

### session_shutdown — Cleanup

Clears hint rotation timer.

## System Prompt Builder

The system prompt is built dynamically in TypeScript (not a template engine). It constructs sections conditionally based on config:

1. Identity (name, role, expertise, scope, context)
2. Vault structure (PARA description)
3. Key files (conditional on features)
4. Conventions (naming, formatting, tone)
5. Custom rules (from config)
6. Behavioral rules (always: use brain\_\* tools, search first, cite sources, never delete)
7. Project context (smart cwd detection)
