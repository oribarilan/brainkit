# AGENTS.md

## Project Overview

Brainkit is an OpenCode plugin that provides a persistent second brain. It's a structured markdown vault organized with the PARA method, with skills that teach the agent domain knowledge and a TUI that keeps you connected to your vault.

Design specs live in `specs/`. Feature definitions live in `docs/features.md`. Read them before making architectural decisions.

### Dev-Side vs Client-Side

This repo contains two kinds of agentic files — it's important to know which is which:

- **Dev-side**: Files that guide AI agents working on brainkit's own codebase. These shape how _you_ (the agent helping the developer) behave when contributing to this repo.
  - `AGENTS.md` (this file)
  - `.opencode/` (dev OpenCode config)

- **Client-side**: Files that brainkit delivers to its users at runtime. These shape how the agent behaves inside a user's OpenCode session when brainkit is installed as a plugin.
  - `skills/` (domain knowledge injected into the user's agent)
  - `core/system-prompt.ts` (builds the system prompt for the user's session)
  - `opencode/server.ts` (hooks that inject client-side behavior)

When editing client-side files, you're changing the experience for brainkit's end users, not your own behavior. When editing dev-side files, you're changing how agents work on this repo.

### Structure

```
core/               # TypeScript — shared vault logic
  vault.ts          # Vault discovery, config, file operations, brag stats
  system-prompt.ts  # Dynamic system prompt builder (client-side)
  types.ts          # Shared types (BrainkitConfig, etc.)
opencode/           # TypeScript/TSX — OpenCode plugin
  server.ts         # Server plugin: system prompt injection, hooks (client-side)
  tui.tsx           # TUI plugin: home logo, sidebar, tips, theme
  side.tsx          # Sidebar component (vault stats)
  tips.tsx          # Rotating tips component
  brainkit.json     # Custom color theme
cli/                # TypeScript — CLI entry point for npx @2brain/brainkit
  index.ts          # Entry point, routes to harness launcher
  launch.ts         # Harness detection, config setup, spawn opencode
skills/             # Markdown — client-side domain knowledge for the user's agent
  brainkit/         # Root skill (conventions, setup flow, overview)
  para/             # PARA method
  bragfile/         # Bragfile feature
  contacts/         # Contacts feature
  meeting-notes/    # Meeting notes feature
  maintenance/      # Vault health and maintenance
  onboarding/       # First-run Q&A guidance
specs/              # Design documents (vision, architecture, decisions)
docs/               # Canonical feature definitions
```

### Development Commands

All actions use [just](https://just.systems/). Run `just` to list all available recipes.

```bash
just            # list all recipes
just dev        # start opencode with the local brainkit plugin
just test       # run tests
just test-watch # run tests in watch mode
just lint       # eslint + typecheck
just format     # format with prettier
just check      # lint + format check + test (run before committing)
just build-cli  # compile CLI to dist/ for npm publishing
```

### Running

This is an OpenCode plugin. For local development:

```bash
just dev        # recommended — runs opencode with local plugin loaded
```

This uses `.opencode/opencode.json` and `.opencode/tui.json` to load the plugin from the repo root.

### CLI (for npm)

```bash
just build-cli    # compile TypeScript to dist/
node dist/cli/index.js --help  # test locally
```

### Testing

```bash
just test       # run once
just test-watch # watch mode
```

Tests live in `__tests__/` directories alongside source. Each test file maps to a module.

---

## Core Principles

### Plan Before You Code

- Read relevant specs in `specs/` and `docs/features.md` before touching architecture
- Break complex tasks into smaller steps
- If requirements are unclear, ask first

### Ask, Don't Assume

- When multiple approaches exist, present options with trade-offs
- Don't guess at user preferences or business logic
- Clarify scope before making architectural decisions

### Single Responsibility & Small Files

- Each function does one thing
- Each module has one concern (`vault.ts` = vault ops, `server.ts` = server plugin, etc.)
- If a file is doing two things, split it
- Keep files under ~500 lines where possible

### DRY (Don't Repeat Yourself)

- Extract shared logic into reusable functions
- But don't over-abstract — wait for the pattern to appear three times before extracting
- If duplicating code intentionally, explain why
- Shared logic between CLI and plugin goes in `core/`

### KISS (Keep It Simple)

- Prefer simple solutions over clever ones
- Avoid premature abstraction
- If a solution feels complex, step back and reconsider
- If deviating from simplicity, explain why to the user

### Testing

- High coverage with isolated unit tests
- Each test validates one atomic behavior
- Test the module's public API, not internal implementation
- Mock external dependencies (filesystem, network)
- Tests should be fast, deterministic, and independent of each other

### Security

- Never store secrets in code, logs, or error messages
- Validate all inputs — tool parameters, file paths, config values
- Path traversal protection on all vault file operations
- Never expose vault content outside the plugin context
- When in doubt, choose the more secure option

### Minimal Dependencies

- Avoid adding dependencies unless they make things genuinely simpler
- Prefer Node.js built-ins (`node:fs`, `node:path`, `node:os`) over npm packages
- Before adding a dependency, check if the functionality exists in the stdlib or current deps
- **Adding a new dependency requires explicit user approval**
- Current runtime dependency: `smol-toml` (TOML parsing). That's it.

---

## Code Style

- TypeScript, strict mode
- ESM imports
- `.js` extension for local imports in `core/` and `cli/` (Node/jiti resolution)
- `.ts`/`.tsx` extensions for imports in `opencode/` (bun resolution)
- `import type` for type-only imports
- No `any` unless truly unavoidable
- Naming: `camelCase` for functions/variables, `PascalCase` for types/interfaces, `UPPER_SNAKE` for constants

---

## Package Architecture

The repo publishes a single npm package: `@2brain/brainkit`.

| Directory   | What it contains                               |
| ----------- | ---------------------------------------------- |
| `core/`     | Vault ops, system prompt, types. No UI deps.   |
| `cli/`      | CLI entry point, compiled to `dist/` for npm   |
| `opencode/` | OpenCode plugin (server + TUI). Ships raw TS.  |
| `skills/`   | Markdown domain knowledge for the user's agent |

Runtime dependency: `smol-toml` (TOML parsing). Optional peer deps on OpenCode packages (`@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js`).

---

## OpenCode Plugin API

OpenCode plugins export a server function and/or TUI function. The package exports these via:

```json
{
  "exports": {
    "./server": { "import": "./opencode/server.ts" },
    "./tui": { "import": "./opencode/tui.tsx" }
  }
}
```

### Server plugin patterns

```typescript
import type { ServerPlugin } from "@opencode-ai/plugin/server"

export default ((api) => {
  // System prompt injection
  api.hook("experimental.chat.system.transform", (system) => {
    return system + "\n" + buildSystemPrompt()
  })

  // Event handling
  api.event("session.idle", async (event) => { ... })

  // Compaction hook
  api.hook("experimental.session.compacting", (summary) => {
    return summary + "\n" + condensedVaultContext()
  })
}) satisfies ServerPlugin
```

### TUI plugin patterns

```tsx
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui"

export default ((api) => {
  // Home screen slots
  api.slot("home_logo", () => <BrainAsciiArt />)
  api.slot("home_bottom", () => <RotatingTips />)
  api.slot("sidebar_content", () => <VaultStats />)

  // Theme
  api.theme.register("brainkit", brainkitTheme)

  // Commands
  api.command({ title: "/doctor", slash: { name: "doctor" }, onSelect() { ... } })
}) satisfies TuiPlugin
```

### Key differences from a standalone app

- OpenCode loads `.ts`/`.tsx` files directly via bun — no build step for the plugin
- The TUI uses solid-js with JSX (`@opentui/solid`)
- `opencode/tsconfig.json` exists for type-checking only (`jsx: preserve`)
- Server plugins have full filesystem/process access (can run git, read files, etc.)
- Reference implementation: `.reference/oc-plugin-vault-tec/` (gitignored, clone from GitHub if needed)

---

## CLI Architecture

The `brainkit` CLI (`cli/index.ts`) is a thin launcher:

1. **Harness aliases** (checked first): `oc`, `opencode` → launch OpenCode with plugin
2. **Auto-detect** (bare `brainkit`): find OpenCode on `$PATH`, launch it

There are no subcommands (no init, update, etc.) — vault setup and all operations happen inside the harness, guided by the plugin's client-side system prompt and skills.

The launcher (`cli/launch.ts`) creates config files at `~/.config/brainkit/` and spawns `opencode` with `OPENCODE_CONFIG` and `OPENCODE_TUI_CONFIG` env vars set. OpenCode merges these with the user's existing config.

---

## Vault Operations

All vault logic lives in `core/`. Key patterns:

- `readGlobalConfig()` — reads `~/.config/brainkit/config.toml` (just `brain_path`)
- `discoverVaults()` — scans brain directory for vault subdirectories
- `readVaultConfig()` — reads `brainkit.toml` from the vault (user info, features)
- `readBragfile()` / `appendBragEntry()` — bragfile operations
- `readContacts()` / `searchContacts()` / `addContact()` — contact operations
- `buildSystemPrompt()` — constructs the system prompt from vault state
- `containsUserAccomplishment()` — detects accomplishment keywords in text
- `runHealthChecks()` — vault doctor diagnostics

All file operations validate paths are within the vault boundary (path traversal protection). Current implementation uses synchronous fs — flagged as tech debt for async migration.
