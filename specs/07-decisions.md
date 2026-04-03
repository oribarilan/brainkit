# Decisions Log

This documents key design decisions, their reasoning, and alternatives considered. Decisions are numbered chronologically.

---

### 1. Pi extension over CLI/skill-distribution

**Decision**: Build brainkit as a pi coding agent extension, not a standalone CLI that distributes SKILL.md files to multiple agents.

**Reasoning**: The original plan was a CLI (`brainkit`) that generates AGENTS.md and installs SKILL.md files into provider-specific directories (.agents/, .claude/, .cursor/, etc.). This supports multiple agents but skills are passive — the agent interprets markdown instructions with varying quality. A pi extension gives us typed tools (deterministic operations), custom UI (header, status bar, dashboard), system prompt injection (dynamic context every turn), and event hooks (auto-brag detection). The experience is qualitatively richer.

**Trade-off**: Locks users into pi. Accepted because pi itself supports many LLM providers, and the richer experience outweighs multi-agent portability.

**Alternative considered**: Hybrid (pi extension + SKILL.md fallback). Rejected for v1 — too much maintenance for unclear benefit.

---

### 2. PARA is mandatory

**Decision**: PARA structure is always enabled. Not a toggleable feature. Fixed 4 categories with standard paths (01_projects, 02_areas, 03_resources, 04_archive). No customization in v1.

**Reasoning**: Making PARA optional introduced dual-path complexity everywhere — every feature that places files needed conditional paths, skills needed conditional logic, system prompt needed conditional sections. PARA is the organizational backbone of a second brain. A user who doesn't want PARA doesn't want brainkit. Removing the toggle eliminated ~30% of conditional logic.

---

### 3. Extension + Skills = two layers

**Decision**: Use pi extensions (TypeScript) for programmatic operations AND pi skills (Markdown) for domain knowledge. Neither alone is sufficient.

**Reasoning**: Tools handle the HOW (brain_add_brag programmatically finds the right section and appends). Skills handle the WHEN and WHY (the bragfile skill teaches the agent to recognize accomplishments and suggest capturing them). Without skills, the agent has buttons but doesn't know when to press them. Without tools, the agent knows what to do but guesses at formatting.

---

### 4. Skills per feature, not per workflow

**Decision**: Each skill describes a complete feature (bragfile, contacts, PARA, etc.), not a narrow workflow (add-brag, query-contacts).

**Reasoning**: Feature-scoped skills give the agent full context — it understands the bragfile concept, quality criteria, format, rules, AND when to suggest entries. Workflow-scoped skills only teach mechanical steps. The feature approach enables judgment calls: recognizing accomplishments in casual conversation, cross-referencing people with contacts, deciding PARA placement.

---

### 5. No keyboard shortcuts

**Decision**: Remove keyboard shortcuts (originally Ctrl+Shift+B for quick brag). The agent handles everything through conversation.

**Reasoning**: Keyboard shortcuts conflict with terminal/tmux key bindings (Ctrl+B is tmux prefix, Ctrl+B is cursor-left in pi). More importantly, the agent already has typed tools — saying "add to my brag: shipped the API" does the same thing. Shortcuts add complexity without meaningful benefit when the agent is the primary interface.

---

### 6. /doctor fixes issues, not just reports

**Decision**: The /doctor command creates missing PARA directories and key files before running health checks. It shows what it fixed.

**Reasoning**: Reporting problems without fixing them creates friction — the user sees "missing directory" and then has to manually create it or ask the agent. /doctor should be a single command that brings the vault to a healthy state. Fix first, then report remaining issues.

---

### 7. No self-review in v1

**Decision**: Skip the self-review feature (generating review summaries from bragfile entries) for v1.

**Reasoning**: Focus on core features that establish the vault foundation. Self-review can be added later as a skill + tool once the bragfile has enough data to be useful.

---

### 8. Meeting notes via skill-guided brain_write, not dedicated tool

**Decision**: Meeting notes don't have a dedicated typed tool. The agent uses `brain_write` guided by the meeting-notes skill.

**Reasoning**: Meeting notes require judgment about placement (which PARA directory?), structure, and content extraction. A typed tool would need complex parameters to capture all this. The skill teaches the agent the conventions, and `brain_write` handles the file creation. This is simpler and more flexible.

---

### 9. [brainkit] branding, no emojis

**Decision**: Use `[brainkit]` as the brand marker throughout the UI. No emojis anywhere.

**Reasoning**: Terminal-native aesthetic. `[brainkit]` is clear, distinctive, and works in all terminals. Emojis can render inconsistently across terminals and fonts.

---

### 10. Rose ASCII art header

**Decision**: Display a rose ASCII art with "brainkit" tagline and command reference on session start.

**Reasoning**: Creates a distinctive visual identity when opening pi with brainkit. The command reference below it serves discoverability — users see available commands immediately without needing to type /help.

---

### 11. Rotating status bar hints

**Decision**: Status bar shows `[brainkit] vault-name ✓ · hint` with hints cycling every 12 seconds.

**Reasoning**: Implements the discoverability principle. Users learn about features organically through ambient hints rather than reading documentation. Tips cover commands, tools, and workflows.

---

### 12. TypeScript builder for system prompt

**Decision**: Build the system prompt (equivalent of AGENTS.md) in TypeScript code with conditional string construction, not a template engine like Handlebars.

**Reasoning**: No extra dependency. Easier to test. The system prompt is built dynamically from config, so TypeScript conditionals are natural. The "template" notation in early specs was illustrative, not prescriptive.

---

### 13. Pi package format for distribution

**Decision**: Structure the repo as a pi package with `package.json` containing `pi.extensions` and `pi.skills` manifests.

**Reasoning**: Users install with `pi install git:github.com/oribarilan/brainkit`. Pi handles cloning, npm install, and resource discovery. The `pi` manifest in package.json explicitly declares which files are extensions (only index.ts) and which directories contain skills. Pi's peer dependency system means we don't bundle pi's own packages.

---

### 14. brainkit.toml for vault config

**Decision**: Use TOML format for vault configuration, parsed with smol-toml.

**Reasoning**: TOML is readable, supports nested structures (user, features), and is familiar to developers. JSON is verbose for config. YAML has parsing gotchas. TOML hits the sweet spot. smol-toml is a small, correct parser.

---

### 15. Global config at ~/.config/brainkit/config.json

**Decision**: Store the vault path in a global JSON file at `~/.config/brainkit/config.json`.

**Reasoning**: The extension needs to know the vault path from any directory. This can't live in the vault itself (chicken-and-egg). `~/.config/` follows XDG conventions. JSON is fine for a single-field config.

---

### 16. Auto-brag detection via agent_end hook

**Decision**: After the agent finishes responding, scan for accomplishment keywords near "you"/"your" and suggest capturing them via desktop notification.

**Reasoning**: Implements the "just works" principle — the user doesn't need to remember to log accomplishments. The detection is conservative (word boundary matching, proximity checks, filtering agent self-references like "I implemented") to avoid false positives. Notifications are non-intrusive — a desktop notification, not an inline interruption.

---

### 17. Smart project context detection

**Decision**: On each turn, check if the current working directory name matches a project in `01_projects/`. If so, inject that project's context into the system prompt.

**Reasoning**: When a user opens pi in `~/repos/api-redesign/` and there's a `01_projects/api-redesign/` in their vault, the agent should know about it. This makes vault context relevant without the user explicitly mentioning it.

---

### 18. Skills-first architecture — commands only trigger skills

**Decision**: Skills are the primary interface. Commands (`/setup`, `/doctor`) are thin wrappers that send a message to trigger the agent — they contain zero logic. All intelligence lives in skills (domain knowledge, judgment) and tools (deterministic execution). Removed `/brain` and `/help` entirely — the agent handles "show me stats" and "what can you do?" naturally from skill knowledge.

**Reasoning**: Commands with heavy logic (interactive wizards, TUI panels) create a parallel UI system that contradicts the "just works" principle. The user's interaction model is conversation, not slash commands. When a user types `/setup`, it should feel the same as typing "help me set up my vault" — because it IS the same thing. The command just saves typing.

This also eliminates duplicated logic. Previously, setup lived in both a command (TypeScript TUI wizard) and a skill (agent guidance). Now it lives in one place: the skill teaches the agent what to ask, the tool writes the config. The command is just `pi.sendUserMessage("I want to set up my brainkit vault")`.

**Architecture**:

- **Skills** = intelligence layer. Teach the agent WHAT to do, WHEN to do it, and WHY. Each skill covers a complete feature (PARA, bragfile, contacts, meeting notes, maintenance). Skills are the primary interface.
- **Tools** = execution layer. Deterministic, typed operations. `brain_add_brag` finds the right section and appends. `brain_doctor` creates missing structure and reports health. Tools do exactly what they're told, reliably.
- **Commands** = convenience shortcuts. `/setup` sends a message. `/doctor` sends a message. That's it. No logic, no UI, no state management.
- **Ambient UI** = discoverability. Header shows the rose + command reference. Status bar rotates tips. These are passive — they inform, they don't interact.

**Consequences**:

- No custom TUI panels for doctor/dashboard/help — the agent formats output naturally
- Skills must be comprehensive enough to guide the agent through complex flows (like the multi-step setup)
- Tools must be granular enough for the agent to compose them (brain_setup_vault → brain_write → brain_doctor)
- The agent becomes the universal interface — talking to it is always the right way to interact

---

### 19. Auto-update via GitHub version check + changelog

**Decision**: On session start, fetch the remote `package.json` from GitHub to check for newer versions. If an update is available, show a sticky status bar indicator (`v0.2.0 available · run: pi update`). After `pi update` installs a new version, show the changelog from `CHANGELOG.md` on first run.

**Reasoning**: Users shouldn't have to manually check for updates. The version check is non-blocking (async fetch, fire-and-forget) so it never delays session start. The sticky status bar ensures the user sees the update availability without being interrupted — it persists alongside the rotating hints. The changelog on first run after update tells users what's new, reducing surprise and encouraging adoption of new features. `lastSeenVersion` is tracked in the global config to detect when an update has been applied.

**Mechanism**: `pi update` is the built-in pi command that pulls the latest from git for non-pinned packages. No custom update command needed.

---

### 20. Debounced auto-commit for vault backup

**Decision**: After each agent turn, schedule a git commit with a 30-second debounce. If another turn happens within the window, the timer resets. On session shutdown, flush immediately. No auto-push — only local commits.

**Reasoning**: Vault changes should be tracked in git for history and backup. Per-mutation commits are too noisy. Session-end-only commits miss changes if pi crashes. Debounced commits hit the sweet spot — granular enough to survive crashes, quiet enough to not clutter the git log. Multiple rapid changes (like setup creating 5 directories) collapse into one commit. No auto-push because pushing is aggressive and assumes the remote is always available.

---

### 21. GitHub repo privacy check in brain_doctor

**Decision**: brain_doctor checks if the vault's GitHub repo is public and reports it as an error with a fix command.

**Reasoning**: The vault contains personal and professional information — contacts, accomplishments, meeting notes, personal life details. A public repo exposes all of this. The check uses `git` + `gh` CLI and skips silently if either isn't available. This is a security-first default — better to warn every health check than to let a public repo go unnoticed.
