# Contributing

## Setup

1. Clone the repo
2. Install dependencies: `npm install`
3. Symlink for local development: `pi install /path/to/brainkit`
4. Run `just` to see all available commands

## Development

```bash
just dev        # start pi with the latest local extension
just test       # run tests
just lint       # eslint + typecheck
just format     # format with prettier
just check      # lint + format check + test (run before committing)
```

## Pull Requests

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run `just check` — all checks must pass
4. Open a PR against `main` with a clear description of what and why
5. Keep PRs focused — one feature or fix per PR

### PR checklist

- [ ] `just check` passes (lint + format + tests)
- [ ] New tools/commands have tests
- [ ] Skills are updated if behavior changes
- [ ] CHANGELOG.md is updated with a new entry under `## [Unreleased]`
- [ ] No new dependencies added without discussion (see below)

## Adding Dependencies

Runtime dependencies require explicit approval — open an issue first explaining why the dependency is needed and what alternatives were considered. Prefer Node.js built-ins (`node:fs`, `node:path`, `node:os`) over npm packages.

Dev dependencies (testing, linting, formatting) have a lower bar but should still be discussed for anything beyond the existing toolchain.

Current runtime dependencies: `smol-toml`. That's it.

## Deploy Flow

### Pi extension (primary)

There is no build step. Brainkit is distributed as source via git — pi loads TypeScript directly using jiti.

1. Changes merged to `main` are immediately available to users who run `pi update`
2. For versioned releases, bump `version` in `package.json`, update `CHANGELOG.md`, and tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. Users on `pi install git:github.com/oribarilan/brainkit` (no ref) track `main`
4. Users on `pi install git:github.com/oribarilan/brainkit@v0.2.0` are pinned

### CLI (`npx @oribish/brainkit`)

The CLI is published to npm as `@oribish/brainkit`. This is currently a manual process (not in CI/CD).

1. Run all checks: `just check`
2. Build the CLI: `just build-cli`
3. Bump `version` in `package.json` and update `CHANGELOG.md`
4. Publish to npm:
   ```bash
   npm publish --access=public
   ```
5. Tag and push as described above

The CLI compiles `cli/` and shared modules from `extensions/` to `dist/` via `tsc`. The `dist/` directory is gitignored but included in the npm package via the `files` field in `package.json`.

## Project Structure

```
extensions/         # TypeScript — tools, commands, UI, hooks
skills/             # Markdown — domain knowledge for the agent
specs/              # Design documents — read before architectural changes
```

See `AGENTS.md` for detailed structure and coding principles.

## Conventions

- TypeScript, strict mode, ESM imports with `.js` extension
- `import type` for type-only imports
- `camelCase` for functions/variables, `PascalCase` for types, `UPPER_SNAKE` for constants
- No `any` unless truly unavoidable
- Commands are thin wrappers — logic lives in tools and skills
- Read `specs/` before making architectural decisions
