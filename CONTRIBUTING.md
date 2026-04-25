# Contributing

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Run `just` to see all available commands

## Development

```bash
just dev        # start opencode with the local brainkit plugin
just test       # run tests
just test-watch # run tests in watch mode
just lint       # eslint + typecheck
just format     # format with prettier
just check      # lint + format check + test (run before committing)
```

## Pull requests

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run `just check` — all checks must pass
4. Open a PR against `main` with a clear description of what and why
5. Keep PRs focused — one feature or fix per PR

### PR checklist

- [ ] `just check` passes (lint + format + tests)
- [ ] New features have tests
- [ ] Skills are updated if behavior changes
- [ ] CHANGELOG.md is updated with a new entry under `## [Unreleased]`
- [ ] No new dependencies added without discussion (see below)

## Adding dependencies

Runtime dependencies require explicit approval — open an issue first explaining why the dependency is needed and what alternatives were considered. Prefer Node.js built-ins (`node:fs`, `node:path`, `node:os`) over npm packages.

Dev dependencies (testing, linting, formatting) have a lower bar but should still be discussed for anything beyond the existing toolchain.

Current runtime dependencies: `smol-toml`. That's it.

## Deploy flow

### npm (`npx @oribish/brainkit`)

Two packages are published to npm from this repo:

1. `@oribish/brainkit-core` — shared vault logic, system prompt, types
2. `@oribish/brainkit` — CLI + OpenCode plugin + skills

Publishing order: core first, then brainkit. This is currently manual (not in CI/CD).

1. Run all checks: `just check`
2. Build the CLI: `just build-cli`
3. Bump `version` in both `package.json` files and update `CHANGELOG.md`
4. Publish core: `npm publish --access=public` from `core/`
5. Publish brainkit: `npm publish --access=public` from root
6. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

The CLI compiles `cli/` and shared modules from `core/` to `dist/` via `tsc`. The `dist/` directory is gitignored but included in the npm package via the `files` field in `package.json`.

## Project structure

```
core/               # TypeScript — shared logic (@oribish/brainkit-core)
opencode/           # TypeScript/TSX — OpenCode plugin (server + TUI)
cli/                # TypeScript — CLI entry point
skills/             # Markdown — domain knowledge for the agent
specs/              # Design documents — read before architectural changes
docs/               # Feature documentation
```

See `AGENTS.md` for detailed structure and coding principles.

## Conventions

- TypeScript, strict mode, ESM imports
- `.js` extension for local imports in `core/` and `cli/` (Node/jiti resolution)
- `.ts`/`.tsx` extensions for imports in `opencode/` (bun resolution)
- `import type` for type-only imports
- `camelCase` for functions/variables, `PascalCase` for types, `UPPER_SNAKE` for constants
- No `any` unless truly unavoidable
- Read `specs/` before making architectural decisions
