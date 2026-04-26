# Distribution & Release Pipeline

## Overview

Automate brainkit's release process: single-package npm distribution with CI/CD publish-on-merge, semantic versioning, and an agent-driven release workflow. The process is documented in CONTRIBUTING.md so any agent or human can follow it.

## Decision Record

- **Approach**: Agent-driven release (Approach A) — the agent handles version bumps and changelog locking, CI handles publishing
- **Publish trigger**: Auto-publish on merge to `main` when `package.json` version differs from npm
- **Package structure**: Single `@2brain/brainkit` package (collapsing the separate `@2brain/brainkit-core`)
- **Versioning**: Standard semver, bump type determined by changelog categories
- **Changelog**: Keep a Changelog format, entries added per PR, locked at release time

## 1. Single-Package Consolidation

### Problem

The repo currently publishes two npm packages: `@2brain/brainkit-core` (vault logic) and `@2brain/brainkit` (CLI + plugin + skills). The separate core package adds complexity (workspace resolution, publish ordering, version sync) with no real external consumer — only brainkit itself uses core.

### Changes

1. **Change all `@2brain/brainkit-core` imports to relative paths.** Extension convention differs by directory (per AGENTS.md): `opencode/` uses `.ts` extensions (bun resolution), `cli/` and `core/` use `.js` extensions (Node/jiti resolution). Source files affected:
   - `opencode/server.ts` → `import { ... } from "../core/index.ts"` (bun, `.ts` extension)
   - `opencode/side.tsx` → `import { ... } from "../core/index.ts"` (bun, `.ts` extension)
   - `cli/launch.ts` → `import { ... } from "../core/index.js"` (Node, `.js` extension)
   - `cli/copilot.ts` → `import { ... } from "../core/index.js"` (Node, `.js` extension)
   - `scripts/copilot-status.js` → relative import to `../core/index.js`
   - `cli/__tests__/vault-selection.test.ts` → update mock path from `@2brain/brainkit-core` to `../../core/index.js`

2. **Move `smol-toml`** from `core/package.json` dependencies to root `package.json`.

3. **Delete `core/package.json`** entirely.

4. **Remove from root `package.json`:**
   - `"workspaces": ["core"]`
   - `"@2brain/brainkit-core": "workspace:*"` from dependencies

5. **Add `"core/"` to the root `files` array** so core TypeScript ships with the package.

6. **Update `cli/tsconfig.json`** `include` to `["./**/*.ts", "../core/*.ts"]` so tsc compiles core source alongside CLI (top-level only — excludes `core/__tests__/` from compilation output).

7. **Delete `core/tsconfig.json`** — it's identical to the root tsconfig which already includes `core/**/*.ts`. Remove the `npx tsc --project core/tsconfig.json --noEmit` line from the `just lint` recipe.

8. **Move `@types/node`** from `core/package.json` devDependencies to root `package.json` devDependencies (currently only in core, lost when core/package.json is deleted).

9. **Update `package-lock.json`** by running `npm install` after the above changes.

10. **Update documentation** (`AGENTS.md`, `CONTRIBUTING.md`, specs) to reflect single-package architecture.

11. **Update CHANGELOG.md** to note the consolidation under `[Unreleased]`.

## 2. Semantic Versioning

Standard semver rules, documented in CONTRIBUTING.md:

| Bump                             | When                                                                          | Examples                                           |
| -------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| **Patch** (0.1.0 → 0.1.1)        | Bug fixes, doc updates, internal refactors with no behavior change            | Fix path traversal edge case, update skill wording |
| **Minor** (0.1.0 → 0.2.0)        | New features, new skills, non-breaking additions                              | Add meeting notes feature, new TUI widget          |
| **Major** (0.x → 1.0, 1.x → 2.0) | Breaking changes to vault format, config schema, CLI interface, or plugin API | Change brainkit.toml schema, rename CLI flags      |

While at `0.x`, minor bumps may include breaking changes (standard pre-1.0 semver practice).

The agent determines bump type by reading the `[Unreleased]` changelog categories:

- Only `Fixed` → patch
- Any `Added` → minor
- Any `Removed` or breaking `Changed` → major (or minor while pre-1.0)

## 3. CHANGELOG Workflow

Keeps the existing Keep a Changelog format (`CHANGELOG.md`).

### During development (every PR)

Each PR that changes behavior adds an entry under `## [Unreleased]` in the appropriate category:

- `Added` — new features
- `Changed` — changes to existing features
- `Fixed` — bug fixes
- `Removed` — removed features
- `Deprecated` — features marked for removal

This is a contributor responsibility, listed in the PR checklist in CONTRIBUTING.md.

### At release time (agent-driven)

The agent:

1. Replaces `## [Unreleased]` heading with `## [X.Y.Z] - YYYY-MM-DD`
2. Adds a fresh empty `## [Unreleased]` section above it
3. Adds a comparison link at the bottom: `[X.Y.Z]: https://github.com/oribarilan/brainkit/compare/vPREV...vX.Y.Z`
4. Updates the `[Unreleased]` comparison link to point from the new tag to HEAD

## 4. CI/CD Pipeline

### `check.yml` (existing, extended)

- Triggers: push to `main`, PRs to `main`
- Runs: `just check` (which now includes `just test-package`)

### `release.yml` (new)

- Triggers: push to `main` only
- Condition: runs only when `package.json` version differs from the latest published npm version

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: false

permissions:
  contents: write # for GitHub Release creation
  id-token: write # for npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org

      - uses: extractions/setup-just@v2

      - run: npm ci

      - name: Check if release needed
        id: check
        run: |
          LOCAL=$(node -p "require('./package.json').version")
          PUBLISHED=$(npm view @2brain/brainkit version 2>/dev/null || echo "0.0.0")
          if [ "$LOCAL" = "$PUBLISHED" ]; then
            echo "skip=true" >> "$GITHUB_OUTPUT"
          else
            echo "skip=false" >> "$GITHUB_OUTPUT"
            echo "version=$LOCAL" >> "$GITHUB_OUTPUT"
          fi

      - name: Run all checks
        if: steps.check.outputs.skip == 'false'
        run: just check

      - name: Publish to npm
        if: steps.check.outputs.skip == 'false'
        run: npm publish --provenance --access=public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        if: steps.check.outputs.skip == 'false'
        run: |
          VERSION=${{ steps.check.outputs.version }}
          gh release create "v${VERSION}" \
            --title "v${VERSION}" \
            --notes-file <(sed -n "/## \[${VERSION}\]/,/## \[/p" CHANGELOG.md | head -n -1)
        env:
          GH_TOKEN: ${{ github.token }}
```

### Authentication

- **`NPM_TOKEN`**: npm automation token, stored as a GitHub repo secret. Generated at npmjs.com → Access Tokens → Automation.
- **`GITHUB_TOKEN`**: built-in, used for GitHub Release creation. No setup needed.

### Provenance

`npm publish --provenance` links the published package to the exact commit and CI workflow that built it. Requires `id-token: write` permission. Adds a "Published via GitHub Actions" badge on npmjs.com.

## 5. Agent Release Process

Documented in CONTRIBUTING.md. When the user asks to prepare a release:

1. **Review `[Unreleased]`** in `CHANGELOG.md` — confirm there are entries to release
2. **Determine bump type** from changelog categories (see Section 2)
3. **Bump version** in `package.json`
4. **Lock changelog** — rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add fresh placeholder, update comparison links
5. **Create release branch** (`release/vX.Y.Z`) and open a PR to `main`
6. **PR description** includes the changelog entries for review

After merge, CI auto-publishes to npm and creates a GitHub Release.

## 6. Package Integrity Test

A `just test-package` recipe that validates the npm package works before publishing.

### Steps

1. `npm pack` — create the tarball (identical to what `npm publish` would upload)
2. Install the tarball in a temp directory
3. Verify the CLI binary runs: `node node_modules/@2brain/brainkit/dist/cli/index.js --help`
4. Verify key files exist in the installed package: `core/`, `opencode/`, `skills/`, `dist/`
5. Verify package exports resolve (file existence check for `./opencode/server.ts` and `./opencode/tui.tsx`)
6. Clean up temp directory and tarball

### Integration

- Added to `just check` so it runs on every PR
- Also runs in `release.yml` before `npm publish`
- Available standalone as `just test-package`

## 7. Additional Changes

### `engines` field

Add to root `package.json`:

```json
"engines": {
  "node": ">=22"
}
```

### Updated `files` array

```json
"files": [
  "dist/",
  "core/",
  "!core/__tests__/",
  "opencode/",
  "skills/",
  "scripts/"
]
```

### Updated CONTRIBUTING.md

The "Deploy flow" section is rewritten to document:

- The agent-driven release process (Section 5)
- Semver convention (Section 2)
- Changelog discipline (Section 3)
- What CI does automatically (Section 4)

### Updated AGENTS.md

- Remove two-package architecture references
- Update structure section
- Update dependency notes (smol-toml moves to root)

## Files Changed

| File                                    | Change                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `package.json`                          | Remove workspace, add smol-toml, add @types/node (dev), add engines, update files, bump version |
| `core/package.json`                     | **Deleted**                                                                                     |
| `core/tsconfig.json`                    | **Deleted** (redundant with root tsconfig)                                                      |
| `package-lock.json`                     | Regenerated                                                                                     |
| `opencode/server.ts`                    | Import path change                                                                              |
| `opencode/side.tsx`                     | Import path change                                                                              |
| `cli/launch.ts`                         | Import path change                                                                              |
| `cli/copilot.ts`                        | Import path change                                                                              |
| `cli/__tests__/vault-selection.test.ts` | Mock path change                                                                                |
| `scripts/copilot-status.js`             | Import path change                                                                              |
| `cli/tsconfig.json`                     | Include core in compilation                                                                     |
| `.github/workflows/release.yml`         | **New** — publish + GitHub Release                                                              |
| `justfile`                              | Add `test-package` recipe, include in `check`, remove core tsconfig lint step                   |
| `CONTRIBUTING.md`                       | Rewrite deploy flow section                                                                     |
| `AGENTS.md`                             | Update architecture references                                                                  |
| `CHANGELOG.md`                          | Add consolidation entry under Unreleased                                                        |
| Specs referencing two-package arch      | Note as superseded                                                                              |
