# Copilot CLI Isolated Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate brainkit's Copilot CLI integration from writing files into the user's vault to using an isolated `COPILOT_HOME` config directory at `~/.config/brainkit/copilot/`, mirroring the OpenCode isolation model and bringing it in line with the AGENTS.md "Harness Config Isolation" rule.

**Architecture:** Spawn `copilot` with `env.COPILOT_HOME=~/.config/brainkit/copilot/` so all brainkit-owned config (skills, instructions, hooks, settings) lives in a dedicated directory outside the vault. The vault stays clean. A dedicated migration module (`cli/copilot-migration.ts`) handles cleanup of legacy files left in vaults from prior brainkit versions, with exhaustive test coverage. Hook schema is also corrected (current code uses `agentStop`/`command` keys; documented schema is documented event names + `bash`/`powershell` keys).

**Tech Stack:** Node.js (`node:fs`, `node:path`), TypeScript (strict, ESM), vitest for tests, `@clack/prompts` for the migration notice UX.

---

## Background and research findings

The current implementation (`cli/copilot.ts:172-220`) writes six things into the vault on every Copilot launch:

1. `<vault>/AGENTS.md` (system prompt)
2. `<vault>/.agents/skills/brainkit/` (skills)
3. `<vault>/.github/hooks/hooks.json` + `<vault>/.github/hooks/scripts/auto-commit.js` (auto-commit hook)
4. `<vault>/.github/copilot/settings.json` (companyAnnouncements + statusLine)
5. `<vault>/.gitignore` entries to hide all of the above

This violates the harness-isolation principle. Smoke tests on Copilot CLI 1.0.36 confirmed:

- `$COPILOT_HOME/copilot-instructions.md` IS loaded (proven; this is the path forward).
- `$COPILOT_HOME/AGENTS.md` is NOT loaded (so we use `copilot-instructions.md` at user level).
- `<cwd>/AGENTS.md` IS loaded — meaning legacy `<vault>/AGENTS.md` will continue to be picked up unless removed by migration.
- `<cwd>/.github/copilot-instructions.md` IS loaded — also a vector to clean.
- Inline hooks in `$COPILOT_HOME/settings.json` work correctly with the documented schema (`bash` key, events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`).
- The current code's `hooks.json` uses `event: "agentStop"` and a `command:` key, neither of which appear in the documented Copilot CLI hook schema. The current hooks may be silently broken; this work fixes the schema.
- `$COPILOT_HOME` redirects everything: instructions, settings, hooks, session-state, logs, config.json. Full isolation.

The brainkit content fingerprint for legacy `AGENTS.md` detection is the preamble line:

```
## Brainkit\n\nBrainkit is a personal second brain
```

(produced by `buildPreamble()` in `core/prompt-sections.ts:55-63`). This fingerprint is unique enough that we can use exact substring matching to identify brainkit-generated `AGENTS.md` files for migration.

---

## File structure

### New files

| Path                                      | Responsibility                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli/copilot-migration.ts`                | Pure migration logic: detect and remove legacy vault artifacts, return structured `MigrationReport`, format user notice. No I/O outside the documented file removals and the marker file. |
| `cli/__tests__/copilot-migration.test.ts` | Exhaustive coverage of every migration policy rule and edge case (~36 tests). Uses real filesystem in `os.tmpdir()`; no fs mocking.                                                       |

### Modified files

| Path                            | Change summary                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/vault.ts`                 | Add `getCopilotConfigDir()` returning `<getConfigDir()>/copilot`.                                                                                                                                                                                                                                                 |
| `core/index.ts`                 | Export `getCopilotConfigDir`.                                                                                                                                                                                                                                                                                     |
| `core/prompt-sections.ts`       | Add a stable `BRAINKIT_PROMPT_FINGERPRINT` constant (the preamble line) and export it for migration use.                                                                                                                                                                                                          |
| `cli/copilot.ts`                | Rewrite write-target paths to `$COPILOT_HOME`. Switch hook schema to documented `bash`/`sessionEnd`/`postToolUse` form, inline in `settings.json`. Remove `updateGitignore` (no vault writes). Call `migrateLegacyVaultFiles` at start of `launchCopilot`. Spawn with `env.COPILOT_HOME = getCopilotConfigDir()`. |
| `cli/__tests__/copilot.test.ts` | Update assertions: skills land in `$COPILOT_HOME/skills/brainkit/`, instructions in `$COPILOT_HOME/copilot-instructions.md`, settings + inline hooks in `$COPILOT_HOME/settings.json`. Add isolation regression test (no writes under vault). Remove `updateGitignore` tests.                                     |
| `specs/10-copilot-cli.md`       | Rewrite "AGENTS.md generation", "Hooks", "Visual touches", ".gitignore handling" sections. Add new "Isolation via COPILOT_HOME" section.                                                                                                                                                                          |
| `AGENTS.md` (this repo)         | Update § "Harness Config Isolation" Copilot bullet to reflect `COPILOT_HOME` use.                                                                                                                                                                                                                                 |
| `CHANGELOG.md`                  | User-facing entry describing the migration.                                                                                                                                                                                                                                                                       |

### Files NOT changed

- `cli/install-skills.ts` — works as-is, just gets a new `targetDir`.
- `cli/copilot-status.js` (compiled from `cli/copilot-status.ts`) — works as-is, absolute path is independent of `COPILOT_HOME`.
- `core/system-prompt.ts`, `core/onboarding-prompt.ts` — content of the prompt is unchanged.
- Onboarding workspace path (`~/.config/brainkit/onboarding/`) — stays separate. Per design discussion, unifying onboarding into `COPILOT_HOME` would require overwriting `copilot-instructions.md` between launches. Cleaner to leave onboarding sandboxed in its own dir.

---

## Migration policy reference

The migration module enforces these rules. Each is implemented by an independent function so it can be tested in isolation.

### Detection rules

| Artifact                                       | Detection signal                                                                                                                                                                | Action when detected                                                                                                                                                                                                                         | Action when signal absent                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<vault>/AGENTS.md`                            | File exists AND contains the exact substring `## Brainkit\n\nBrainkit is a personal second brain`                                                                               | Delete the file. Add to `removed`.                                                                                                                                                                                                           | If file exists but no fingerprint: add to `skipped` with reason "AGENTS.md doesn't look brainkit-generated; left in place". If file doesn't exist: no action. |
| `<vault>/.agents/skills/brainkit/`             | Directory exists AND contains a `.brainkit-version` file                                                                                                                        | Remove the `brainkit/` dir recursively. Walk parent dirs (`.agents/skills/`, `.agents/`); if each is empty after removal, remove it too. Add to `removed`.                                                                                   | If dir exists but `.brainkit-version` missing: add to `skipped` with reason "skills dir present but no brainkit version marker; left in place".               |
| `<vault>/.github/hooks/hooks.json`             | File exists AND parses as JSON AND its `hooks` array contains entries we wrote (matched by `event` value `agentStop` or `sessionEnd` AND `command` containing `auto-commit.js`) | Filter out our entries. If `hooks` array is now empty AND no other top-level keys: remove the file. Otherwise: rewrite without our entries. Add to `removed` or `modified`.                                                                  | No action.                                                                                                                                                    |
| `<vault>/.github/hooks/scripts/auto-commit.js` | File exists                                                                                                                                                                     | Remove. (Brainkit was the only thing writing here; safe to remove unconditionally if file exists.) Then if `scripts/` and `hooks/` are empty, remove them.                                                                                   | No action.                                                                                                                                                    |
| `<vault>/.github/copilot/settings.json`        | File exists AND parses as JSON                                                                                                                                                  | Remove our two keys (`companyAnnouncements`, `statusLine`). If no other keys remain: delete the file. Otherwise: rewrite without our keys. If file deleted, walk up: remove empty `copilot/` and `.github/`. Add to `removed` or `modified`. | No action.                                                                                                                                                    |
| `<vault>/.gitignore`                           | File exists AND contains the exact line `# brainkit — generated files`                                                                                                          | Remove that line plus the three following lines (`.agents/skills/brainkit/`, `.github/hooks/`, `.github/copilot/`) if present. Whitespace-tolerant: tolerate one trailing blank line after the block. Rewrite. Add to `modified`.            | No action.                                                                                                                                                    |

### Migration marker

After successful migration (regardless of whether anything was actually removed), write `<copilotConfigDir>/.brainkit-migration-v1` containing the ISO timestamp + brainkit version. On subsequent runs, presence of this file short-circuits migration: `migrateLegacyVaultFiles` returns `{ alreadyMigrated: true, removed: [], modified: [], skipped: [] }` immediately.

This makes migration sub-millisecond on second run (`fs.existsSync`).

### Notice formatting

`formatMigrationNotice(report)`:

- Returns empty string if report is empty (caller skips printing).
- Returns a formatted multi-line string if there are any `removed`, `modified`, or `skipped` entries.
- Per your decision, the notice explicitly tells the user that brainkit-update migration is happening and that any git-tracked files among the removals were also deleted (this is expected; user should commit the deletion).

Example output:

```
┌  brainkit update — migrating Copilot config
│
│  Brainkit no longer writes files into your vault. The following
│  legacy files have been removed and replaced with config in
│  ~/.config/brainkit/copilot/:
│
│    Removed:
│      • <vault>/AGENTS.md
│      • <vault>/.agents/skills/brainkit/
│      • <vault>/.github/hooks/hooks.json
│      • <vault>/.github/hooks/scripts/auto-commit.js
│      • <vault>/.github/copilot/settings.json
│
│    Modified:
│      • <vault>/.gitignore (removed brainkit entries)
│
│  Some of these files may have been tracked by git. This is expected
│  for a brainkit update. To finalize, commit the deletions:
│
│    git add -A && git commit -m "brainkit: migrate to isolated config"
│
└  Continuing to launch Copilot...
```

### Idempotency and safety

- Marker file makes second runs a no-op.
- Each detection is independent: failure of one rule (e.g. parse error in `hooks.json`) doesn't block others.
- File system errors during removal are caught per-artifact and recorded in `skipped` with the error message; migration continues.
- No path leaves the vault directory (defense against weird symlinks: use `fs.lstat` to detect symlinks and refuse to recurse through them).

---

## Tasks

### Task 1: Add `getCopilotConfigDir()` helper

**Files:**

- Modify: `core/vault.ts:50-57` (add new function alongside `getConfigDir`)
- Modify: `core/index.ts:15` (export `getCopilotConfigDir`)
- Test: `core/__tests__/cross-platform.test.ts` (add coverage alongside `getConfigDir` tests)

- [ ] **Step 1: Write the failing test**

Append to `core/__tests__/cross-platform.test.ts` after the existing `getConfigDir` describe block:

```typescript
describe("getCopilotConfigDir", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env["BRAINKIT_CONFIG_DIR"];
  });

  it("returns <getConfigDir()>/copilot on macOS/Linux", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin", env: { ...process.env, HOME: "/Users/test" } });
    const { getCopilotConfigDir } = await import("../vault.js");
    expect(getCopilotConfigDir()).toBe("/Users/test/.config/brainkit/copilot");
  });

  it("returns <getConfigDir()>/copilot on Windows", async () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "win32",
      env: { ...process.env, APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
    });
    const { getCopilotConfigDir } = await import("../vault.js");
    expect(getCopilotConfigDir()).toBe(path.join("C:\\Users\\test\\AppData\\Roaming", "brainkit", "copilot"));
  });

  it("respects BRAINKIT_CONFIG_DIR override", async () => {
    process.env["BRAINKIT_CONFIG_DIR"] = "/custom/config/dir";
    const { getCopilotConfigDir } = await import("../vault.js");
    expect(getCopilotConfigDir()).toBe(path.join("/custom/config/dir", "copilot"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test-watch -- cross-platform`
Expected: FAIL with `getCopilotConfigDir is not exported`.

- [ ] **Step 3: Implement `getCopilotConfigDir`**

In `core/vault.ts`, add immediately after `getConfigDir` (line 57):

```typescript
export function getCopilotConfigDir(): string {
  return path.join(getConfigDir(), "copilot");
}
```

- [ ] **Step 4: Export from `core/index.ts`**

Modify `core/index.ts` line 15 area to add `getCopilotConfigDir` to the exports list from `./vault.js`:

```typescript
export {
  getConfigDir,
  getCopilotConfigDir,
  // ... existing exports
} from "./vault.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `just test -- cross-platform`
Expected: PASS, all three new tests green.

- [ ] **Step 6: Commit**

```bash
git add core/vault.ts core/index.ts core/__tests__/cross-platform.test.ts
git commit -m "feat(core): add getCopilotConfigDir helper for isolated Copilot config"
```

---

### Task 2: Export brainkit prompt fingerprint

**Files:**

- Modify: `core/prompt-sections.ts` (add exported constant)
- Test: `core/__tests__/prompt-sections.test.ts` (add or extend a test file)

- [ ] **Step 1: Write the failing test**

Create or extend `core/__tests__/prompt-sections.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BRAINKIT_PROMPT_FINGERPRINT, buildPreamble } from "../prompt-sections.js";
import type { BrainkitConfig } from "../types.js";

describe("BRAINKIT_PROMPT_FINGERPRINT", () => {
  it("appears verbatim in the output of buildPreamble", () => {
    const config = { user: { name: "Test", role: "tester" } } as BrainkitConfig;
    const output = buildPreamble({ config, vaultPath: "/tmp/vault", mode: "cli" });
    expect(output).toContain(BRAINKIT_PROMPT_FINGERPRINT);
  });

  it("is long enough to be unique", () => {
    expect(BRAINKIT_PROMPT_FINGERPRINT.length).toBeGreaterThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `just test -- prompt-sections`
Expected: FAIL — `BRAINKIT_PROMPT_FINGERPRINT` not exported.

- [ ] **Step 3: Add the constant**

In `core/prompt-sections.ts`, near the top after the imports, add:

```typescript
/**
 * Stable substring of the brainkit system prompt preamble.
 * Used by migration code to detect brainkit-generated AGENTS.md files.
 *
 * IMPORTANT: This string MUST appear verbatim in `buildPreamble()` output.
 * If you change `buildPreamble`, update this constant and add a migration
 * fallback that recognizes both the old and new fingerprints.
 */
export const BRAINKIT_PROMPT_FINGERPRINT = "## Brainkit\n\nBrainkit is a personal second brain";
```

- [ ] **Step 4: Run test, verify pass**

Run: `just test -- prompt-sections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add core/prompt-sections.ts core/__tests__/prompt-sections.test.ts
git commit -m "feat(core): export BRAINKIT_PROMPT_FINGERPRINT for migration detection"
```

---

### Task 3: Create migration module skeleton

**Files:**

- Create: `cli/copilot-migration.ts`
- Create: `cli/__tests__/copilot-migration.test.ts`

This task sets up the module structure, types, and the marker-file short-circuit. Subsequent tasks add the per-artifact detection rules.

- [ ] **Step 1: Write failing tests for marker file short-circuit and report shape**

Create `cli/__tests__/copilot-migration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { migrateLegacyVaultFiles, formatMigrationNotice } from "../copilot-migration.js";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-migration-${prefix}-`));
}

describe("migrateLegacyVaultFiles — marker short-circuit", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("returns alreadyMigrated when marker file exists", () => {
    fs.writeFileSync(path.join(copilotHome, ".brainkit-migration-v1"), "2026-04-28T00:00:00Z\n", "utf-8");

    // Even if legacy files exist, they should not be touched
    fs.writeFileSync(path.join(vault, "AGENTS.md"), "## Brainkit\n\nBrainkit is a personal second brain ...", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(report.alreadyMigrated).toBe(true);
    expect(report.removed).toEqual([]);
    expect(report.modified).toEqual([]);
    expect(report.skipped).toEqual([]);
    // Vault file untouched
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
  });

  it("returns empty report and writes marker on a clean vault", () => {
    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(report.alreadyMigrated).toBe(false);
    expect(report.removed).toEqual([]);
    expect(report.modified).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(fs.existsSync(path.join(copilotHome, ".brainkit-migration-v1"))).toBe(true);
  });

  it("creates copilotHome dir if missing (so marker can be written)", () => {
    fs.rmSync(copilotHome, { recursive: true, force: true });
    expect(fs.existsSync(copilotHome)).toBe(false);

    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(copilotHome, ".brainkit-migration-v1"))).toBe(true);
  });

  it("throws a clear error if vault path doesn't exist", () => {
    fs.rmSync(vault, { recursive: true, force: true });
    expect(() => migrateLegacyVaultFiles(vault, copilotHome)).toThrow(/vault.*not.*exist|ENOENT/i);
  });
});

describe("formatMigrationNotice", () => {
  it("returns empty string for an empty report", () => {
    expect(formatMigrationNotice({ alreadyMigrated: false, removed: [], modified: [], skipped: [] })).toBe("");
  });

  it("returns empty string when alreadyMigrated", () => {
    expect(formatMigrationNotice({ alreadyMigrated: true, removed: [], modified: [], skipped: [] })).toBe("");
  });

  it("formats removed files in the notice", () => {
    const out = formatMigrationNotice({
      alreadyMigrated: false,
      removed: ["/vault/AGENTS.md"],
      modified: [],
      skipped: [],
    });
    expect(out).toContain("brainkit update");
    expect(out).toContain("/vault/AGENTS.md");
    expect(out).toContain("Removed");
  });

  it("formats modified files in the notice", () => {
    const out = formatMigrationNotice({
      alreadyMigrated: false,
      removed: [],
      modified: ["/vault/.gitignore"],
      skipped: [],
    });
    expect(out).toContain("Modified");
    expect(out).toContain("/vault/.gitignore");
  });

  it("formats skipped files with their reasons", () => {
    const out = formatMigrationNotice({
      alreadyMigrated: false,
      removed: [],
      modified: [],
      skipped: [{ path: "/vault/AGENTS.md", reason: "doesn't look brainkit-generated" }],
    });
    expect(out).toContain("Skipped");
    expect(out).toContain("/vault/AGENTS.md");
    expect(out).toContain("doesn't look brainkit-generated");
  });

  it("mentions git tracking in the notice when removals occurred", () => {
    const out = formatMigrationNotice({
      alreadyMigrated: false,
      removed: ["/vault/AGENTS.md"],
      modified: [],
      skipped: [],
    });
    expect(out).toMatch(/git/i);
    expect(out).toMatch(/commit/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail (module doesn't exist)**

Run: `just test -- copilot-migration`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement skeleton module**

Create `cli/copilot-migration.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkipNotice {
  path: string;
  reason: string;
}

export interface MigrationReport {
  alreadyMigrated: boolean;
  removed: string[];
  modified: string[];
  skipped: SkipNotice[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIGRATION_MARKER_FILE = ".brainkit-migration-v1";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function migrateLegacyVaultFiles(vaultPath: string, copilotConfigDir: string): MigrationReport {
  // Defensive: vault must exist
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`vault directory does not exist: ${vaultPath}`);
  }

  // Short-circuit if already migrated
  const markerPath = path.join(copilotConfigDir, MIGRATION_MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    return { alreadyMigrated: true, removed: [], modified: [], skipped: [] };
  }

  const report: MigrationReport = {
    alreadyMigrated: false,
    removed: [],
    modified: [],
    skipped: [],
  };

  // (Per-artifact migration steps added in subsequent tasks)

  // Write marker so subsequent runs short-circuit
  fs.mkdirSync(copilotConfigDir, { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString() + "\n", "utf-8");

  return report;
}

export function formatMigrationNotice(report: MigrationReport): string {
  if (report.alreadyMigrated) return "";
  if (report.removed.length === 0 && report.modified.length === 0 && report.skipped.length === 0) return "";

  const lines: string[] = [];
  lines.push("┌  brainkit update — migrating Copilot config");
  lines.push("│");
  lines.push("│  Brainkit no longer writes files into your vault. The following");
  lines.push("│  legacy files have been handled and replaced with config in");
  lines.push("│  ~/.config/brainkit/copilot/:");
  lines.push("│");

  if (report.removed.length > 0) {
    lines.push("│    Removed:");
    for (const p of report.removed) lines.push(`│      • ${p}`);
    lines.push("│");
  }
  if (report.modified.length > 0) {
    lines.push("│    Modified:");
    for (const p of report.modified) lines.push(`│      • ${p}`);
    lines.push("│");
  }
  if (report.skipped.length > 0) {
    lines.push("│    Skipped (left in place):");
    for (const s of report.skipped) lines.push(`│      • ${s.path} — ${s.reason}`);
    lines.push("│");
  }

  if (report.removed.length > 0 || report.modified.length > 0) {
    lines.push("│  Some of these files may have been tracked by git. This is");
    lines.push("│  expected for a brainkit update. To finalize, commit the changes:");
    lines.push("│");
    lines.push('│    git add -A && git commit -m "brainkit: migrate to isolated config"');
    lines.push("│");
  }
  lines.push("└  Continuing to launch Copilot...");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `just test -- copilot-migration`
Expected: PASS — all skeleton tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): add copilot-migration module skeleton with marker short-circuit"
```

---

### Task 4: Migration rule — legacy `<vault>/AGENTS.md`

**Files:**

- Modify: `cli/copilot-migration.ts`
- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write failing tests for AGENTS.md migration**

Append to `cli/__tests__/copilot-migration.test.ts`:

```typescript
import { BRAINKIT_PROMPT_FINGERPRINT } from "../../core/prompt-sections.js";

describe("migrateLegacyVaultFiles — AGENTS.md", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("removes AGENTS.md when it contains the brainkit fingerprint", () => {
    const agents = path.join(vault, "AGENTS.md");
    fs.writeFileSync(agents, BRAINKIT_PROMPT_FINGERPRINT + " ... vault is at /foo\n", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(agents)).toBe(false);
    expect(report.removed).toContain(agents);
  });

  it("preserves AGENTS.md when fingerprint is absent (user-written)", () => {
    const agents = path.join(vault, "AGENTS.md");
    fs.writeFileSync(agents, "# My personal agent instructions\n\nDo the thing.\n", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(agents)).toBe(true);
    expect(report.removed).not.toContain(agents);
    expect(report.skipped.some((s) => s.path === agents && /brainkit-generated/.test(s.reason))).toBe(true);
  });

  it("preserves an empty AGENTS.md", () => {
    const agents = path.join(vault, "AGENTS.md");
    fs.writeFileSync(agents, "", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(agents)).toBe(true);
    expect(report.skipped.some((s) => s.path === agents)).toBe(true);
  });

  it("no action when AGENTS.md does not exist", () => {
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(report.removed).toEqual([]);
    expect(report.skipped.find((s) => s.path.endsWith("AGENTS.md"))).toBeUndefined();
  });

  it("removes AGENTS.md even if file is read-only (chmod), then handled gracefully on platforms where this fails", () => {
    const agents = path.join(vault, "AGENTS.md");
    fs.writeFileSync(agents, BRAINKIT_PROMPT_FINGERPRINT + " ...", "utf-8");
    try {
      fs.chmodSync(agents, 0o444);
    } catch {
      /* not all platforms support */
    }

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    // Either the file was removed (most platforms allow root removal of own files)
    // OR it was added to skipped with an error reason.
    if (fs.existsSync(agents)) {
      expect(report.skipped.some((s) => s.path === agents)).toBe(true);
    } else {
      expect(report.removed).toContain(agents);
    }
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `just test -- copilot-migration`
Expected: FAIL — AGENTS.md migration not yet implemented.

- [ ] **Step 3: Implement AGENTS.md migration rule**

In `cli/copilot-migration.ts`, add this helper above `migrateLegacyVaultFiles`:

```typescript
import { BRAINKIT_PROMPT_FINGERPRINT } from "../core/prompt-sections.js";

function migrateAgentsMd(vaultPath: string, report: MigrationReport): void {
  const agentsPath = path.join(vaultPath, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return;

  let content: string;
  try {
    content = fs.readFileSync(agentsPath, "utf-8");
  } catch (err) {
    report.skipped.push({ path: agentsPath, reason: `could not read: ${(err as Error).message}` });
    return;
  }

  if (!content.includes(BRAINKIT_PROMPT_FINGERPRINT)) {
    report.skipped.push({ path: agentsPath, reason: "AGENTS.md doesn't look brainkit-generated; left in place" });
    return;
  }

  try {
    fs.unlinkSync(agentsPath);
    report.removed.push(agentsPath);
  } catch (err) {
    report.skipped.push({ path: agentsPath, reason: `removal failed: ${(err as Error).message}` });
  }
}
```

Then call it inside `migrateLegacyVaultFiles` BEFORE the marker-write line:

```typescript
// Per-artifact migrations
migrateAgentsMd(vaultPath, report);

// Write marker so subsequent runs short-circuit
fs.mkdirSync(copilotConfigDir, { recursive: true });
fs.writeFileSync(markerPath, new Date().toISOString() + "\n", "utf-8");
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `just test -- copilot-migration`
Expected: PASS — AGENTS.md tests green.

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): migrate legacy vault AGENTS.md via brainkit fingerprint detection"
```

---

### Task 5: Migration rule — `<vault>/.agents/skills/brainkit/`

**Files:**

- Modify: `cli/copilot-migration.ts`
- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write failing tests for skills dir migration**

Append to `cli/__tests__/copilot-migration.test.ts`:

```typescript
describe("migrateLegacyVaultFiles — skills dir", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  function makeBrainkitSkillsDir(): string {
    const dir = path.join(vault, ".agents", "skills", "brainkit");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".brainkit-version"), "0.5.0\n", "utf-8");
    fs.writeFileSync(path.join(dir, "SKILL.md"), "# brainkit\n", "utf-8");
    fs.mkdirSync(path.join(dir, "references"), { recursive: true });
    fs.writeFileSync(path.join(dir, "references", "para.md"), "# para\n", "utf-8");
    return dir;
  }

  it("removes the brainkit skills dir when version marker is present", () => {
    const skillsDir = makeBrainkitSkillsDir();
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(skillsDir)).toBe(false);
    expect(report.removed).toContain(skillsDir);
  });

  it("removes empty parent .agents/skills/ and .agents/ after removing brainkit dir", () => {
    makeBrainkitSkillsDir();
    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, ".agents", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
  });

  it("preserves .agents/skills/ when other skill dirs exist", () => {
    makeBrainkitSkillsDir();
    fs.mkdirSync(path.join(vault, ".agents", "skills", "other"), { recursive: true });
    fs.writeFileSync(path.join(vault, ".agents", "skills", "other", "SKILL.md"), "x", "utf-8");

    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, ".agents", "skills", "brainkit"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".agents", "skills", "other"))).toBe(true);
    expect(fs.existsSync(path.join(vault, ".agents", "skills"))).toBe(true);
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(true);
  });

  it("preserves brainkit skills dir when version marker is missing", () => {
    const skillsDir = path.join(vault, ".agents", "skills", "brainkit");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "SKILL.md"), "x", "utf-8");
    // NOTE: no .brainkit-version

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(skillsDir)).toBe(true);
    expect(report.skipped.some((s) => s.path === skillsDir && /version marker/.test(s.reason))).toBe(true);
  });

  it("no action when .agents/ does not exist", () => {
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(report.removed.find((p) => p.includes(".agents"))).toBeUndefined();
  });

  it("does not follow symlinks (defensive)", () => {
    const fakeTarget = tmp("fake-target");
    fs.writeFileSync(path.join(fakeTarget, "DO_NOT_DELETE"), "important", "utf-8");
    const skillsDir = path.join(vault, ".agents", "skills", "brainkit");
    fs.mkdirSync(path.dirname(skillsDir), { recursive: true });
    try {
      fs.symlinkSync(fakeTarget, skillsDir);
      // (no .brainkit-version inside the symlink target by design)
      migrateLegacyVaultFiles(vault, copilotHome);
      // The symlink target's contents must remain untouched
      expect(fs.existsSync(path.join(fakeTarget, "DO_NOT_DELETE"))).toBe(true);
    } finally {
      fs.rmSync(fakeTarget, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `just test -- copilot-migration`
Expected: FAIL — skills migration not implemented.

- [ ] **Step 3: Implement skills dir migration**

Add to `cli/copilot-migration.ts`:

```typescript
function rmDirIfEmpty(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      fs.rmdirSync(dirPath);
      return true;
    }
  } catch {
    // dir doesn't exist or can't read — treat as no-op
  }
  return false;
}

function migrateSkillsDir(vaultPath: string, report: MigrationReport): void {
  const skillsDir = path.join(vaultPath, ".agents", "skills", "brainkit");
  if (!fs.existsSync(skillsDir)) return;

  // Refuse to touch symlinks
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(skillsDir);
  } catch (err) {
    report.skipped.push({ path: skillsDir, reason: `lstat failed: ${(err as Error).message}` });
    return;
  }
  if (stat.isSymbolicLink()) {
    report.skipped.push({ path: skillsDir, reason: "skills path is a symlink; left in place for safety" });
    return;
  }

  // Require version marker as confirmation this is brainkit-owned
  const versionMarker = path.join(skillsDir, ".brainkit-version");
  if (!fs.existsSync(versionMarker)) {
    report.skipped.push({
      path: skillsDir,
      reason: "skills dir present but no .brainkit-version marker; left in place",
    });
    return;
  }

  try {
    fs.rmSync(skillsDir, { recursive: true, force: true });
    report.removed.push(skillsDir);
  } catch (err) {
    report.skipped.push({ path: skillsDir, reason: `removal failed: ${(err as Error).message}` });
    return;
  }

  // Walk up: remove empty .agents/skills/ then .agents/
  rmDirIfEmpty(path.join(vaultPath, ".agents", "skills"));
  rmDirIfEmpty(path.join(vaultPath, ".agents"));
}
```

Wire into `migrateLegacyVaultFiles`:

```typescript
migrateAgentsMd(vaultPath, report);
migrateSkillsDir(vaultPath, report);
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `just test -- copilot-migration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): migrate legacy vault skills dir; clean empty parents; refuse symlinks"
```

---

### Task 6: Migration rule — `<vault>/.github/hooks/`

**Files:**

- Modify: `cli/copilot-migration.ts`
- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```typescript
describe("migrateLegacyVaultFiles — hooks", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  function makeBrainkitHooks(): { hooksJson: string; script: string } {
    const hooksDir = path.join(vault, ".github", "hooks");
    const scriptsDir = path.join(hooksDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });

    const hooksJson = path.join(hooksDir, "hooks.json");
    const script = path.join(scriptsDir, "auto-commit.js");

    fs.writeFileSync(
      hooksJson,
      JSON.stringify(
        {
          hooks: [
            { event: "agentStop", command: "node .github/hooks/scripts/auto-commit.js", description: "..." },
            { event: "sessionEnd", command: "node .github/hooks/scripts/auto-commit.js", description: "..." },
          ],
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );

    fs.writeFileSync(script, "// brainkit auto-commit\n", "utf-8");
    return { hooksJson, script };
  }

  it("removes brainkit hooks.json and auto-commit.js when shape matches", () => {
    const { hooksJson, script } = makeBrainkitHooks();
    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(hooksJson)).toBe(false);
    expect(fs.existsSync(script)).toBe(false);
    expect(report.removed).toContain(hooksJson);
    expect(report.removed).toContain(script);
  });

  it("removes empty parents .github/hooks/scripts and .github/hooks after cleanup", () => {
    makeBrainkitHooks();
    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, ".github", "hooks", "scripts"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github", "hooks"))).toBe(false);
  });

  it("preserves hooks.json when it contains user-added hooks too", () => {
    const { hooksJson, script } = makeBrainkitHooks();
    const mixed = {
      hooks: [
        { event: "agentStop", command: "node .github/hooks/scripts/auto-commit.js", description: "..." },
        { event: "sessionEnd", command: "node .github/hooks/scripts/auto-commit.js", description: "..." },
        { event: "sessionStart", command: "echo my-custom-hook", description: "user added" },
      ],
    };
    fs.writeFileSync(hooksJson, JSON.stringify(mixed, null, 2) + "\n", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(hooksJson)).toBe(true);
    const remaining = JSON.parse(fs.readFileSync(hooksJson, "utf-8")) as { hooks: { event: string }[] };
    expect(remaining.hooks).toHaveLength(1);
    expect(remaining.hooks[0]?.event).toBe("sessionStart");
    // The brainkit auto-commit script is also removed
    expect(fs.existsSync(script)).toBe(false);
    expect(report.modified).toContain(hooksJson);
    expect(report.removed).toContain(script);
  });

  it("removes orphan auto-commit.js even when hooks.json is absent", () => {
    const scriptsDir = path.join(vault, ".github", "hooks", "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    const script = path.join(scriptsDir, "auto-commit.js");
    fs.writeFileSync(script, "// brainkit auto-commit\n", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(script)).toBe(false);
    expect(report.removed).toContain(script);
  });

  it("preserves hooks.json that doesn't reference auto-commit.js", () => {
    const hooksDir = path.join(vault, ".github", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hooksJson = path.join(hooksDir, "hooks.json");
    fs.writeFileSync(
      hooksJson,
      JSON.stringify({
        hooks: [{ event: "sessionStart", command: "echo user-only", description: "..." }],
      }),
      "utf-8",
    );

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(hooksJson)).toBe(true);
    expect(report.removed).not.toContain(hooksJson);
  });

  it("handles invalid JSON in hooks.json gracefully", () => {
    const hooksDir = path.join(vault, ".github", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hooksJson = path.join(hooksDir, "hooks.json");
    fs.writeFileSync(hooksJson, "{ this is not valid json", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(hooksJson)).toBe(true);
    expect(report.skipped.some((s) => s.path === hooksJson && /parse|json/i.test(s.reason))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `just test -- copilot-migration`
Expected: FAIL — hook migration not implemented.

- [ ] **Step 3: Implement hook migration rule**

Add to `cli/copilot-migration.ts`:

```typescript
interface LegacyHookEntry {
  event?: string;
  command?: string;
  description?: string;
}

function isBrainkitHookEntry(entry: LegacyHookEntry): boolean {
  // Match the exact shape brainkit wrote: events agentStop or sessionEnd, command references auto-commit.js
  if (entry.event !== "agentStop" && entry.event !== "sessionEnd") return false;
  if (typeof entry.command !== "string") return false;
  return entry.command.includes("auto-commit.js");
}

function migrateHooks(vaultPath: string, report: MigrationReport): void {
  const hooksDir = path.join(vaultPath, ".github", "hooks");
  const hooksJsonPath = path.join(hooksDir, "hooks.json");
  const scriptPath = path.join(hooksDir, "scripts", "auto-commit.js");

  // Step 1: handle hooks.json (if it exists)
  if (fs.existsSync(hooksJsonPath)) {
    let parsed: { hooks?: LegacyHookEntry[] } | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(hooksJsonPath, "utf-8")) as { hooks?: LegacyHookEntry[] };
    } catch (err) {
      report.skipped.push({ path: hooksJsonPath, reason: `could not parse JSON: ${(err as Error).message}` });
    }

    if (parsed && Array.isArray(parsed.hooks)) {
      const original = parsed.hooks;
      const remaining = original.filter((h) => !isBrainkitHookEntry(h));
      const removedCount = original.length - remaining.length;

      if (removedCount > 0) {
        if (remaining.length === 0 && Object.keys(parsed).length === 1) {
          // hooks.json was entirely brainkit-owned
          try {
            fs.unlinkSync(hooksJsonPath);
            report.removed.push(hooksJsonPath);
          } catch (err) {
            report.skipped.push({ path: hooksJsonPath, reason: `removal failed: ${(err as Error).message}` });
          }
        } else {
          // Rewrite without brainkit entries
          parsed.hooks = remaining;
          try {
            fs.writeFileSync(hooksJsonPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
            report.modified.push(hooksJsonPath);
          } catch (err) {
            report.skipped.push({ path: hooksJsonPath, reason: `rewrite failed: ${(err as Error).message}` });
          }
        }
      }
    }
  }

  // Step 2: remove auto-commit.js script if present (brainkit was the only thing writing it)
  if (fs.existsSync(scriptPath)) {
    try {
      fs.unlinkSync(scriptPath);
      report.removed.push(scriptPath);
    } catch (err) {
      report.skipped.push({ path: scriptPath, reason: `removal failed: ${(err as Error).message}` });
    }
  }

  // Step 3: clean up empty parents
  rmDirIfEmpty(path.join(hooksDir, "scripts"));
  rmDirIfEmpty(hooksDir);
  // Note: do NOT remove .github/ here — copilot/ migration may also clean it up.
}
```

Wire in:

```typescript
migrateAgentsMd(vaultPath, report);
migrateSkillsDir(vaultPath, report);
migrateHooks(vaultPath, report);
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `just test -- copilot-migration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): migrate legacy vault hooks; preserve user-added hook entries"
```

---

### Task 7: Migration rule — `<vault>/.github/copilot/settings.json`

**Files:**

- Modify: `cli/copilot-migration.ts`
- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```typescript
describe("migrateLegacyVaultFiles — copilot settings", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  function writeSettings(content: object): string {
    const dir = path.join(vault, ".github", "copilot");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, JSON.stringify(content, null, 2) + "\n", "utf-8");
    return file;
  }

  it("removes settings.json when only brainkit keys are present", () => {
    const file = writeSettings({
      companyAnnouncements: ["a", "b"],
      statusLine: { command: "node /x.js" },
    });

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(file)).toBe(false);
    expect(report.removed).toContain(file);
    // Empty parents cleaned up
    expect(fs.existsSync(path.join(vault, ".github", "copilot"))).toBe(false);
  });

  it("rewrites settings.json without brainkit keys when other keys present", () => {
    const file = writeSettings({
      companyAnnouncements: ["a"],
      statusLine: { command: "node /x.js" },
      myCustomKey: "preserved",
    });

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    expect(fs.existsSync(file)).toBe(true);
    const remaining = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    expect(remaining["myCustomKey"]).toBe("preserved");
    expect(remaining["companyAnnouncements"]).toBeUndefined();
    expect(remaining["statusLine"]).toBeUndefined();
    expect(report.modified).toContain(file);
  });

  it("no action when settings.json has neither of our keys", () => {
    const file = writeSettings({ myCustomKey: "x" });
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(file)).toBe(true);
    expect(report.modified).not.toContain(file);
    expect(report.removed).not.toContain(file);
  });

  it("handles invalid JSON gracefully", () => {
    const dir = path.join(vault, ".github", "copilot");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, "{not json", "utf-8");

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(file)).toBe(true);
    expect(report.skipped.some((s) => s.path === file && /parse|json/i.test(s.reason))).toBe(true);
  });

  it("removes empty .github/ if both copilot and hooks were cleaned up", () => {
    writeSettings({ companyAnnouncements: ["a"], statusLine: { command: "x" } });
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);
  });

  it("preserves .github/ when it contains other content", () => {
    writeSettings({ companyAnnouncements: ["a"], statusLine: { command: "x" } });
    fs.mkdirSync(path.join(vault, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(vault, ".github", "workflows", "ci.yml"), "name: ci\n", "utf-8");

    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(true);
    expect(fs.existsSync(path.join(vault, ".github", "workflows", "ci.yml"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement settings.json migration**

Add to `cli/copilot-migration.ts`:

```typescript
function migrateCopilotSettings(vaultPath: string, report: MigrationReport): void {
  const dir = path.join(vaultPath, ".github", "copilot");
  const file = path.join(dir, "settings.json");
  if (!fs.existsSync(file)) return;

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch (err) {
    report.skipped.push({ path: file, reason: `could not parse JSON: ${(err as Error).message}` });
    return;
  }

  const ours = ["companyAnnouncements", "statusLine"];
  const hadOurs = ours.some((k) => k in parsed);
  if (!hadOurs) return;

  for (const k of ours) delete parsed[k];

  if (Object.keys(parsed).length === 0) {
    try {
      fs.unlinkSync(file);
      report.removed.push(file);
    } catch (err) {
      report.skipped.push({ path: file, reason: `removal failed: ${(err as Error).message}` });
      return;
    }
  } else {
    try {
      fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
      report.modified.push(file);
    } catch (err) {
      report.skipped.push({ path: file, reason: `rewrite failed: ${(err as Error).message}` });
      return;
    }
  }

  // Clean up empty parents
  rmDirIfEmpty(dir);
  rmDirIfEmpty(path.join(vaultPath, ".github"));
}
```

Wire in (add AFTER hooks so empty `.github/` removal works):

```typescript
migrateAgentsMd(vaultPath, report);
migrateSkillsDir(vaultPath, report);
migrateHooks(vaultPath, report);
migrateCopilotSettings(vaultPath, report);
```

Also update `migrateHooks` to walk one level higher (call `rmDirIfEmpty(path.join(vaultPath, ".github"))` at the end of `migrateHooks` too) so the order of operations doesn't matter when only one of them ran. (Idempotent — safe.)

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): migrate legacy vault Copilot settings.json; preserve unrelated keys"
```

---

### Task 8: Migration rule — `<vault>/.gitignore`

**Files:**

- Modify: `cli/copilot-migration.ts`
- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write failing tests**

Append:

```typescript
describe("migrateLegacyVaultFiles — .gitignore", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  const BLOCK = ["# brainkit — generated files", ".agents/skills/brainkit/", ".github/hooks/", ".github/copilot/"].join(
    "\n",
  );

  function writeGitignore(content: string): string {
    const f = path.join(vault, ".gitignore");
    fs.writeFileSync(f, content, "utf-8");
    return f;
  }

  it("removes the brainkit block when present alone", () => {
    const f = writeGitignore(BLOCK + "\n");
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    const remaining = fs.readFileSync(f, "utf-8");
    expect(remaining).not.toContain("brainkit");
    expect(remaining).not.toContain(".agents/skills/brainkit/");
    expect(report.modified).toContain(f);
  });

  it("removes only our block, preserving user content above and below", () => {
    const f = writeGitignore("node_modules/\n\n" + BLOCK + "\n\nbuild/\n");
    migrateLegacyVaultFiles(vault, copilotHome);
    const remaining = fs.readFileSync(f, "utf-8");
    expect(remaining).toContain("node_modules/");
    expect(remaining).toContain("build/");
    expect(remaining).not.toContain("brainkit");
    expect(remaining).not.toContain(".agents/skills/brainkit/");
  });

  it("removes block tolerating one trailing blank line", () => {
    const f = writeGitignore("node_modules/\n" + BLOCK + "\n\nbuild/\n");
    migrateLegacyVaultFiles(vault, copilotHome);
    const remaining = fs.readFileSync(f, "utf-8");
    expect(remaining).not.toContain(".agents/skills/brainkit/");
    expect(remaining).toContain("node_modules/");
    expect(remaining).toContain("build/");
  });

  it("removes only matching lines when block is partial (user edited)", () => {
    const partial = [
      "# brainkit — generated files",
      ".agents/skills/brainkit/",
      // user removed .github/hooks/ and .github/copilot/
      "my-extra-line",
    ].join("\n");
    const f = writeGitignore(partial + "\n");

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    const remaining = fs.readFileSync(f, "utf-8");
    // The marker comment + the matching line should be removed
    expect(remaining).not.toContain("# brainkit — generated files");
    expect(remaining).not.toContain(".agents/skills/brainkit/");
    // Non-brainkit content preserved
    expect(remaining).toContain("my-extra-line");
    // Should be in skipped with explanation since not all lines were present
    expect(report.skipped.some((s) => s.path === f)).toBe(true);
  });

  it("no action when no brainkit lines present", () => {
    const f = writeGitignore("node_modules/\nbuild/\n");
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(report.modified).not.toContain(f);
    expect(fs.readFileSync(f, "utf-8")).toBe("node_modules/\nbuild/\n");
  });

  it("no action when .gitignore doesn't exist", () => {
    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(report.modified.find((p) => p.endsWith(".gitignore"))).toBeUndefined();
  });

  it("preserves empty .gitignore (does not delete the file)", () => {
    const f = writeGitignore(BLOCK + "\n");
    migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(f)).toBe(true);
    // Content may be empty or just whitespace — that's fine, file kept
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

- [ ] **Step 3: Implement .gitignore migration**

Add to `cli/copilot-migration.ts`:

```typescript
const GITIGNORE_HEADER = "# brainkit — generated files";
const GITIGNORE_ENTRIES = [".agents/skills/brainkit/", ".github/hooks/", ".github/copilot/"];

function migrateGitignore(vaultPath: string, report: MigrationReport): void {
  const file = path.join(vaultPath, ".gitignore");
  if (!fs.existsSync(file)) return;

  let content: string;
  try {
    content = fs.readFileSync(file, "utf-8");
  } catch (err) {
    report.skipped.push({ path: file, reason: `could not read: ${(err as Error).message}` });
    return;
  }

  const hasHeader = content.includes(GITIGNORE_HEADER);
  const presentEntries = GITIGNORE_ENTRIES.filter((e) => content.includes(e));
  if (!hasHeader && presentEntries.length === 0) return;

  // Build set of lines to remove
  const linesToRemove = new Set<string>();
  if (hasHeader) linesToRemove.add(GITIGNORE_HEADER);
  for (const e of presentEntries) linesToRemove.add(e);

  const original = content.split(/\r?\n/);
  const filtered: string[] = [];
  let lastWasBlank = false;
  for (const line of original) {
    if (linesToRemove.has(line)) {
      // Skip this line. Don't introduce double blank lines.
      continue;
    }
    if (line === "" && lastWasBlank) continue;
    filtered.push(line);
    lastWasBlank = line === "";
  }

  // Strip leading blank line if any (from removing a header at the very top)
  while (filtered.length > 0 && filtered[0] === "") filtered.shift();

  const newContent = filtered.join("\n");
  if (newContent === content) return; // belt-and-suspenders

  try {
    fs.writeFileSync(file, newContent, "utf-8");
    report.modified.push(file);
  } catch (err) {
    report.skipped.push({ path: file, reason: `rewrite failed: ${(err as Error).message}` });
    return;
  }

  // Partial-block detection: if header was missing, or some entries weren't present, note in skipped
  const allFour = hasHeader && presentEntries.length === GITIGNORE_ENTRIES.length;
  if (!allFour) {
    report.skipped.push({
      path: file,
      reason: "brainkit .gitignore block was partial (user-edited); only matching lines were removed",
    });
  }
}
```

Wire in (last, since it doesn't depend on others):

```typescript
migrateAgentsMd(vaultPath, report);
migrateSkillsDir(vaultPath, report);
migrateHooks(vaultPath, report);
migrateCopilotSettings(vaultPath, report);
migrateGitignore(vaultPath, report);
```

- [ ] **Step 4: Run tests, verify they pass**

- [ ] **Step 5: Commit**

```bash
git add cli/copilot-migration.ts cli/__tests__/copilot-migration.test.ts
git commit -m "feat(cli): migrate legacy vault .gitignore; preserve user lines; warn on partial blocks"
```

---

### Task 9: End-to-end migration test (full legacy layout)

**Files:**

- Modify: `cli/__tests__/copilot-migration.test.ts`

- [ ] **Step 1: Write the e2e test**

Append:

```typescript
describe("migrateLegacyVaultFiles — end to end", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("cleans a fully-populated legacy vault in one call", () => {
    // AGENTS.md
    fs.writeFileSync(path.join(vault, "AGENTS.md"), BRAINKIT_PROMPT_FINGERPRINT + "\n... rest ...\n", "utf-8");

    // skills
    const skillsDir = path.join(vault, ".agents", "skills", "brainkit");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, ".brainkit-version"), "0.5.0\n", "utf-8");
    fs.writeFileSync(path.join(skillsDir, "SKILL.md"), "x", "utf-8");

    // hooks
    const hooksDir = path.join(vault, ".github", "hooks");
    fs.mkdirSync(path.join(hooksDir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, "hooks.json"),
      JSON.stringify({
        hooks: [{ event: "agentStop", command: "node .github/hooks/scripts/auto-commit.js" }],
      }),
      "utf-8",
    );
    fs.writeFileSync(path.join(hooksDir, "scripts", "auto-commit.js"), "// brainkit", "utf-8");

    // settings
    const copilotDir = path.join(vault, ".github", "copilot");
    fs.mkdirSync(copilotDir, { recursive: true });
    fs.writeFileSync(
      path.join(copilotDir, "settings.json"),
      JSON.stringify({
        companyAnnouncements: ["x"],
        statusLine: { command: "y" },
      }),
      "utf-8",
    );

    // gitignore
    fs.writeFileSync(
      path.join(vault, ".gitignore"),
      "node_modules/\n\n# brainkit — generated files\n.agents/skills/brainkit/\n.github/hooks/\n.github/copilot/\n",
      "utf-8",
    );

    const report = migrateLegacyVaultFiles(vault, copilotHome);

    // Everything brainkit-owned should be gone
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);
    // gitignore should be cleaned but not deleted
    const gi = fs.readFileSync(path.join(vault, ".gitignore"), "utf-8");
    expect(gi).toContain("node_modules/");
    expect(gi).not.toContain("brainkit");
    expect(gi).not.toContain(".agents/skills/brainkit/");

    // Report should list everything
    expect(report.removed.length).toBeGreaterThanOrEqual(4); // AGENTS.md, skills dir, hooks.json, auto-commit.js, settings.json
    expect(report.modified).toContain(path.join(vault, ".gitignore"));

    // Marker file written
    expect(fs.existsSync(path.join(copilotHome, ".brainkit-migration-v1"))).toBe(true);
  });

  it("running migration twice is a no-op the second time", () => {
    fs.writeFileSync(path.join(vault, "AGENTS.md"), BRAINKIT_PROMPT_FINGERPRINT + "\nfoo\n", "utf-8");

    const first = migrateLegacyVaultFiles(vault, copilotHome);
    expect(first.alreadyMigrated).toBe(false);
    expect(first.removed.length).toBeGreaterThan(0);

    const second = migrateLegacyVaultFiles(vault, copilotHome);
    expect(second.alreadyMigrated).toBe(true);
    expect(second.removed).toEqual([]);
  });

  it("preserves a vault that has user-written non-brainkit content alongside legacy brainkit files", () => {
    // User AGENTS.md (no brainkit fingerprint)
    fs.writeFileSync(path.join(vault, "AGENTS.md"), "# my project rules\n", "utf-8");
    // User-written hook
    const hooksDir = path.join(vault, ".github", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, "hooks.json"),
      JSON.stringify({
        hooks: [{ event: "sessionStart", command: "echo hi" }],
      }),
      "utf-8",
    );

    const report = migrateLegacyVaultFiles(vault, copilotHome);
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(vault, ".github", "hooks", "hooks.json"))).toBe(true);
    expect(report.skipped.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `just test -- copilot-migration`
Expected: PASS, full end-to-end coverage.

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/copilot-migration.test.ts
git commit -m "test(cli): add end-to-end migration tests covering full legacy vault layout"
```

---

### Task 10: Rewrite `cli/copilot.ts` to use `COPILOT_HOME`

**Files:**

- Modify: `cli/copilot.ts` (significant rewrite)
- Modify: `cli/__tests__/copilot.test.ts` (rewrite assertions)

This is the main behavior change. We swap all vault writes for `$COPILOT_HOME` writes, change the hook schema to the documented one, and call the migration before spawning.

- [ ] **Step 1: Rewrite the test file with new assertions**

Replace `cli/__tests__/copilot.test.ts` contents with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateCopilotSettings,
  installAutoCommitScript,
  writeCopilotInstructions,
  ensureOnboardingWorkspace,
  cleanupOnboardingWorkspace,
} from "../copilot.js";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-copilot-test-${prefix}-`));
}

describe("generateCopilotSettings (writes to COPILOT_HOME)", () => {
  let copilotHome: string;
  beforeEach(() => {
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("writes settings.json with companyAnnouncements, statusLine, and inline hooks", () => {
    generateCopilotSettings(copilotHome, "/abs/copilot-status.js", "/abs/auto-commit.js");

    const file = path.join(copilotHome, "settings.json");
    expect(fs.existsSync(file)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    expect(Array.isArray(settings["companyAnnouncements"])).toBe(true);
    const sl = settings["statusLine"] as Record<string, unknown>;
    expect(sl["command"]).toContain("/abs/copilot-status.js");
    const hooks = settings["hooks"] as Record<string, Array<{ bash?: string }>>;
    expect(Array.isArray(hooks["sessionEnd"])).toBe(true);
    expect(hooks["sessionEnd"]?.[0]?.bash).toContain("/abs/auto-commit.js");
    // Documented schema uses postToolUse / sessionEnd, not agentStop
    expect(hooks["postToolUse"]).toBeDefined();
    expect(hooks).not.toHaveProperty("agentStop");
  });
});

describe("installAutoCommitScript (writes into COPILOT_HOME/hooks/scripts)", () => {
  let copilotHome: string;
  beforeEach(() => {
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("writes auto-commit.js with the brainkit auto-commit logic", () => {
    const scriptPath = installAutoCommitScript(copilotHome);
    expect(scriptPath).toBe(path.join(copilotHome, "hooks", "scripts", "auto-commit.js"));
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content).toContain("git add -A");
    expect(content).toContain("brainkit: auto-save");
  });
});

describe("writeCopilotInstructions (writes to COPILOT_HOME/copilot-instructions.md)", () => {
  let copilotHome: string;
  beforeEach(() => {
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("writes the system prompt to copilot-instructions.md", () => {
    const config = {
      user: { name: "Test", role: "tester" },
    } as unknown as import("../../core/types.js").BrainkitConfig;
    writeCopilotInstructions(copilotHome, "/some/vault", config);
    const file = path.join(copilotHome, "copilot-instructions.md");
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("Brainkit"); // sanity — system prompt was written
  });
});

describe("ensureOnboardingWorkspace", () => {
  let configDir: string;
  beforeEach(() => {
    configDir = tmp("config");
  });
  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("creates onboarding directory with AGENTS.md", () => {
    const dir = ensureOnboardingWorkspace(configDir);
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(true);
  });

  // (existing onboarding tests preserved verbatim — see git history)
});

describe("cleanupOnboardingWorkspace", () => {
  let configDir: string;
  beforeEach(() => {
    configDir = tmp("config");
  });
  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("removes onboarding dir when present", () => {
    const od = path.join(configDir, "onboarding");
    fs.mkdirSync(od, { recursive: true });
    fs.writeFileSync(path.join(od, "AGENTS.md"), "x", "utf-8");
    cleanupOnboardingWorkspace(configDir);
    expect(fs.existsSync(od)).toBe(false);
  });
});
```

(NOTE: the existing `updateGitignore` and `installCopilotHooks` describe blocks are removed entirely; their replacements are above. Onboarding tests stay as-is.)

- [ ] **Step 2: Run tests, verify they fail**

Run: `just test -- copilot.test`
Expected: FAIL — `generateCopilotSettings` signature changed, `installAutoCommitScript` doesn't exist, `writeCopilotInstructions` doesn't exist, `installCopilotHooks` and `updateGitignore` removed.

- [ ] **Step 3: Rewrite `cli/copilot.ts`**

Replace the file's contents (lines 1-221 currently). Key changes:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnHarness } from "./spawn.js";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  buildSystemPrompt,
  buildOnboardingPrompt,
  getConfigDir,
  getCopilotConfigDir,
} from "../core/index.js";
import { installSkills } from "./install-skills.js";
import { migrateLegacyVaultFiles, formatMigrationNotice } from "./copilot-migration.js";
import { version } from "./version.js";
import * as p from "@clack/prompts";

// (findPackageRoot helper unchanged from current file lines 20-34)

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const COMPANY_ANNOUNCEMENTS = [
  "mention an accomplishment and I'll offer to capture it",
  "I can create meeting notes from any conversation",
  "ask me about your vault stats",
  "I can search your vault for anything",
  "I organize using the PARA method",
  "I'll remind you if your bragfile gets stale",
  "ask me to check vault health",
];

export function generateCopilotSettings(
  copilotHome: string,
  statusScriptAbsPath: string,
  autoCommitScriptAbsPath: string,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });

  const settings = {
    companyAnnouncements: COMPANY_ANNOUNCEMENTS,
    statusLine: {
      type: "command",
      command: `node ${statusScriptAbsPath.replace(/\\/g, "/")}`,
    },
    hooks: {
      // Documented Copilot CLI hook events: sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse, errorOccurred
      // Inline hooks at user level use `bash`/`powershell` keys (NOT `command`).
      postToolUse: [
        {
          type: "command",
          bash: `node "${autoCommitScriptAbsPath.replace(/\\/g, "/")}"`,
          timeoutSec: 10,
        },
      ],
      sessionEnd: [
        {
          type: "command",
          bash: `node "${autoCommitScriptAbsPath.replace(/\\/g, "/")}"`,
          timeoutSec: 10,
        },
      ],
    },
    version: 1,
  };

  fs.writeFileSync(path.join(copilotHome, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Auto-commit hook script
// ---------------------------------------------------------------------------

const AUTO_COMMIT_SCRIPT = `#!/usr/bin/env node
const { execSync } = require("child_process");
const cwd = process.env.BRAINKIT_VAULT_PATH || process.cwd();
try { execSync("git rev-parse --git-dir", { stdio: "pipe", cwd }); } catch { process.exit(0); }
const status = execSync("git status --porcelain", { stdio: "pipe", cwd }).toString().trim();
if (!status) process.exit(0);
try {
  const date = new Date().toISOString().slice(0, 10);
  execSync("git add -A", { stdio: "pipe", cwd });
  execSync(\`git commit -m "brainkit: auto-save \${date}"\`, { stdio: "pipe", cwd });
} catch { /* commit failed — skip silently */ }
`;

export function installAutoCommitScript(copilotHome: string): string {
  const dir = path.join(copilotHome, "hooks", "scripts");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "auto-commit.js");
  fs.writeFileSync(file, AUTO_COMMIT_SCRIPT, "utf-8");
  return file;
}

// ---------------------------------------------------------------------------
// Instructions (replaces AGENTS.md)
// ---------------------------------------------------------------------------

export function writeCopilotInstructions(
  copilotHome: string,
  vaultPath: string,
  config: ReturnType<typeof readVaultConfigSimple>,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });
  const prompt = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  fs.writeFileSync(path.join(copilotHome, "copilot-instructions.md"), prompt + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Onboarding workspace (unchanged from current file lines 149-166)
// ---------------------------------------------------------------------------

export function ensureOnboardingWorkspace(configDir: string): string {
  const onboardingDir = path.join(configDir, "onboarding");
  fs.mkdirSync(onboardingDir, { recursive: true });
  const prompt = buildOnboardingPrompt("copilot");
  fs.writeFileSync(path.join(onboardingDir, "AGENTS.md"), prompt + "\n", "utf-8");
  return onboardingDir;
}

export function cleanupOnboardingWorkspace(configDir: string): void {
  const onboardingDir = path.join(configDir, "onboarding");
  try {
    fs.rmSync(onboardingDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Launch orchestrator
// ---------------------------------------------------------------------------

export function launchCopilot(args: string[], selectedVaultPath?: string): void {
  const configDir = getConfigDir();
  const copilotHome = getCopilotConfigDir();
  let vaultPath = selectedVaultPath;

  if (vaultPath === undefined) {
    const globalConfig = readGlobalConfig();
    if (globalConfig === null || !globalConfig.brain_path) {
      // Onboarding path — unchanged
      const onboardingDir = ensureOnboardingWorkspace(configDir);
      p.outro("Starting onboarding...");
      const child = spawnHarness("copilot", ["-i", "--allow-all", "Let's set up my first brainkit vault!", ...args], {
        stdio: "inherit",
        cwd: onboardingDir,
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    vaultPath = globalConfig.brain_path;
  }

  // Clean up onboarding workspace from a previous first run
  cleanupOnboardingWorkspace(configDir);

  // Migrate legacy vault files BEFORE writing new config — so Copilot doesn't load stale files on this launch
  const report = migrateLegacyVaultFiles(vaultPath, copilotHome);
  const notice = formatMigrationNotice(report);
  if (notice !== "") {
    // Print using process.stdout (clack p.note prints a styled box; use it for consistency)
    p.note(notice.split("\n").slice(1, -1).join("\n").replace(/^│\s?/gm, ""), "brainkit update");
  }

  const config = readVaultConfigSimple(vaultPath);

  // Resolve absolute paths for status script and auto-commit script
  const packageRoot = findPackageRoot();
  const statusScriptPath = path.join(packageRoot, "dist", "cli", "copilot-status.js");

  // Install brainkit-owned files into COPILOT_HOME
  const skillsTargetDir = path.join(copilotHome, "skills", "brainkit");
  installSkills({ skillsSourceDir: path.join(packageRoot, "skills"), targetDir: skillsTargetDir, version });

  writeCopilotInstructions(copilotHome, vaultPath, config);
  const autoCommitScriptPath = installAutoCommitScript(copilotHome);
  generateCopilotSettings(copilotHome, statusScriptPath, autoCommitScriptPath);

  // Spawn copilot pointed at our isolated config
  const env = {
    ...process.env,
    COPILOT_HOME: copilotHome,
    BRAINKIT_VAULT_PATH: vaultPath,
  };
  const child = spawnHarness("copilot", args, { stdio: "inherit", cwd: vaultPath, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

NOTE: drop the `updateGitignore`, `installCopilotHooks`, and `writeAgentsMd` exports entirely. They're replaced by the new functions above.

- [ ] **Step 4: Run all tests**

Run: `just test`
Expected: PASS — all updated tests green; migration tests still green; cross-platform tests still green.

- [ ] **Step 5: Run typecheck and lint**

Run: `just lint`
Expected: no errors. Fix any TypeScript issues (e.g., import types).

- [ ] **Step 6: Commit**

```bash
git add cli/copilot.ts cli/__tests__/copilot.test.ts
git commit -m "feat(cli): isolate Copilot CLI config in COPILOT_HOME; switch to documented hook schema"
```

---

### Task 11: Add isolation regression test

**Files:**

- Modify: `cli/__tests__/copilot.test.ts`

This test enforces the AGENTS.md "Harness Config Isolation" rule — `launchCopilot` must never write under `vaultPath`.

- [ ] **Step 1: Write the test**

Append to `cli/__tests__/copilot.test.ts`:

```typescript
describe("isolation invariant — no writes under vaultPath", () => {
  let vault: string;
  let copilotHome: string;

  beforeEach(() => {
    vault = tmp("vault");
    copilotHome = tmp("home");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(copilotHome, { recursive: true, force: true });
  });

  it("after running write functions, no brainkit files exist in vaultPath", () => {
    // Simulate a launch by calling each write function
    writeCopilotInstructions(copilotHome, vault, {
      user: { name: "x", role: "y" },
    } as unknown as import("../../core/types.js").BrainkitConfig);
    const script = installAutoCommitScript(copilotHome);
    generateCopilotSettings(copilotHome, "/abs/copilot-status.js", script);

    // Vault must be untouched
    const vaultEntries = fs.readdirSync(vault);
    expect(vaultEntries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify pass**

Run: `just test -- copilot.test`
Expected: PASS — the new functions write only to `copilotHome`, not `vault`.

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/copilot.test.ts
git commit -m "test(cli): regression test enforcing isolation — no vault writes from launch helpers"
```

---

### Task 12: Update spec — `specs/10-copilot-cli.md`

**Files:**

- Modify: `specs/10-copilot-cli.md`

- [ ] **Step 1: Read the current spec**

Open `specs/10-copilot-cli.md`. The sections that need rewriting are:

- "AGENTS.md generation" (lines 102-110)
- "Hooks" (lines 112-159)
- "Visual touches" → "companyAnnouncements" and "statusLine" subsections (lines 161-204)
- ".gitignore handling" (lines 206-219)
- The mental-model summary table near the bottom (around lines 240-260)

- [ ] **Step 2: Rewrite each section**

Replace "AGENTS.md generation" with a new "System prompt via copilot-instructions.md" section explaining that brainkit writes the system prompt to `$COPILOT_HOME/copilot-instructions.md`, not into the vault. Note that `AGENTS.md` is no longer used (it's not loaded from `$COPILOT_HOME` anyway, per smoke-test findings; the docs only document `copilot-instructions.md` at user level).

Replace "Hooks" with a new section explaining inline hooks in `$COPILOT_HOME/settings.json` using documented events (`postToolUse`, `sessionEnd`) and the `bash` key. Note the previous `agentStop`/`command` shape was undocumented and likely wasn't firing.

Update "Visual touches" subsections to reference `$COPILOT_HOME/settings.json` instead of `<vault>/.github/copilot/settings.json`.

Delete the ".gitignore handling" section entirely — irrelevant now that nothing is written to the vault.

Add a new section near the top (after "Goal"): **"Isolation via COPILOT_HOME"** explaining the env var, the directory structure, and that this matches the OpenCode isolation pattern.

Update the mental-model table to point to `$COPILOT_HOME` paths for everything brainkit-owned.

- [ ] **Step 3: Commit**

```bash
git add specs/10-copilot-cli.md
git commit -m "docs(specs): rewrite Copilot CLI spec for COPILOT_HOME isolation"
```

---

### Task 13: Update `AGENTS.md` § Harness Config Isolation

**Files:**

- Modify: `AGENTS.md` (this repo's, line 163 area)

- [ ] **Step 1: Update the Copilot CLI bullet**

Find this line in `AGENTS.md`:

```markdown
- **Copilot CLI**: only write inside the brainkit-owned vault directory (`.github/copilot/`, `.github/hooks/`, `.agents/skills/brainkit/`, `AGENTS.md`, `.gitignore`). Never read or write the user's global Copilot config (e.g. `~/.config/github-copilot/`).
```

Replace with:

```markdown
- **Copilot CLI**: launch with `COPILOT_HOME` env var pointing at `~/.config/brainkit/copilot/`. Never read, write, or merge into `~/.copilot/` (the user's global Copilot config). Never write inside the vault except the user's own brainkit content. Skills, instructions (`copilot-instructions.md`), hooks, and settings all live in the brainkit-owned config directory. A migration step removes legacy vault-resident artifacts from prior brainkit versions.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents.md): document Copilot CLI isolation via COPILOT_HOME"
```

---

### Task 14: Add CHANGELOG entry

**Files:**

- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add entry under the unreleased section**

Add at the top of the unreleased section (or create one):

```markdown
- Copilot CLI: brainkit no longer writes files into your vault. Skills, instructions, and hooks now live in a dedicated config directory (`~/.config/brainkit/copilot/`). Existing vaults are auto-cleaned on first launch, with a clear notice listing what was removed.
- Copilot CLI: fixed hook configuration to use the documented schema (`bash` key, `postToolUse`/`sessionEnd` events). Auto-commit hooks may not have been firing in prior versions.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note Copilot CLI isolation migration and hook schema fix"
```

---

### Task 15: Manual smoke test before merging

**Files:** none (manual verification)

- [ ] **Step 1: Build and link locally**

```bash
just build-cli
```

- [ ] **Step 2: Set up a test vault with simulated legacy files**

```bash
TEST_VAULT=/tmp/brainkit-real-vault
rm -rf "$TEST_VAULT"
mkdir -p "$TEST_VAULT"
cd "$TEST_VAULT" && git init -q
echo '[user]\nname = "Tester"\nrole = "tester"' > "$TEST_VAULT/brainkit.toml"
mkdir -p "$TEST_VAULT/01_projects" "$TEST_VAULT/02_areas" "$TEST_VAULT/03_resources" "$TEST_VAULT/04_archive"

# Plant legacy files
mkdir -p "$TEST_VAULT/.agents/skills/brainkit"
echo "0.5.0" > "$TEST_VAULT/.agents/skills/brainkit/.brainkit-version"
mkdir -p "$TEST_VAULT/.github/hooks/scripts" "$TEST_VAULT/.github/copilot"
echo '{"hooks":[{"event":"agentStop","command":"node .github/hooks/scripts/auto-commit.js"}]}' > "$TEST_VAULT/.github/hooks/hooks.json"
echo "// brainkit auto-commit" > "$TEST_VAULT/.github/hooks/scripts/auto-commit.js"
echo '{"companyAnnouncements":["x"],"statusLine":{"command":"node /x.js"}}' > "$TEST_VAULT/.github/copilot/settings.json"
printf "## Brainkit\n\nBrainkit is a personal second brain ... legacy\n" > "$TEST_VAULT/AGENTS.md"
printf "node_modules/\n\n# brainkit — generated files\n.agents/skills/brainkit/\n.github/hooks/\n.github/copilot/\n" > "$TEST_VAULT/.gitignore"
```

- [ ] **Step 2: Point brainkit at the test vault and launch**

```bash
mkdir -p ~/.config/brainkit
echo 'brain_path = "/tmp/brainkit-real-vault"' > ~/.config/brainkit/config.toml
# Make sure no marker file exists from a previous run
rm -f ~/.config/brainkit/copilot/.brainkit-migration-v1

node ./dist/cli/index.js copilot
```

- [ ] **Step 3: Verify migration notice appears, vault is clean**

After Copilot prompts you, observe the migration notice in the terminal. Then in a separate terminal:

```bash
ls -la /tmp/brainkit-real-vault/
# Expect: .git/, brainkit.toml, 01_projects/, 02_areas/, 03_resources/, 04_archive/, .gitignore
# Should NOT see: .agents/, .github/, AGENTS.md
cat /tmp/brainkit-real-vault/.gitignore
# Should contain "node_modules/" and NOT contain "brainkit"

ls -la ~/.config/brainkit/copilot/
# Expect: copilot-instructions.md, settings.json, skills/brainkit/, hooks/scripts/auto-commit.js, .brainkit-migration-v1
```

- [ ] **Step 4: Inside Copilot, verify the agent loaded the brainkit prompt**

Type something like: "What is brainkit?" — the agent should respond with knowledge from the system prompt.

- [ ] **Step 5: Verify the auto-commit hook fires**

Inside Copilot, ask: "Create a test file at 02_areas/test.md with content 'hello'." After it completes, exit Copilot. Then:

```bash
cd /tmp/brainkit-real-vault && git log --oneline
# Should show: brainkit: auto-save YYYY-MM-DD
```

- [ ] **Step 6: Re-launch and verify migration is no-op**

```bash
node ./dist/cli/index.js copilot
# Migration notice should NOT appear (marker file present)
```

- [ ] **Step 7: Cleanup**

```bash
rm -rf /tmp/brainkit-real-vault ~/.config/brainkit/copilot
# Restore your real brainkit config if you replaced it for testing
```

- [ ] **Step 8: If everything passes, no commit needed — ready to merge.**

---

## Self-Review Checklist

Before merging:

- [ ] All tests pass (`just check`)
- [ ] `just lint` and `just format` clean
- [ ] Manual smoke test (Task 15) passes
- [ ] No new dependencies added
- [ ] Cross-platform: file paths use `path.join`, no hardcoded `/` or `\`
- [ ] Migration tests cover: clean vault, full legacy vault, partial vault, user-modified files, marker idempotency, symlinks (rejection), invalid JSON, parse errors
- [ ] Notice formatting tested
- [ ] Spec and AGENTS.md updated to match new behavior
- [ ] CHANGELOG entry is user-facing (not implementation detail)
- [ ] No vault writes occur during `launchCopilot` (regression test enforces this)

## Verification commands (final)

```bash
just check       # lint + format check + test
just test -- copilot-migration   # migration suite specifically
just test -- copilot.test        # main copilot suite
just test -- cross-platform      # platform helpers
```
