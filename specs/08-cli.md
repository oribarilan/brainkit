# CLI

## Overview

The brainkit CLI (`npx @2brain/brainkit` or `brainkit`) is a thin launcher that spawns OpenCode with the brainkit plugin loaded. It handles harness detection, config generation, and argument forwarding — nothing more.

All vault operations, onboarding, skill loading, and system prompt injection happen inside the harness via the plugin. The CLI's only job is to get the user into the right harness with brainkit configured.

## Usage

```bash
brainkit                     # Auto-detect harness on $PATH, launch it
brainkit oc [args...]        # Launch with OpenCode (explicit)
brainkit opencode [args...]  # Same as above
brainkit --version           # Print version
brainkit --help              # Show usage
```

All arguments after the harness alias are forwarded to the harness. For example:

```bash
brainkit oc --model anthropic/claude-sonnet-4-5
```

## What the CLI does

### 1. Harness detection

The CLI maintains a registry of supported harnesses (currently only OpenCode). On bare `brainkit`:

- Scan `$PATH` for known harness binaries via `which`
- If exactly one is found, launch it
- If multiple are found, list them and exit so the user can pick explicitly
- If none are found, print an install link and exit

### 2. Config generation

Before launching OpenCode, the CLI ensures config files exist at `~/.config/brainkit/`:

- `opencode.json` — registers `@2brain/brainkit` as a plugin
- `tui.json` — registers the TUI plugin

These are created only if they don't already exist (no overwrite on re-run).

### 3. Environment setup and launch

The CLI sets two environment variables and spawns the harness:

- `OPENCODE_CONFIG` → `~/.config/brainkit/opencode.json`
- `OPENCODE_TUI_CONFIG` → `~/.config/brainkit/tui.json`

OpenCode merges these with the user's existing configuration. The CLI then spawns `opencode` with `stdio: "inherit"` and forwards the exit code.

## Harness registry

The registry is an array of `Harness` objects in `cli/launch.ts`:

```typescript
interface Harness {
  name: string;
  binaries: string[]; // Binaries to check on $PATH
  aliases: string[]; // CLI subcommand aliases
  launch: (args: string[]) => void;
}
```

Currently, only OpenCode is registered:

```typescript
const HARNESSES: Harness[] = [
  {
    name: "OpenCode",
    binaries: ["opencode"],
    aliases: ["oc", "opencode"],
    launch: launchOpenCode,
  },
];
```

Adding a new harness means adding an entry to this array and implementing its `launch` function. Each harness handles its own config generation and environment setup.

## Package structure

```
cli/
  index.ts          # Entry point — parse args, dispatch to launch
  launch.ts         # Harness registry, detection, config, spawn
  version.ts        # Exported version string
  tsconfig.json     # Build config for tsc
  __tests__/        # Unit tests
```

The CLI imports nothing from `opencode/` (which depends on bun-only packages). It uses only Node.js builtins (`node:fs`, `node:path`, `node:os`, `node:child_process`).

## Build and distribution

The CLI is compiled to ESM JavaScript via `tsc` and published with a `bin` field:

```json
{
  "bin": {
    "brainkit": "./dist/cli/index.js"
  }
}
```

The compiled `dist/cli/index.js` starts with `#!/usr/bin/env node`. When users run `npx @2brain/brainkit`, npm downloads the package and executes it. No additional runtime dependencies (tsx, jiti, esbuild) are needed.

Build command:

```bash
just build-cli    # tsc --project cli/tsconfig.json → dist/
```

`dist/` is gitignored as a build artifact.

## Error handling

- **Harness not found**: Print error with install link, exit 1
- **Unknown harness alias**: Print error, exit 1
- **SIGINT**: Clean exit (code 0)
- **Harness exit code**: Forwarded as the CLI's exit code

## Why not a separate package?

The CLI, plugin, and skills all live in `@2brain/brainkit`. One package with two entry points (CLI launcher + OpenCode plugin) keeps everything in sync — the CLI launches the same version of the plugin that ships alongside it.

Core vault logic lives in `@2brain/brainkit-core` (a separate workspace package), but the CLI doesn't import from it. The CLI is purely a launcher.

## Future: multi-harness support

The harness registry is designed to support additional coding agents (Copilot CLI, Claude Code, Codex, etc.). Each would get:

- A registry entry with its binary names and CLI aliases
- A `launch` function that generates appropriate config and spawns the harness
- Harness-specific config at `~/.config/brainkit/`

This will be designed separately for each harness as support is added.
