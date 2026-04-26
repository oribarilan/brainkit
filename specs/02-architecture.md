# Architecture

## Two Layers

Brainkit has two complementary layers:

| Layer               | Format     | Purpose                                   | Examples                                                    |
| ------------------- | ---------- | ----------------------------------------- | ----------------------------------------------------------- |
| **OpenCode Plugin** | TypeScript | System prompt injection, event hooks, TUI | Auto-commit, brag detection, sidebar stats, compaction hook |
| **Skills**          | Markdown   | Domain knowledge, teaching agent judgment | When to suggest a brag, how to structure meeting notes      |

### Why Two Layers?

The plugin handles the **how** — system prompt injection tells the agent about the vault, auto-commit keeps changes tracked, brag detection spots accomplishments in conversation. Skills handle the **when** and **why** — the bragfile skill teaches the agent to recognize accomplishments and capture them with the right formatting.

Neither alone is sufficient:

- Plugin without skills: the agent has vault context but doesn't know conventions, formats, or decision frameworks
- Skills without plugin: the agent knows what to do but lacks vault awareness, auto-commit, and a polished TUI

A key design choice: brainkit does **not** define typed tools (no `brain_*` functions). The agent uses built-in file tools (read, write, edit) guided by skills. Skills teach the agent where files go and how to format them. This keeps the architecture simple and avoids a brittle tool API.

## Package Structure

> **Note (2026-04-26):** The two-package architecture described below has been superseded. The repo now publishes a single `@oribish/brainkit` package. See `specs/07-decisions.md` for rationale.

Brainkit publishes two npm packages:

| Package                  | Directory | What it contains                                 |
| ------------------------ | --------- | ------------------------------------------------ |
| `@oribish/brainkit-core` | `core/`   | Vault ops, system prompt, types. Zero peer deps. |
| `@oribish/brainkit`      | root      | CLI + OpenCode plugin + skills. Depends on core. |

`@oribish/brainkit-core` has a single runtime dependency (`smol-toml` for TOML parsing). `@oribish/brainkit` has optional peer deps on OpenCode packages (`@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js`).

Root `package.json` uses `"workspaces": ["core"]`. Publishing order: core first, then brainkit.

```
brainkit/
  core/                     # @oribish/brainkit-core
    vault.ts                # Vault discovery, config, file operations, brag stats
    system-prompt.ts        # Dynamic system prompt builder
    prompt-sections.ts      # Individual prompt section builders
    auto-commit.ts          # Debounced git auto-commit
    hooks.ts                # Brag detection helpers
    types.ts                # Shared types (BrainkitConfig, etc.)
    agent-prompts.ts        # Sub-agent prompt builders
    migrations.ts           # Config schema migrations
  opencode/                 # OpenCode plugin (loaded directly by bun)
    server.ts               # Server plugin: system prompt, compaction, brag detection, auto-commit
    tui.tsx                 # TUI plugin: home logo, sidebar, tips, theme
    side.tsx                # Sidebar component (vault stats)
    tips.tsx                # Rotating tips component
    logo.ts                 # ASCII art
    brainkit.json           # Custom color theme
  cli/                      # CLI entry point (compiled to dist/ for npm)
    index.ts                # Entry point, routes to harness launcher
    launch.ts               # Harness detection, config setup, spawn opencode
  skills/                   # Markdown — domain knowledge
    brainkit/SKILL.md       # Root: what brainkit is, conventions, overview
    para/SKILL.md           # PARA method, categories, decision framework
    bragfile/SKILL.md       # Bragfile format, quality criteria, suggestions
    contacts/SKILL.md       # Contacts format, cross-referencing, suggestions
    meeting-notes/SKILL.md  # Meeting notes placement, naming, structure
    maintenance/SKILL.md    # Vault health, naming rules, archive workflow
    onboarding/SKILL.md     # First-run Q&A guidance
  specs/                    # Design documents
  docs/                     # Feature documentation
```

### Installation & Distribution

Distributed via npm. Users install globally or run with `npx`:

```bash
# Run directly (recommended)
npx @oribish/brainkit

# Or install globally
npm install -g @oribish/brainkit
brainkit
```

The CLI detects OpenCode on `$PATH`, creates config files at `~/.config/brainkit/`, and spawns `opencode` with `OPENCODE_CONFIG` and `OPENCODE_TUI_CONFIG` env vars pointing to generated configs. OpenCode merges these with the user's existing config, loading the plugin from the installed package.

### Plugin Entry Points

The OpenCode plugin exposes two entry points via `package.json` exports:

```json
{
  "exports": {
    "./server": { "import": "./opencode/server.ts" },
    "./tui": { "import": "./opencode/tui.tsx" }
  }
}
```

OpenCode loads `.ts`/`.tsx` files directly via bun — no build step needed for the plugin. The CLI, however, is compiled to `dist/` via `tsc` for npm publishing.

## Data Flow

```
CLI Launch (npx @oribish/brainkit)
│
├─► Detect OpenCode on $PATH
├─► Create config at ~/.config/brainkit/
│   └─► opencode.json (plugin reference + settings)
│   └─► tui.json (TUI plugin reference)
└─► Spawn opencode with OPENCODE_CONFIG + OPENCODE_TUI_CONFIG env vars

OpenCode Session Start
│
├─► Load server plugin (opencode/server.ts)
│   └─► Register hooks and event handlers
├─► Load TUI plugin (opencode/tui.tsx)
│   └─► Register slots (logo, sidebar, tips), theme, commands
└─► Load skills (from skills/ directory)

User sends message
│
├─► system.transform hook
│   └─► Read global config (~/.config/brainkit/config.toml)
│   │   └─► Get vault path
│   └─► Read vault config (brainkit.toml)
│   └─► Build system prompt from config
│       - User identity, role, expertise
│       - Vault structure (PARA)
│       - Enabled features and key files
│       - Conventions and custom rules
│       - Smart project detection (cwd match)
│   └─► Inject into system prompt
│
├─► Agent processes with file tools + skills
│   - Skills provide judgment (when/why/format)
│   - Built-in file tools provide execution (read/write/edit)
│
└─► session.idle event
    └─► Auto-brag detection
        - Scan for accomplishment language
        - Suggest capturing if relevant
    └─► Auto-commit (debounced git commit of vault changes)

Session compaction
│
└─► session.compacting hook
    └─► Inject condensed vault context into compaction summary
```

## Configuration

### Global Config (`~/.config/brainkit/config.toml`)

```toml
version = 1
brain_path = "/Users/ori/brain"
```

Points to the brain directory containing one or more vaults. Each vault is a subdirectory with its own `brainkit.toml`. The CLI launcher discovers vaults, selects one (via `--vault` flag or interactive prompt), and sets `BRAINKIT_VAULT_PATH` for the plugin.

### Vault Config (`brainkit.toml`)

```toml
[brainkit]
version = "0.1.0"

[user]
name = "Ori"
role = "Senior Backend Engineer"
expertise = ["distributed systems", "API design", "security"]
tone = "direct and technical"

context = "Working on threat detection platform"
rules = [
  "Always use bullet points over paragraphs",
  "Mention ticket numbers when relevant",
]

[features]
bragfile = true
contacts = true
```

Created by the agent during onboarding, guided by the brainkit and onboarding skills. The agent writes this file directly using built-in file tools.

#### What `brainkit.toml` controls

| Section      | Fields                                                  | Used by                                                                                                    |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `[brainkit]` | `version`                                               | Version tracking, config migrations                                                                        |
| `[user]`     | `name`, `role`, `expertise`, `tone`, `context`, `rules` | System prompt builder — shapes how the agent communicates and what context it has                          |
| `[features]` | `bragfile`, `contacts`                                  | System prompt (omits disabled feature sections), health checks (skips disabled features), skill activation |

Feature flags only exist for features with runtime behavior. No flag is defined until the feature is built.

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
