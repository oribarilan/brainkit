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

Current runtime dependency: `smol-toml`. That's it.

## Releasing

### Semver convention

| Bump                             | When                                                                          | Examples                                           |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| **Patch** (0.1.0 → 0.1.1)        | Bug fixes, doc updates, internal refactors with no behavior change            | Fix path traversal edge case, update skill wording |
| **Minor** (0.1.0 → 0.2.0)        | New features, new skills, non-breaking additions                              | Add meeting notes feature, new TUI widget          |
| **Major** (0.x → 1.0, 1.x → 2.0) | Breaking changes to vault format, config schema, CLI interface, or plugin API | Change brainkit.toml schema, rename CLI flags      |

While at `0.x`, minor bumps may include breaking changes (standard pre-1.0 practice).

### Changelog discipline

Every PR that changes behavior must add an entry under `## [Unreleased]` in `CHANGELOG.md`:

- `Added` — new features
- `Changed` — changes to existing features
- `Fixed` — bug fixes
- `Removed` — removed features
- `Deprecated` — features marked for removal

### Release process (agent-driven)

**Never publish to npm manually.** All publishing happens through GitHub Actions after a release PR is merged to `main`.

When the user asks to prepare a release, the agent:

1. Reviews `[Unreleased]` in `CHANGELOG.md` — confirms there are entries to release
2. Determines bump type from changelog categories:
   - Only `Fixed` entries → patch
   - Any `Added` entries → minor
   - Any `Removed` or breaking `Changed` entries → major (or minor while pre-1.0)
3. Bumps `version` in `package.json` and runs `rm -rf node_modules package-lock.json && npm install` to regenerate `package-lock.json` from scratch (plain `npm install` can leave stale entries that break CI)
4. Runs `just check` to verify everything passes before committing
5. Locks changelog — renames `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, adds fresh `[Unreleased]` placeholder, adds comparison link
6. Creates a `release/vX.Y.Z` branch and opens a PR to `main`

### What CI does automatically

After the release PR is merged to `main`:

1. `check.yml` runs `just check` (lint + format + test + package integrity)
2. `release.yml` detects the version change and:
   - Runs `just check` again (belt and suspenders)
   - Publishes to npm via OIDC trusted publishing (no tokens needed)
   - Creates a GitHub Release with the changelog entries

### Manual setup (one-time)

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) with OIDC — no `NPM_TOKEN` secret required.

1. Go to `@2brain/brainkit` package settings on npmjs.com → Trusted Publisher
2. Select GitHub Actions and configure:
   - Repository owner: `oribarilan`, Repository: `brainkit`, Workflow filename: `release.yml`

## Project structure

```
core/               # TypeScript — shared vault logic
opencode/           # TypeScript/TSX — OpenCode plugin (server + TUI)
cli/                # TypeScript — CLI entry point
skills/             # Markdown — domain knowledge for the agent
specs/              # Design documents — read before architectural changes
docs/               # Feature documentation
```

See `AGENTS.md` for detailed structure and coding principles.

## Conventions

- TypeScript, strict mode, ESM imports
- `.js` extension for local imports in `core/` and `cli/` (Node resolution)
- `.ts`/`.tsx` extensions for imports in `opencode/` (bun resolution)
- `import type` for type-only imports
- `camelCase` for functions/variables, `PascalCase` for types, `UPPER_SNAKE` for constants
- No `any` unless truly unavoidable
- Read `specs/` before making architectural decisions
