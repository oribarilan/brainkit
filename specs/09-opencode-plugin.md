# Brainkit OpenCode Plugin

## Overview

Brainkit is an OpenCode plugin that gives you a persistent, structured second brain. It's a markdown vault organized with the PARA method, with skills that teach the agent domain knowledge and a TUI that keeps you connected to your vault.

## Architecture

OpenCode plugins have two entry points:

- **Server plugin** (`./server`): Hooks into the AI pipeline — system prompt injection, event handling
- **TUI plugin** (`./tui`): Hooks into the terminal UI — custom home screen, sidebar, themes, commands

Both are exported from `package.json` via the `exports` field. OpenCode loads `.ts`/`.tsx` files directly via bun — no build step needed for the plugin itself.

### Two-Package Structure

| Package                 | Contents                                                                      | Depends on              |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| `@2brain/brainkit-core` | Vault operations, system prompt builder, brag detection helpers, config types | `smol-toml`             |
| `@2brain/brainkit`      | CLI (launcher) + OpenCode plugin + skills                                     | `@2brain/brainkit-core` |

The `package.json` exports OpenCode entry points:

```json
{
  "exports": {
    "./server": { "import": "./opencode/server.ts" },
    "./tui": { "import": "./opencode/tui.tsx" }
  }
}
```

OpenCode plugin config references the package:

```json
{ "plugin": ["@2brain/brainkit"] }
```

### What lives in `brainkit-core`

Extracted from `extensions/`:

- `vault.ts` — vault discovery, config, file operations, brag stats, health checks
- `system-prompt.ts` — dynamic system prompt builder
- `containsUserAccomplishment()` from `hooks.ts` — pure string function
- Shared types (`BrainkitConfig`, etc.)

### Known tech debt

`vault.ts` uses synchronous fs (`readFileSync`, `readdirSync`, etc.). This will block the TUI event loop when computing sidebar stats. Acceptable for v1 since OpenCode uses bun (better sync IO handling), but async variants should be added later.

## Features (v1)

See [`docs/features.md`](../docs/features.md) for the canonical feature spec. Below is OpenCode-specific implementation detail.

### 1. Brain ASCII Art (TUI — `home_logo` slot)

Replace the default OpenCode logo with the brainkit rose ASCII art. Three size variants for different terminal sizes (like vault-tec does with its Vault Boy art):

- Small (5 lines): compact brain outline
- Medium (~15 lines): detailed brain
- Large (~30 lines): full brain with tagline

### 2. Sidebar with Vault Stats (TUI — `sidebar_content` slot)

Toggle-able sidebar panel showing:

- **Vault name** and path (from global config)
- **Bragfile status**: "Last brag: X days ago" with color coding (green ≤7d, yellow ≤14d, red >14d)
- **Entry counts**: total brags, contacts, projects
- **Fresh vault indicator**: if vault is new, show onboarding prompt
- **Session cost**: context/output token bars (adapted from vault-tec's PipBoy)

### 3. System Prompt Injection (Server — `experimental.chat.system.transform`)

Port `buildSystemPrompt()` to inject vault context. The agent uses its built-in file editing tools, guided by skills and system prompt.

### 4. Brainkit Tips (TUI — `home_bottom` slot)

Rotating tips styled for opencode:

- "Type @ then a vault file to add context"
- "Mention an accomplishment and I'll offer to capture it"
- "Ask me about your vault stats"
- etc.

### 5. Custom Theme (TUI — theme file)

A `brainkit.json` theme with rose/pink accent colors:

- Primary: rose/pink (#E8A0BF or similar)
- Text: warm white
- Muted: soft gray-pink
- Background: dark (default terminal)
- Applied automatically on plugin load (toggle-able)

### 6. Compaction Hook (Server — `experimental.session.compacting`)

Inject a **condensed** vault identity during compaction — not the full system prompt, but enough for the agent to retain awareness:

- User name, role, expertise
- Vault path and enabled features
- Current project context (if detected)
- Key conventions (file naming, tone, first person)

This prevents the agent from "forgetting" it has access to a vault after context compaction.

### 7. Brag Detection + Toast (Server — `session.idle` event)

Listen for session idle, scan last assistant message for accomplishment keywords (reuse `containsUserAccomplishment` from core), show a toast notification via the SDK client.

### 8. Auto-Commit (Server — `session.idle` event)

Debounced git commit of vault changes after each agent turn. Uses `child_process.execFile` to run `git` commands (the server plugin runs in the same Node/bun process with full filesystem access). On session end, flush immediately. Skips silently if not a git repo or no changes.

### Error Handling

The plugin degrades gracefully when the vault is unavailable:

- **No vault configured**: skip system prompt injection, hide sidebar stats, show setup tip
- **Vault path invalid**: log warning, skip vault-dependent features
- **Config parse error**: log warning, use defaults
- **bragfile missing**: show "no bragfile" in sidebar instead of crashing

## File Structure

```
core/
  package.json          # @2brain/brainkit-core
  index.ts              # re-exports
  vault.ts              # extracted from extensions/vault.ts
  system-prompt.ts      # extracted from extensions/system-prompt.ts
  types.ts              # shared types (BrainkitConfig, etc.)

opencode/
  tsconfig.json         # jsx: preserve, for type-checking only (bun handles transform)
  server.ts             # system prompt injection, compaction hook, brag detection
  tui.tsx               # home logo, sidebar, tips, theme, commands
  side.tsx              # sidebar component (vault stats)
  tips.tsx              # rotating tips component
  brainkit.json         # custom color theme

cli/
  index.ts              # CLI entry point — launcher routing
  launch.ts             # Harness detection, config setup, spawn opencode

skills/
  brainkit/             # root skill (conventions, setup, overview)
  para/                 # PARA method
  bragfile/             # bragfile feature
  contacts/             # contacts feature
  meeting-notes/        # meeting notes feature
  maintenance/          # vault health
  onboarding/           # first-run guidance
```

## Configuration

Plugin options via `opencode.json`:

### Server

- `enabled` (boolean, default `true`)
- `mode` (`"append" | "replace"`, default `"append"`)

### TUI

- `enabled` (boolean, default `true`)
- `set_theme` (boolean, default `true`)
- `sidebar` (boolean, default `true`)
- `tips` (boolean, default `true`)

## Dependencies

### `@2brain/brainkit-core`

- Runtime: `smol-toml`
- No peer dependencies

### `@2brain/brainkit`

- Runtime: `@2brain/brainkit-core`
- Peer (optional): `@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js`

## CLI — `brainkit`

The `brainkit` CLI is a thin launcher that sets up and spawns OpenCode with the brainkit plugin loaded. It has no subcommands — vault setup, health checks, and all other operations happen inside the harness, guided by the plugin's system prompt and skills.

### Harness Detection

On launch, brainkit checks if `opencode` exists on `$PATH` (via `which`).

Future harnesses (Copilot, etc.) can be added to the detection table:

| Harness  | Binary check | Aliases          |
| -------- | ------------ | ---------------- |
| OpenCode | `opencode`   | `oc`, `opencode` |

### Usage

```bash
# Auto-detect — finds opencode, launches it
brainkit

# Explicit harness selection
brainkit oc              # launch with opencode
brainkit opencode        # same

# All opencode flags pass through
brainkit oc run "add a brag entry"
brainkit oc --model anthropic/claude-sonnet-4-5
```

### How launch works

1. Ensure `~/.config/brainkit/opencode.json` and `tui.json` are up to date — regenerate via `writeIfChanged` so unchanged content keeps its mtime.
2. Set the spawned-env vars: `OPENCODE_CONFIG`, `OPENCODE_TUI_CONFIG`, `OPENCODE_CONFIG_DIR=~/.config/brainkit/`, `OPENCODE_DISABLE_PROJECT_CONFIG=true`.
3. Spawn `opencode` with remaining args forwarded.

`OPENCODE_CONFIG_DIR` and `OPENCODE_DISABLE_PROJECT_CONFIG` give brainkit selective isolation: the user's dotfiles-managed `.opencode/` directory and any vault-parent `.opencode/` configs are blocked, while the user's `~/.config/opencode/{config,opencode}.json{,c}` (auth, MCP, LSP, model defaults, instructions) still merges in. Brainkit's values win on conflict because OpenCode loads `OPENCODE_CONFIG` after the user's global config (verified empirically against opencode v1.x source).

The brainkit-isolated config files are 100% brainkit-owned. They contain only the fields brainkit needs; per-user customization belongs in `~/.config/opencode/`. Unknown keys in brainkit's files are stripped by OpenCode's schema validation, so don't stash brainkit-private state there — use a sibling file under `~/.config/brainkit/` instead.

The plugin **must not** call `api.theme.set` or any other API that mutates OpenCode's persisted KV state. Brainkit currently does not install a custom theme — `api.theme.install` for global plugins writes to `<XDG_CONFIG_HOME>/opencode/themes/`, which `OPENCODE_CONFIG_DIR` cannot redirect, so it leaks into the user's global OpenCode config dir. The brainkit theme JSON (`opencode/brainkit.json`) and path resolver (`opencode/theme-path.ts`) are kept dormant in the repo for future use, behind a sandboxed install path.

### Config files created

`~/.config/brainkit/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@2brain/brainkit"]
}
```

(During onboarding, an extra top-level `"permission": "allow"` is included; it's dropped on regular vault launches.)

`~/.config/brainkit/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@2brain/brainkit"]
}
```

### Skill Distribution

Skills ship as markdown files in the npm package under `skills/`. The server plugin injects relevant skill knowledge via the system prompt. OpenCode users can also reference skills via the `instructions` config.

## Publishing

Two npm packages from this repo (npm workspaces):

1. **`@2brain/brainkit-core`** — shared vault logic, system prompt, types
2. **`@2brain/brainkit`** — CLI + OpenCode plugin + skills
   - `bin.brainkit` — launcher
   - `./server` — OpenCode server plugin export
   - `./tui` — OpenCode TUI plugin export

Root `package.json` uses `"workspaces": ["core"]`. Publishing order: core → brainkit.

## Dev Workflow

```bash
# From repo root
just oc         # launch OpenCode against the dev brainkit (full pipeline)
just cp         # launch Copilot CLI against the dev brainkit
just cc         # launch Claude Code against the dev brainkit
just check      # lint + format + test all packages
```

### How `just oc` loads the dev plugin

OpenCode resolves npm-style plugin specs (`plugin: ["@2brain/brainkit"]` in `opencode.json`) by calling `Npm.add(pkg)`, which auto-installs the package into `<XDG_CACHE_HOME>/opencode/packages/<pkg>/` if the path doesn't already exist. To make OpenCode load the local checkout instead of the published version:

1. `just dev-install` packs the current branch (`npm pack`, full `prepack` — tsc + shim generator) and installs the tarball into `.dev/install/`.
2. `just oc` redirects `XDG_CACHE_HOME` to `.dev/xdg/cache/`, then symlinks `.dev/install/node_modules` into the spot OpenCode's `Npm.add` cache check looks first. The cache hit short-circuits the npm install, and bun's `import.meta.resolve` walks up through the symlink to find brainkit's runtime deps (`smol-toml`, etc.).
3. `BRAINKIT_CONFIG_DIR=.dev/user-config/` keeps brainkit's own config isolated from your real `~/.config/brainkit/`.

Auth/MCP/model defaults still come from your real `~/.config/opencode/` — only `XDG_CACHE_HOME` is redirected, not `XDG_CONFIG_HOME`.

For Copilot CLI and Claude Code, no plugin-cache trickery is needed — both load brainkit by copying files from `findPackageRoot()`, which walks up from the dev CLI binary at `.dev/install/node_modules/@2brain/brainkit/dist/cli/index.js`.
