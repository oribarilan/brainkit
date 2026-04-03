# AGENTS.md

## Project Overview

Brainkit is a [pi](https://github.com/badlogic/pi-mono) coding agent extension that provides a persistent second brain. It's a structured markdown vault organized with the PARA method, with typed tools for deterministic operations and skills that teach the agent domain knowledge.

Design specs live in `specs/`. Read them before making architectural decisions.

### Structure

```
extensions/         # TypeScript — tools, commands, UI, hooks
  index.ts          # Entry point, wires modules together
  vault.ts          # Vault discovery, config, file operations
  tools.ts          # Typed LLM tools (brain_*)
  ui.ts             # Header, status bar, rotating hints
  hooks.ts          # System prompt injection, auto-brag detection
  system-prompt.ts  # Dynamic system prompt builder
  updater.ts        # Version checking, changelog display
skills/             # Markdown — domain knowledge for the agent
  brainkit/         # Root skill (conventions, setup flow, tools overview)
  para/             # PARA method
  bragfile/         # Bragfile feature
  contacts/         # Contacts feature
  meeting-notes/    # Meeting notes feature
  maintenance/      # Vault health and maintenance
specs/              # Design documents (vision, architecture, decisions)
```

### Development Commands

All actions use [just](https://just.systems/). Run `just` to list all available recipes.

```bash
just            # list all recipes
just dev        # start pi with the latest local extension
just test       # run tests
just test-watch # run tests in watch mode
just lint       # eslint + typecheck
just format     # format with prettier
just check      # lint + format check + test (run before committing)
```

### Running

This is a pi extension, not a standalone app:

```bash
just dev        # recommended — runs pi -e .
```

### Testing

```bash
just test       # run once
just test-watch # watch mode
```

Tests live alongside source in `extensions/__tests__/`. Each test file maps to a module.

---

## Core Principles

### Plan Before You Code

- Read relevant specs in `specs/` before touching architecture
- Break complex tasks into smaller steps
- If requirements are unclear, ask first

### Ask, Don't Assume

- When multiple approaches exist, present options with trade-offs
- Don't guess at user preferences or business logic
- Clarify scope before making architectural decisions

### Single Responsibility

- Each function does one thing
- Each module has one concern (`vault.ts` = vault ops, `tools.ts` = tool registration, etc.)
- If a file is doing two things, split it

### DRY (Don't Repeat Yourself)

- Extract shared logic into reusable functions
- But don't over-abstract — wait for the pattern to appear three times before extracting
- If duplicating code intentionally, explain why

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
- Never expose vault content outside the extension context
- When in doubt, choose the more secure option

### Minimal Dependencies

- Avoid adding dependencies unless they make things genuinely simpler
- Prefer Node.js built-ins (`node:fs`, `node:path`, `node:os`) over npm packages
- Before adding a dependency, check if the functionality exists in the stdlib or current deps
- **Adding a new dependency requires explicit user approval**
- Current dependencies: `smol-toml` (TOML parsing). That's it.

---

## Code Style

- TypeScript, strict mode
- ESM imports (`.js` extension for local imports — pi uses jiti)
- `import type` for type-only imports
- No `any` unless truly unavoidable
- Naming: `camelCase` for functions/variables, `PascalCase` for types/interfaces, `UPPER_SNAKE` for constants

---

## Pi Extension API

Pi packages (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-ai`, `@sinclair/typebox`) are peer dependencies provided by the pi runtime. Do not install or bundle them.

### Key patterns

- Tools: `pi.registerTool({ name, label, description, parameters, execute, renderCall, renderResult })`
- Commands: `pi.registerCommand("name", { description, handler })`
- Events: `pi.on("event_name", async (event, ctx) => { ... })`
- Status bar: `ctx.ui.setStatus("id", themedString)`
- Themes: `theme.fg("color", text)`, `theme.bold(text)`
- Tool results: `{ content: [{ type: "text", text: "..." }], details: {} }`

### Architecture rule

Commands are thin wrappers that trigger the agent via `pi.sendUserMessage()`. All logic lives in tools and skills. See `specs/07-decisions.md` decision #18.
