# Decisions Log

This documents key design decisions, their reasoning, and alternatives considered. Decisions are numbered chronologically.

---

### 1. OpenCode plugin over generic CLI distribution

**Decision**: Build brainkit as an OpenCode plugin (server + TUI), not a standalone CLI that distributes SKILL.md files to multiple agents. _(Supersedes original decision to build as a pi extension.)_

**Reasoning**: The original plan was a CLI (`brainkit`) that generates AGENTS.md and installs SKILL.md files into provider-specific directories (.agents/, .claude/, .cursor/, etc.). This supports multiple agents but skills are passive — the agent interprets markdown instructions with varying quality. An OpenCode plugin gives us system prompt injection (dynamic context every turn), TUI customization (ASCII art header, sidebar, rotating tips), event hooks (auto-brag detection, auto-commit), and a richer overall experience. The plugin API provides structured integration points that a CLI alone cannot match.

**Trade-off**: Couples the primary experience to OpenCode. Accepted because the CLI still exists as a thin launcher for OpenCode, and the richer plugin experience outweighs generic multi-agent portability.

**Alternative considered**: Hybrid (OpenCode plugin + SKILL.md fallback to other agents). Rejected for v1 — too much maintenance for unclear benefit. Future harness support (e.g., Copilot CLI) can be added later.

---

### 2. PARA is mandatory

**Decision**: PARA structure is always enabled. Not a toggleable feature. Fixed 4 categories with standard paths (01_projects, 02_areas, 03_resources, 04_archive). No customization in v1.

**Reasoning**: Making PARA optional introduced dual-path complexity everywhere — every feature that places files needed conditional paths, skills needed conditional logic, system prompt needed conditional sections. PARA is the organizational backbone of a second brain. A user who doesn't want PARA doesn't want brainkit. Removing the toggle eliminated ~30% of conditional logic.

---

### 3. Plugin + Skills = two layers

**Decision**: Use the OpenCode plugin (TypeScript) for programmatic operations AND skills (Markdown) for domain knowledge. Neither alone is sufficient.

**Reasoning**: The plugin handles the HOW — system prompt injection provides dynamic vault context every turn, event hooks detect accomplishments and trigger auto-commits, and the TUI surfaces tips and stats. Skills handle the WHEN and WHY — the bragfile skill teaches the agent to recognize accomplishments and suggest capturing them, the PARA skill teaches file placement conventions. Without skills, the plugin provides infrastructure but the agent doesn't know domain conventions. Without the plugin, the agent knows what to do but lacks dynamic context and automation.

---

### 4. Skills per feature, not per workflow

**Decision**: Each skill describes a complete feature (bragfile, contacts, PARA, etc.), not a narrow workflow (add-brag, query-contacts).

**Reasoning**: Feature-scoped skills give the agent full context — it understands the bragfile concept, quality criteria, format, rules, AND when to suggest entries. Workflow-scoped skills only teach mechanical steps. The feature approach enables judgment calls: recognizing accomplishments in casual conversation, cross-referencing people with contacts, deciding PARA placement.

---

### 5. No keyboard shortcuts

**Decision**: Remove keyboard shortcuts (originally Ctrl+Shift+B for quick brag). The agent handles everything through conversation.

**Reasoning**: Keyboard shortcuts conflict with terminal/tmux key bindings (Ctrl+B is tmux prefix, Ctrl+B is cursor-left in many terminals). More importantly, the agent already has the knowledge from skills — saying "add to my brag: shipped the API" does the same thing. Shortcuts add complexity without meaningful benefit when the agent is the primary interface in OpenCode.

---

### 6. /doctor fixes issues, not just reports

**Decision**: The /doctor command creates missing PARA directories and key files before running health checks. It shows what it fixed.

**Reasoning**: Reporting problems without fixing them creates friction — the user sees "missing directory" and then has to manually create it or ask the agent. /doctor should be a single command that brings the vault to a healthy state. Fix first, then report remaining issues.

---

### 7. No self-review in v1

**Decision**: Skip the self-review feature (generating review summaries from bragfile entries) for v1.

**Reasoning**: Focus on core features that establish the vault foundation. Self-review can be added later as a skill once the bragfile has enough data to be useful. No feature flag is defined until the feature is built (YAGNI).

---

### 8. Meeting notes via skill-guided file editing, not a dedicated tool

**Decision**: Meeting notes don't have a dedicated typed tool. The agent uses built-in file editing tools (read, write, edit) guided by the meeting-notes skill.

**Reasoning**: Meeting notes require judgment about placement (which PARA directory?), structure, and content extraction. A typed tool would need complex parameters to capture all this. The skill teaches the agent the conventions — file naming, template structure, placement rules — and the agent uses standard file operations to create the notes. This is simpler and more flexible than a purpose-built tool.

---

### 9. [brainkit] branding, no emojis

**Decision**: Use `[brainkit]` as the brand marker throughout the UI. No emojis anywhere.

**Reasoning**: Terminal-native aesthetic. `[brainkit]` is clear, distinctive, and works in all terminals. Emojis can render inconsistently across terminals and fonts.

---

### 10. Rose ASCII art header

**Decision**: Display a rose ASCII art with "brainkit" tagline and command reference on session start.

**Reasoning**: Creates a distinctive visual identity when opening OpenCode with brainkit. The command reference below it serves discoverability — users see available commands immediately without needing to type /help.

---

### 11. Rotating status bar hints

**Decision**: Status bar shows `[brainkit] vault-name ✓ · hint` with hints cycling every 12 seconds.

**Reasoning**: Implements the discoverability principle. Users learn about features organically through ambient hints rather than reading documentation. Tips cover commands, tools, and workflows.

---

### 12. TypeScript builder for system prompt

**Decision**: Build the system prompt (equivalent of AGENTS.md) in TypeScript code with conditional string construction, not a template engine like Handlebars.

**Reasoning**: No extra dependency. Easier to test. The system prompt is built dynamically from config, so TypeScript conditionals are natural. The "template" notation in early specs was illustrative, not prescriptive.

---

### 13. npm package with OpenCode plugin exports

**Decision**: Structure the repo as two npm packages — `@oribish/brainkit-core` (shared logic) and `@oribish/brainkit` (CLI + plugin + skills) — with OpenCode plugin entry points declared via `exports` in package.json. _(Supersedes original pi package format decision.)_

**Reasoning**: OpenCode loads plugins via package.json `exports`. The `./server` export points to `opencode/server.ts` (server plugin: system prompt injection, event hooks) and the `./tui` export points to `opencode/tui.tsx` (TUI plugin: ASCII art, sidebar, tips, theme). OpenCode runs these via bun — no build step needed for the plugin itself. The CLI (`cli/index.ts`) is compiled to `dist/` for npm distribution. The two-package split keeps `@oribish/brainkit-core` dependency-free (only `smol-toml`) while `@oribish/brainkit` has optional peer deps on OpenCode packages.

---

### 14. brainkit.toml for vault config

**Decision**: Use TOML format for vault configuration, parsed with smol-toml.

**Reasoning**: TOML is readable, supports nested structures (user, features), and is familiar to developers. JSON is verbose for config. YAML has parsing gotchas. TOML hits the sweet spot. smol-toml is a small, correct parser.

---

### 15. Global config at ~/.config/brainkit/config.json

**Decision**: Store the vault path in a global JSON file at `~/.config/brainkit/config.json`.

**Reasoning**: The plugin needs to know the vault path from any directory. This can't live in the vault itself (chicken-and-egg). `~/.config/` follows XDG conventions. JSON is fine for a single-field config.

---

### 16. Auto-brag detection via session.idle hook

**Decision**: After the agent finishes responding, scan for accomplishment keywords near "you"/"your" and suggest capturing them via a toast notification.

**Reasoning**: Implements the "just works" principle — the user doesn't need to remember to log accomplishments. The detection is conservative (word boundary matching, proximity checks, filtering agent self-references like "I implemented") to avoid false positives. Toast notifications are non-intrusive — a brief overlay, not an inline interruption.

---

### 17. Smart project context detection

**Decision**: On each turn, check if the current working directory name matches a project in `01_projects/`. If so, inject that project's context into the system prompt.

**Reasoning**: When a user opens OpenCode in `~/repos/api-redesign/` and there's a `01_projects/api-redesign/` in their vault, the agent should know about it. This makes vault context relevant without the user explicitly mentioning it.

---

### 18. Skills-first architecture — commands only trigger skills

**Decision**: Skills are the primary interface. Commands (`/setup`, `/doctor`) are thin wrappers that submit a message to the chat — they contain zero logic. All intelligence lives in skills (domain knowledge, judgment) and the plugin (system prompt, hooks, TUI). Removed `/brain` and `/help` entirely — the agent handles "show me stats" and "what can you do?" naturally from skill knowledge.

**Reasoning**: Commands with heavy logic (interactive wizards, TUI panels) create a parallel UI system that contradicts the "just works" principle. The user's interaction model is conversation, not slash commands. When a user types `/setup`, it should feel the same as typing "help me set up my vault" — because it IS the same thing. The command just saves typing.

This also eliminates duplicated logic. Previously, setup lived in both a command (TypeScript wizard) and a skill (agent guidance). Now it lives in one place: the skill teaches the agent what to ask, and the agent uses built-in file tools to write the config. The command simply submits a chat message (e.g., `api.chat.submit("I want to set up my brainkit vault")`).

**Architecture**:

- **Skills** = intelligence layer. Teach the agent WHAT to do, WHEN to do it, and WHY. Each skill covers a complete feature (PARA, bragfile, contacts, meeting notes, maintenance). Skills are the primary interface.
- **Plugin** = infrastructure layer. System prompt injection provides dynamic vault context. Event hooks handle auto-brag detection and auto-commit. The TUI surfaces tips, stats, and branding. No typed `brain_*` tools — the agent uses built-in file operations guided by skills.
- **Commands** = convenience shortcuts. `/setup` submits a message. `/doctor` submits a message. That's it. No logic, no UI, no state management.
- **Ambient UI** = discoverability. Header shows the rose + command reference. Sidebar shows vault stats. Tips rotate in the status area. These are passive — they inform, they don't interact.

**Consequences**:

- No custom TUI panels for doctor/dashboard/help — the agent formats output naturally
- Skills must be comprehensive enough to guide the agent through complex flows (like the multi-step setup)
- The agent uses built-in file tools (read, write, edit) to interact with the vault, guided by skill conventions
- The agent becomes the universal interface — talking to it is always the right way to interact

---

### 19. Version management via npm

**Decision**: Version management is handled through npm's standard mechanisms (`npm update`, semver). No custom auto-update infrastructure. _(Supersedes original auto-update via GitHub version check decision.)_

**Reasoning**: The original design relied on a harness-specific update mechanism that doesn't apply to OpenCode's plugin model. npm already handles versioning, dependency resolution, and updates. Users install via `npm install @oribish/brainkit` and update via `npm update`. This is simpler, more reliable, and follows ecosystem conventions. A future enhancement could add a version check on session start to suggest updates, but it's not needed for v1.

---

### 20. Debounced auto-commit for vault backup

**Decision**: After each agent turn, schedule a git commit with a 30-second debounce. If another turn happens within the window, the timer resets. On session shutdown, flush immediately. No auto-push — only local commits.

**Reasoning**: Vault changes should be tracked in git for history and backup. Per-mutation commits are too noisy. Session-end-only commits miss changes if the session terminates unexpectedly. Debounced commits hit the sweet spot — granular enough to survive interruptions, quiet enough to not clutter the git log. Multiple rapid changes (like setup creating 5 directories) collapse into one commit. No auto-push because pushing is aggressive and assumes the remote is always available.

---

### 21. GitHub repo privacy check in /doctor

**Decision**: The /doctor health check verifies whether the vault's GitHub repo is public and reports it as an error with a fix command.

**Reasoning**: The vault contains personal and professional information — contacts, accomplishments, meeting notes, personal life details. A public repo exposes all of this. The check uses `git` + `gh` CLI and skips silently if either isn't available. This is a security-first default — better to warn every health check than to let a public repo go unnoticed.

---

### 22. OpenCode-first with multi-harness extensibility

**Decision**: OpenCode is the primary and recommended harness. The CLI (`npx @oribish/brainkit`) is a thin launcher that spawns OpenCode with the plugin loaded. Future harness support (e.g., Copilot CLI) can be added as additional launcher targets. _(Supersedes original pi-first with CLI fallback decision.)_

**Reasoning**: The original dual-mode approach (full extension experience + degraded CLI skill distribution) created maintenance overhead with unclear benefit. The current architecture inverts this: the CLI IS the entry point, but its job is to launch OpenCode with the right config. The CLI creates config files at `~/.config/brainkit/`, sets `OPENCODE_CONFIG` and `OPENCODE_TUI_CONFIG` env vars, and spawns `opencode`. This gives every user the full experience — there's no degraded mode.

**Trade-off**: Users need OpenCode installed. Accepted because brainkit's value proposition (persistent second brain with ambient intelligence) requires the plugin infrastructure that OpenCode provides. The CLI launcher makes installation frictionless (`npx @oribish/brainkit` auto-detects OpenCode on `$PATH`).

**Future extensibility**: The launcher architecture supports multiple harnesses. Adding Copilot CLI support would mean detecting `copilot` on `$PATH` and generating its config format. Skills are already harness-agnostic (Decision #23), so only the launcher needs per-harness logic.

---

### 23. Action-oriented skills — no tool-specific references

**Decision**: Write skills with action-oriented language ("add a brag entry to `02_areas/career/bragfile.md`") instead of referencing specific tools. The agent uses whatever file tools its harness provides.

**Reasoning**: Skills teach domain knowledge (conventions, judgment, formats). Tool execution is the agent's responsibility based on its environment. When skills reference specific tool names, agents without those tools get confused — they try to call nonexistent tools or hallucinate behavior. Action-oriented language works universally: the agent reads the skill, understands the convention, and uses its built-in file operations to execute. This makes skills portable across harnesses (OpenCode today, potentially Copilot CLI or others in the future) with zero transformation needed.

**Alternative considered**: (a) Prepend a preamble telling agents to ignore tool references — fragile, agents forget mid-skill. (b) Strip tool references during distribution — maintenance burden, error-prone regex. Action-oriented language avoids both problems.

---

### Collapsed to single npm package (2026-04-26)

**Decision**: Merge `@oribish/brainkit-core` into `@oribish/brainkit` as a single published package. The `core/` directory remains as an organizational boundary but is no longer a separate workspace or npm package.

**Reasoning**: The separate core package added complexity (workspace protocol resolution, two-package publish ordering, version synchronization) with no external consumer. All imports changed from `@oribish/brainkit-core` to relative paths. `smol-toml` and `@types/node` moved to root package.json. _(Supersedes the two-package split decision.)_
