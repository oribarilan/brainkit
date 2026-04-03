# Architecture

## Two Layers

Brainkit has two complementary layers:

| Layer         | Format     | Purpose                                   | Examples                                                   |
| ------------- | ---------- | ----------------------------------------- | ---------------------------------------------------------- |
| **Extension** | TypeScript | Programmatic operations, UI, event hooks  | Tools, commands (thin wrappers), status bar, system prompt |
| **Skills**    | Markdown   | Domain knowledge, teaching agent judgment | When to suggest a brag, how to structure meeting notes     |

### Why Two Layers?

Tools handle the **how** — `brain_add_brag` programmatically finds the right month section and appends a correctly formatted entry. Skills handle the **when** and **why** — the bragfile skill teaches the agent to recognize accomplishments in conversation and suggest capturing them.

Neither alone is sufficient:

- Tools without skills: the agent has buttons but doesn't know when to press them
- Skills without tools: the agent knows what to do but has to guess at formatting and placement

## Package Structure

Brainkit is a pi package, distributable via npm or git:

```
brainkit/
  package.json              # Pi package manifest
  extensions/               # TypeScript — programmatic layer
    index.ts                # Entry point, wires everything together
    vault.ts                # Vault discovery, config, file operations
    tools.ts                # 8 typed LLM tools
    ui.ts                   # Header, status bar
    hooks.ts                # System prompt injection, auto-brag detection
    system-prompt.ts        # Dynamic system prompt builder
    updater.ts              # Version checking, changelog display
  skills/                   # Markdown — intelligence layer
    brainkit/SKILL.md       # Root: what brainkit is, conventions, tools overview
    para/SKILL.md           # PARA method, categories, decision framework
    bragfile/SKILL.md       # Bragfile format, quality criteria, suggestions
    contacts/SKILL.md       # Contacts format, cross-referencing, suggestions
    meeting-notes/SKILL.md  # Meeting notes placement, naming, structure
    maintenance/SKILL.md    # Vault health, naming rules, archive workflow
  specs/                    # Design documents (not loaded by pi)
```

### Installation & Distribution

Distributed via git. Users install from GitHub — pi clones the repo, runs `npm install`, and loads resources from the `pi` manifest in `package.json`. `pi update` pulls latest main.

```bash
# Install (tracks main branch)
pi install git:github.com/oribarilan/brainkit

# Pin to a specific version
pi install git:github.com/oribarilan/brainkit@v1.0.0

# Quick test without installing (temp, current session only)
pi -e git:github.com/oribarilan/brainkit

# Local development
pi install /path/to/brainkit
```

npm distribution can be added later for semver guarantees and shorter install commands (`pi install npm:brainkit`).

## Data Flow

```

Session Start
│
├─► Load global config (~/.config/brainkit/config.json)
│ └─► Get vault path
├─► Load vault config (brainkit.toml)
├─► Register tools (brain\_\*)
├─► Set up UI (header, status bar, hints)
├─► Load skills (from skills/ directory)
└─► Set session name
│
User sends message
│
├─► before_agent_start hook
│ └─► Build system prompt from config
│ - User identity, role, expertise
│ - Vault structure (PARA)
│ - Enabled features and key files
│ - Conventions and custom rules
│ - Smart project detection (cwd match)
│ └─► Inject into system prompt
│
├─► Agent processes with tools + skills
│ - Skills provide judgment (when/why)
│ - Tools provide execution (how)
│
└─► agent_end hook
└─► Auto-brag detection - Scan for accomplishment language - Suggest capturing if relevant

/setup (thin wrapper — sends message to agent)
│
└─► Agent receives message, guided by brainkit skill
├─► Asks user questions (vault path, name, role, etc.)
├─► Calls brain_setup_vault tool (sets vault path, creates dir)
├─► Calls brain_write tool (writes brainkit.toml)
└─► Calls brain_doctor tool (creates PARA dirs and key files)

/doctor (thin wrapper — sends message to agent)
│
└─► Agent receives message
    └─► Calls brain_doctor tool (fixes missing dirs/files, runs health checks)
```

## Configuration

### Global Config (`~/.config/brainkit/config.json`)

```json
{
  "vaultPath": "/Users/ori/brain"
}
```

Set via `brain_setup_vault` tool (triggered by `/setup` command). Tells the extension where the vault lives.

### Vault Config (`brainkit.toml`)

```toml
[brainkit]
version = "0.1.0"

[user]
name = "Ori"
role = "Senior Backend Engineer"
expertise = ["distributed systems", "API design", "security"]
tone = "direct and technical"
scope = "professional"
context = "Working on threat detection platform"
rules = [
  "Always use bullet points over paragraphs",
  "Mention ticket numbers when relevant",
]

[features]
bragfile = true
contacts = true
meeting-notes = true
self-review = false
vault-health = true
```

Created by the agent via `brain_write`, guided by the brainkit skill during `/setup`.

## Vault Structure

PARA is mandatory. The vault always has this structure:

```
vault/
  brainkit.toml
  01_projects/          # Active efforts with deadlines
  02_areas/             # Ongoing responsibilities
    career/
      bragfile.md       # Accomplishments log
  03_resources/         # Reference material
    contacts.md         # People index
  04_archive/           # Completed/inactive items
```
