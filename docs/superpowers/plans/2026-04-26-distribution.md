# Distribution & Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up automated npm publishing with CI/CD, collapsing the two-package architecture into a single `@oribish/brainkit` package.

**Architecture:** Single npm package published via GitHub Actions on version change. Agent-driven release process documented in CONTRIBUTING.md. Package integrity test validates the artifact before every publish.

**Tech Stack:** GitHub Actions, npm provenance, Keep a Changelog, just

**Spec:** `specs/US-distribution.md`

---

### Task 1: Consolidate to single package (package.json changes)

**Files:**
- Modify: `package.json`
- Delete: `core/package.json`
- Delete: `core/tsconfig.json`
- Regenerate: `package-lock.json`

- [ ] **Step 1: Update root `package.json`**

Remove workspace config, move dependencies from core, add engines:

In `package.json`, make these changes:

1. Remove `"workspaces"` field entirely:
```json
"workspaces": [
  "core"
],
```

2. Replace the `"dependencies"` section — remove `@oribish/brainkit-core`, add `smol-toml`:
```json
"dependencies": {
  "smol-toml": "^1.3.1"
},
```

3. Add `@types/node` to `"devDependencies"`:
```json
"@types/node": "^25.6.0",
```

4. Add `"engines"` field (after `"type": "module"`):
```json
"engines": {
  "node": ">=22"
},
```

5. Update `"files"` array:
```json
"files": [
  "dist/",
  "core/",
  "!core/__tests__/",
  "opencode/",
  "skills/",
  "scripts/"
],
```

- [ ] **Step 2: Delete `core/package.json`**

```bash
rm core/package.json
```

- [ ] **Step 3: Delete `core/tsconfig.json`**

```bash
rm core/tsconfig.json
```

- [ ] **Step 4: Update `cli/tsconfig.json` to compile core**

In `cli/tsconfig.json`, change the `include` from:
```json
"include": ["./**/*.ts"],
```
to:
```json
"include": ["./**/*.ts", "../core/*.ts"],
```

This compiles core source files alongside CLI (top-level only, excludes `core/__tests__/`).

- [ ] **Step 5: Regenerate `package-lock.json`**

```bash
npm install
```

Expected: clean install with no workspace symlinks. The `node_modules/@oribish/brainkit-core` symlink should no longer exist.

- [ ] **Step 6: Run type-check to verify**

```bash
npx tsc --noEmit
```

Expected: no errors. The root tsconfig still covers `core/**/*.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json cli/tsconfig.json
git add -u core/package.json core/tsconfig.json
git commit -m "refactor: collapse to single @oribish/brainkit package"
```

---

### Task 2: Update all import paths

**Files:**
- Modify: `opencode/server.ts:5-12`
- Modify: `opencode/side.tsx:6-11`
- Modify: `cli/launch.ts:6`
- Modify: `cli/copilot.ts:5`
- Modify: `scripts/copilot-status.js:6-12`
- Modify: `cli/__tests__/vault-selection.test.ts:8-16`

- [ ] **Step 1: Update `opencode/server.ts`**

Change the import (bun resolution — use `.ts` extension):

```typescript
// OLD:
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "@oribish/brainkit-core";

// NEW:
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "../core/index.ts";
```

- [ ] **Step 2: Update `opencode/side.tsx`**

Change the import (bun resolution — use `.ts` extension):

```typescript
// OLD:
import {
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "@oribish/brainkit-core";

// NEW:
import {
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "../core/index.ts";
```

- [ ] **Step 3: Update `cli/launch.ts`**

Change the import (Node resolution — use `.js` extension):

```typescript
// OLD:
import { readGlobalConfig, discoverVaults } from "@oribish/brainkit-core";

// NEW:
import { readGlobalConfig, discoverVaults } from "../core/index.js";
```

- [ ] **Step 4: Update `cli/copilot.ts`**

Change the import (Node resolution — use `.js` extension):

```typescript
// OLD:
import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt } from "@oribish/brainkit-core";

// NEW:
import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt } from "../core/index.js";
```

- [ ] **Step 5: Update `scripts/copilot-status.js`**

Change the import (Node resolution — use `.js` extension):

```javascript
// OLD:
import {
  readGlobalConfig,
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "@oribish/brainkit-core";

// NEW:
import {
  readGlobalConfig,
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "../core/index.js";
```

- [ ] **Step 6: Update `cli/__tests__/vault-selection.test.ts`**

Change both the mock path and the import (vitest resolves mocks relative to the test file):

```typescript
// OLD:
vi.mock("@oribish/brainkit-core", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
}));

import { readGlobalConfig, discoverVaults } from "@oribish/brainkit-core";

// NEW:
vi.mock("../../core/index.js", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
}));

import { readGlobalConfig, discoverVaults } from "../../core/index.js";
```

Also update the comment on line 8:
```typescript
// OLD:
// Mock @oribish/brainkit-core to control readGlobalConfig and discoverVaults

// NEW:
// Mock core module to control readGlobalConfig and discoverVaults
```

- [ ] **Step 7: Run tests to verify imports resolve**

```bash
npx vitest run
```

Expected: all tests pass. The import paths resolve correctly.

- [ ] **Step 8: Run type-check**

```bash
npx tsc --noEmit
npx tsc --project cli/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add opencode/server.ts opencode/side.tsx cli/launch.ts cli/copilot.ts scripts/copilot-status.js cli/__tests__/vault-selection.test.ts
git commit -m "refactor: change @oribish/brainkit-core imports to relative paths"
```

---

### Task 3: Update justfile (lint fix + test-package recipe)

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Remove core tsconfig from lint recipe**

In `justfile`, change the `lint` recipe from:

```just
# lint with eslint + typecheck with tsc
lint:
    npx eslint cli/ core/
    npx tsc --noEmit
    npx tsc --project cli/tsconfig.json --noEmit
    npx tsc --project core/tsconfig.json --noEmit
```

to:

```just
# lint with eslint + typecheck with tsc
lint:
    npx eslint cli/ core/
    npx tsc --noEmit
    npx tsc --project cli/tsconfig.json --noEmit
```

- [ ] **Step 2: Add `test-package` recipe**

Add after the `build-cli` recipe at the end of the justfile:

```just
# test npm package integrity (pack, install, verify)
test-package:
    #!/usr/bin/env bash
    set -euo pipefail
    TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)
    TMPDIR=$(mktemp -d)
    trap 'rm -rf "$TMPDIR" "/tmp/$TARBALL"' EXIT
    cd "$TMPDIR"
    npm init -y --silent > /dev/null 2>&1
    npm install "/tmp/$TARBALL" --silent > /dev/null 2>&1
    # Verify CLI binary exists and runs
    node node_modules/@oribish/brainkit/dist/cli/index.js --help > /dev/null
    # Verify key directories exist
    for dir in core opencode skills dist; do
        if [ ! -d "node_modules/@oribish/brainkit/$dir" ]; then
            echo "FAIL: missing directory $dir" >&2
            exit 1
        fi
    done
    # Verify plugin exports exist
    for f in opencode/server.ts opencode/tui.tsx; do
        if [ ! -f "node_modules/@oribish/brainkit/$f" ]; then
            echo "FAIL: missing export file $f" >&2
            exit 1
        fi
    done
    # Verify test files are NOT shipped
    if [ -d "node_modules/@oribish/brainkit/core/__tests__" ]; then
        echo "FAIL: core/__tests__/ should not be in the package" >&2
        exit 1
    fi
    echo "Package integrity check passed"
```

- [ ] **Step 3: Add `test-package` to `check` recipe**

Change the `check` recipe from:

```just
# run all checks (lint + format check + test)
check:
    just lint
    just format-check
    just test
```

to:

```just
# run all checks (lint + format check + test + package integrity)
check:
    just lint
    just format-check
    just test
    just test-package
```

- [ ] **Step 4: Verify lint passes**

```bash
just lint
```

Expected: no errors (the removed `core/tsconfig.json --noEmit` line no longer runs).

- [ ] **Step 5: Verify test-package passes**

```bash
just test-package
```

Expected: "Package integrity check passed"

- [ ] **Step 6: Commit**

```bash
git add justfile
git commit -m "chore: update lint recipe and add test-package integrity check"
```

---

### Task 4: Create release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: false

permissions:
  contents: write
  id-token: write

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
          PUBLISHED=$(npm view @oribish/brainkit version 2>/dev/null || echo "0.0.0")
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
          VERSION="${{ steps.check.outputs.version }}"
          # Extract changelog section for this version
          NOTES=$(awk "/^## \[${VERSION}\]/{found=1; next} /^## \[/{if(found) exit} found{print}" CHANGELOG.md)
          if [ -z "$NOTES" ]; then
            NOTES="Release v${VERSION}"
          fi
          echo "$NOTES" | gh release create "v${VERSION}" \
            --title "v${VERSION}" \
            --notes-file -
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for automated npm publishing"
```

---

### Task 5: Update CONTRIBUTING.md

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Rewrite the deploy flow and conventions sections**

Replace the entire "Deploy flow" section (lines 44-66) and update the "Conventions" section and "Project structure" section. The new content:

Replace from `## Deploy flow` through the end of the "Deploy flow" section (ending before `## Project structure`) with:

```markdown
## Releasing

### Semver convention

| Bump | When | Examples |
|------|------|----------|
| **Patch** (0.1.0 → 0.1.1) | Bug fixes, doc updates, internal refactors with no behavior change | Fix path traversal edge case, update skill wording |
| **Minor** (0.1.0 → 0.2.0) | New features, new skills, non-breaking additions | Add meeting notes feature, new TUI widget |
| **Major** (0.x → 1.0, 1.x → 2.0) | Breaking changes to vault format, config schema, CLI interface, or plugin API | Change brainkit.toml schema, rename CLI flags |

While at `0.x`, minor bumps may include breaking changes (standard pre-1.0 practice).

### Changelog discipline

Every PR that changes behavior must add an entry under `## [Unreleased]` in `CHANGELOG.md`:
- `Added` — new features
- `Changed` — changes to existing features
- `Fixed` — bug fixes
- `Removed` — removed features
- `Deprecated` — features marked for removal

### Release process (agent-driven)

When the user asks to prepare a release, the agent:

1. Reviews `[Unreleased]` in `CHANGELOG.md` — confirms there are entries to release
2. Determines bump type from changelog categories:
   - Only `Fixed` entries → patch
   - Any `Added` entries → minor
   - Any `Removed` or breaking `Changed` entries → major (or minor while pre-1.0)
3. Bumps `version` in `package.json`
4. Locks changelog — renames `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, adds fresh `[Unreleased]` placeholder, adds comparison link
5. Creates a `release/vX.Y.Z` branch and opens a PR to `main`

### What CI does automatically

After the release PR is merged to `main`:
1. `check.yml` runs `just check` (lint + format + test + package integrity)
2. `release.yml` detects the version change and:
   - Runs `just check` again (belt and suspenders)
   - Publishes to npm with provenance (`npm publish --provenance --access=public`)
   - Creates a GitHub Release with the changelog entries

### Manual setup (one-time)

- Create an npm automation token at npmjs.com → Access Tokens → Automation
- Add it as `NPM_TOKEN` secret in the GitHub repo settings
```

Replace the "Project structure" section with:

```markdown
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
```

Replace the "Conventions" section's import extension note:

```markdown
## Conventions

- TypeScript, strict mode, ESM imports
- `.js` extension for local imports in `cli/` (Node/jiti resolution)
- `.ts`/`.tsx` extensions for imports in `opencode/` (bun resolution)
- `import type` for type-only imports
- `camelCase` for functions/variables, `PascalCase` for types, `UPPER_SNAKE` for constants
- No `any` unless truly unavoidable
- Read `specs/` before making architectural decisions
```

Also update the "Current runtime dependencies" note (line 42):
```markdown
Current runtime dependency: `smol-toml`. That's it.
```

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: update CONTRIBUTING.md with release process and single-package architecture"
```

---

### Task 6: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the structure section**

In the `### Structure` section, remove the `@oribish/brainkit-core` annotation. Change:

```
core/               # TypeScript — shared logic (@oribish/brainkit-core)
```

to:

```
core/               # TypeScript — shared vault logic
```

- [ ] **Step 2: Update the Two-Package Architecture section**

Replace the entire `## Two-Package Architecture` section with:

```markdown
## Package Architecture

The repo publishes a single npm package: `@oribish/brainkit`.

| Directory | What it contains |
| --------- | ------------------------------------------------ |
| `core/`   | Vault ops, system prompt, types. No UI deps.     |
| `cli/`    | CLI entry point, compiled to `dist/` for npm     |
| `opencode/` | OpenCode plugin (server + TUI). Ships raw TS.  |
| `skills/` | Markdown domain knowledge for the user's agent   |

Runtime dependency: `smol-toml` (TOML parsing). Optional peer deps on OpenCode packages (`@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js`).
```

- [ ] **Step 3: Update the Vault Operations section preamble**

In the `## Vault Operations` section, the first line says "All vault logic lives in `core/`." — this is still correct, no change needed.

- [ ] **Step 4: Verify Code Style section is still accurate**

The Code Style section says `.js` extension for local imports in `core/` and `cli/`. This is still correct — core files internally use `.js` extensions (e.g., `core/index.ts` exports from `./types.js`). No change needed.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for single-package architecture"
```

---

### Task 7: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add consolidation entry and update existing entries**

In the `## [Unreleased]` section, under `### Changed`, add:

```markdown
- Collapsed two-package architecture (`@oribish/brainkit-core` + `@oribish/brainkit`) into single `@oribish/brainkit` package
```

Under `### Added`, add:

```markdown
- CI release pipeline: auto-publish to npm on version change, GitHub Releases with changelog
- Package integrity test (`just test-package`) — validates npm artifact before every publish
```

Also remove the now-outdated entry under `### Added`:
```markdown
- Two-package architecture: `@oribish/brainkit-core` (vault ops, system prompt, types) + `@oribish/brainkit` (CLI + plugin + skills)
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog with distribution pipeline changes"
```

---

### Task 8: Run full checks and verify

**Files:** none (verification only)

- [ ] **Step 1: Run the full check suite**

```bash
just check
```

Expected: all steps pass — lint, format-check, test, test-package.

- [ ] **Step 2: Verify the package contents**

```bash
npm pack --dry-run 2>&1
```

Expected output should list files from `dist/`, `core/` (but NOT `core/__tests__/`), `opencode/`, `skills/`, `scripts/`. Should NOT contain `core/package.json`, `core/tsconfig.json`, or any test files from core.

- [ ] **Step 3: Commit any remaining changes**

If any formatting or lint fixes were needed, commit them:

```bash
git add -A
git commit -m "chore: fix formatting after distribution pipeline setup"
```

(Skip if no changes.)

---

### Task 9: Specs cleanup

**Files:**
- Modify: `specs/02-architecture.md`
- Modify: `specs/07-decisions.md`

- [ ] **Step 1: Add a decision entry to `specs/07-decisions.md`**

Append a new decision entry at the end:

```markdown
### Collapsed to single npm package (2026-04-26)

**Decision**: Merge `@oribish/brainkit-core` into `@oribish/brainkit` as a single published package. The `core/` directory remains as an organizational boundary but is no longer a separate workspace or npm package.

**Reasoning**: The separate core package added complexity (workspace protocol resolution, two-package publish ordering, version synchronization) with no external consumer. All imports changed from `@oribish/brainkit-core` to relative paths. `smol-toml` and `@types/node` moved to root package.json. _(Supersedes the two-package split decision.)_
```

- [ ] **Step 2: Update `specs/02-architecture.md`**

Find the two-package table and add a note that it's been superseded. Add at the top of the relevant section:

```markdown
> **Note (2026-04-26):** The two-package architecture described below has been superseded. The repo now publishes a single `@oribish/brainkit` package. See `specs/07-decisions.md` for rationale.
```

- [ ] **Step 3: Commit**

```bash
git add specs/02-architecture.md specs/07-decisions.md
git commit -m "docs: note single-package consolidation in specs"
```
