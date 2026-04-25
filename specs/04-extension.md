# OpenCode Plugin Design

Brainkit ships as an OpenCode plugin with two entry points: a server plugin (`opencode/server.ts`) and a TUI plugin (`opencode/tui.tsx`). These are exported via `package.json` as `"./server"` and `"./tui"` respectively. OpenCode loads `.ts`/`.tsx` files directly via bun — no build step required.

## Agent Capabilities

The agent has no custom typed tools. It uses OpenCode's built-in file editing tools (read, write, grep, glob, etc.) guided by skills and the injected system prompt. Skills teach the agent domain knowledge — PARA conventions, bragfile format, contact format, vault health checks — and the system prompt provides vault-specific context.

### Why No Custom Tools?

Earlier iterations registered `brain_*` tools for vault operations. This was removed in favor of skills + built-in tools because:

- OpenCode's file tools are already capable and well-integrated
- Skills provide richer guidance than tool parameter schemas
- Fewer abstractions = simpler codebase, fewer bugs
- The agent can adapt its approach based on context rather than being constrained to fixed tool signatures

## Commands

### /doctor

Registered via `api.command.register()` in the TUI plugin. Submits a chat message that triggers the agent to run vault health checks using the maintenance skill.

```typescript
api.command.register(() => [
  {
    title: "Run vault health checks",
    value: "brainkit.doctor",
    category: "Brainkit",
    slash: { name: "doctor" },
    onSelect() {
      api.chat.submit("Run vault health checks using /doctor and report the results.");
    },
  },
]);
```

## UI Components

All UI is rendered with solid-js JSX via `@opentui/solid`. Components register into OpenCode's slot system with priority ordering.

### Home Logo (`home_logo` slot)

Rose-colored ASCII art brain rendered in the primary theme color. Replaces OpenCode's default logo on the home screen.

### Custom Prompt (`home_prompt` slot)

Replaces the default input prompt with:

- A "brainkit" hint label in the primary color
- Vault-related placeholder suggestions that rotate through contextual examples (e.g., "What did you accomplish this week?", "Search my vault for meeting notes with Sarah")
- Separate placeholder sets for normal and shell modes

### Rotating Tips (`home_bottom` slot)

8 tips cycling every 8 seconds via `setInterval`. Replaces OpenCode's built-in tips (deactivates `internal:home-tips` on load, restores on dispose). Tips include:

- `/doctor to check vault health`
- `mention an accomplishment and I'll offer to capture it`
- `I can create meeting notes from any conversation`
- `ask me about your vault stats`
- `I can search your vault for anything`
- `I organize using the PARA method`
- `I'll remind you if your bragfile gets stale`
- `@ a vault file to add it as context`

### Vault Stats Sidebar (`sidebar_content` slot)

Reads vault config and displays:

- Vault name with brain emoji, vault path
- Brag count + staleness indicator (green ≤7d, yellow ≤14d, red >14d or never)
- Contact count

Falls back to "No vault configured" if global config or vault config is missing. All data reads are wrapped in try/catch for graceful degradation.

### Color Theme

A rose/pink theme loaded from `opencode/brainkit.json`. Installed via `api.theme.install()` and set as active via `api.theme.set("brainkit")` on plugin load.

## Event Hooks

### System Prompt Injection (`experimental.chat.system.transform`)

Every turn, the server plugin:

1. Reads global config (`~/.config/brainkit/config.toml`) for `vault_path`
2. Reads vault config (`brainkit.toml`) from the vault
3. Calls `buildSystemPrompt()` from `@oribish/brainkit-core`
4. Deduplicates (skips if prompt already present in the system array)
5. Appends the prompt to `output.system`

Fails silently if vault is missing or unconfigured.

### Compaction Hook (`experimental.session.compacting`)

When OpenCode compacts context to manage token limits, this hook injects a condensed vault identity so the agent doesn't lose awareness of the vault:

```
## Brainkit Vault Context (Condensed)
- User: Alice (Staff Engineer)
- Vault: /Users/alice/second-brain
- Features: bragfile, contacts
- Tone: direct
- Scope: professional
```

Without this, the agent would forget the vault exists after compaction strips the full system prompt context.

### Auto-Brag Detection (`session.idle`)

Scans user messages in the session for accomplishment language:

- Looks for keywords like "shipped", "launched", "completed", etc.
- Requires proximity to "you"/"your" within a ~50-character window
- Guards against "I implemented" false positives (these are the agent talking about itself)
- Once per session — tracks suggested session IDs in a `Set<string>`
- Shows a toast notification: "Sounds like an accomplishment! Consider adding it to your bragfile."

### Auto-Commit (`session.idle`)

After each idle event, schedules a debounced git commit:

1. Reads global config for `vault_path`
2. Calls `scheduleAutoCommit(vaultPath)` which uses a 30-second debounce timer
3. If another idle event fires within the window, the timer resets
4. On commit: `git add -A` + `git commit -m "brainkit: auto-save YYYY-MM-DD"`
5. Skips silently if the vault isn't a git repo or has no changes

## System Prompt Builder

The system prompt is built dynamically in TypeScript (`core/prompt-sections.ts`). Each section is a pure function that takes a `SectionContext` (config, vault path, mode, cwd) and returns a string or null. Sections are joined with double newlines and conditionally included based on vault config.

### Sections

1. **Preamble** — What brainkit is: "a personal second brain — a structured markdown vault organized with the PARA method"
2. **Identity** — User name, role, expertise, scope (professional/personal/both), work context, personal context, custom context
3. **Vault structure** — PARA method description with directory purposes
4. **Key files** — Conditional on enabled features:
   - Bragfile: format (`- **YYYY-MM-DD**: description`), location, organization (H1/H2 by half-year and month)
   - Contacts: format (H2 headings for names, bold field labels), location
5. **Conventions** — Naming (lowercase-hyphen), formatting (bold for key names/decisions/action items), tone (from config), first person
6. **Custom rules** — User-defined rules from `brainkit.toml`
7. **Behavioral rules** — "Use your built-in file editing tools", search before answering, preserve structure, cite sources, never delete (archive instead)
8. **Project context** — Smart cwd detection: if cwd basename matches a directory in `01_projects/`, injects the project name and README path
9. **Bragfile staleness reminder** — If bragfile hasn't been updated in 14+ days, adds a gentle reminder ("gently suggest capturing it, don't be pushy, mention once")
10. **Fresh vault onboarding** — If vault is fresh (just set up, no content), triggers onboarding guidance
11. **Profile nudge** — If profile fields are incomplete (expertise, work context, personal context), suggests filling them in naturally when relevant

### GitHub Repo Privacy Check

The `/doctor` command (via the maintenance skill and `runHealthChecks()` in core) checks if the vault's GitHub repo is private. Uses `git` to detect the remote and `gh` CLI to check visibility. If the repo is public, reports an error with the fix command: `gh repo edit owner/repo --visibility private`. Skips silently if not a git repo, no GitHub remote, or `gh` CLI not available.
