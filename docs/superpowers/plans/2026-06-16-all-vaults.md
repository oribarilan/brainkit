# All-Vaults Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "all vaults" mode that loads context from every vault into a single session with per-vault identity blocks, shared conventions, and write-routing instructions.

**Architecture:** CLI gains `--vault all` and a picker option. `selectVault` returns a `VaultSelection` discriminated union; `Harness.launch` accepts a `LaunchTarget`. The plugin resolves vault context via `resolveVaultContext()` (core function), dispatches to `buildMultiVaultPrompt` or `buildSystemPrompt` based on mode. Auto-commit refactored to per-vault `Map<string, Timer>`. Only OpenCode supports all-vaults initially; Copilot/Claude error cleanly.

**Tech Stack:** TypeScript (strict, ESM), vitest for tests, Node built-ins. No new dependencies.

**Spec:** `.todo/US-all-vaults/main.md`

**Test command:** `npx vitest run`

---

## File Structure

| Action | File                                    | Responsibility                                                                                                |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Modify | `core/types.ts`                         | Add `VaultContext` discriminated union type                                                                   |
| Modify | `core/auto-commit.ts`                   | Refactor singleton timer to `Map<string, Timer>`                                                              |
| Create | `core/vault-context.ts`                 | `resolveVaultContext()` function                                                                              |
| Modify | `core/system-prompt.ts`                 | Add `buildMultiVaultPrompt`, export it                                                                        |
| Modify | `core/prompt-sections.ts`               | Add multi-vault section builders                                                                              |
| Modify | `core/index.ts`                         | Export new types and functions                                                                                |
| Modify | `cli/launch.ts`                         | `VaultSelection`, `LaunchTarget`, `Harness` interface, `selectVault`, picker, reserved name, `launchOpenCode` |
| Modify | `cli/index.ts`                          | Map `VaultSelection` to `LaunchTarget`, pass through                                                          |
| Modify | `cli/copilot.ts`                        | Gate `launchCopilot` on `target.mode !== "all"`                                                               |
| Modify | `cli/claude.ts`                         | Gate `launchClaude` on `target.mode !== "all"`                                                                |
| Modify | `opencode/server.ts`                    | Use `resolveVaultContext`, dispatch hooks by mode                                                             |
| Modify | `opencode/side.tsx`                     | Show "All vaults" label when `BRAINKIT_ALL_VAULTS` set                                                        |
| Create | `core/__tests__/auto-commit.test.ts`    | Tests for per-vault timer map                                                                                 |
| Create | `core/__tests__/vault-context.test.ts`  | Tests for `resolveVaultContext`                                                                               |
| Modify | `core/__tests__/system-prompt.test.ts`  | Tests for `buildMultiVaultPrompt`                                                                             |
| Modify | `cli/__tests__/vault-selection.test.ts` | Tests for `VaultSelection`, `--vault all`, picker                                                             |
| Modify | `cli/__tests__/launch.test.ts`          | Tests for `LaunchTarget` env var contract                                                                     |

## Dependency Graph

```
Task 1 (types + auto-commit) ──┬──> Task 2 (core builders)     ──┐
                                └──> Task 3 (CLI refactor)        ├──> Task 4 (plugin wiring)
                                                                  ┘
```

Tasks 2 and 3 are independent and can be parallelized.

---

### Task 1: Foundation Types + Auto-Commit Refactor

**Files:**

- Modify: `core/types.ts`
- Modify: `core/auto-commit.ts`
- Modify: `core/index.ts`
- Create: `core/__tests__/auto-commit.test.ts`
- Test: `npx vitest run core/__tests__/auto-commit.test.ts`

#### 1a. Add VaultContext type

- [ ] **Step 1: Add VaultContext to core/types.ts**

Add after the `HealthCheckResult` interface:

```typescript
export type VaultContext =
  | { mode: "single"; vaultPath: string }
  | { mode: "all"; vaults: Array<{ name: string; path: string; config: BrainkitConfig }> }
  | { mode: "none" };
```

- [ ] **Step 2: Export VaultContext from core/index.ts**

Add `VaultContext` to the type export from `./types.js`:

```typescript
export type {
  BrainkitGlobalConfig,
  BrainkitConfig,
  BragEntry,
  BragStats,
  Contact,
  HealthCheckResult,
  VaultContext,
} from "./types.js";
```

#### 1b. Refactor auto-commit to per-vault Map

- [ ] **Step 3: Write failing tests for per-vault auto-commit**

Create `core/__tests__/auto-commit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../git.js", () => ({
  isGitRepo: vi.fn(() => true),
}));

// Mock child_process and fs before importing the module
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => ""),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}));

import { scheduleAutoCommit, flushAutoCommit, flushAllAutoCommits } from "../auto-commit.js";
import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

describe("auto-commit per-vault timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExecSync.mockReset();
    // Default: report uncommitted changes
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("status --porcelain")) return Buffer.from("M file.md\n");
      return Buffer.from("");
    });
  });

  afterEach(() => {
    // Flush any lingering timers to avoid test bleed
    flushAllAutoCommits();
    vi.useRealTimers();
  });

  it("schedules independent timers for different vault paths", () => {
    scheduleAutoCommit("/vault/a");
    scheduleAutoCommit("/vault/b");

    vi.advanceTimersByTime(30_000);

    // Both vaults should have their changes committed (git add + git commit each)
    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls.length).toBe(2);
  });

  it("does not cancel vault A timer when vault B is scheduled", () => {
    scheduleAutoCommit("/vault/a");
    vi.advanceTimersByTime(15_000); // halfway

    scheduleAutoCommit("/vault/b");
    vi.advanceTimersByTime(15_000); // A fires at 30s

    const commitCallsA = mockExecSync.mock.calls.filter(
      ([cmd, opts]) =>
        typeof cmd === "string" && cmd.includes("git commit") && (opts as { cwd?: string })?.cwd === "/vault/a",
    );
    expect(commitCallsA.length).toBe(1);
  });

  it("flushAllAutoCommits commits all tracked vaults immediately", () => {
    scheduleAutoCommit("/vault/a");
    scheduleAutoCommit("/vault/b");

    flushAllAutoCommits();

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls.length).toBe(2);
  });

  it("flushAutoCommit still works for single vault", () => {
    scheduleAutoCommit("/vault/a");

    flushAutoCommit("/vault/a");

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd, opts]) =>
        typeof cmd === "string" && cmd.includes("git commit") && (opts as { cwd?: string })?.cwd === "/vault/a",
    );
    expect(commitCalls.length).toBe(1);
  });

  it("reschedules same vault (debounce reset)", () => {
    scheduleAutoCommit("/vault/a");
    vi.advanceTimersByTime(20_000);
    scheduleAutoCommit("/vault/a"); // resets debounce
    vi.advanceTimersByTime(20_000); // 20s after reschedule, not 30s total

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls.length).toBe(0); // not yet

    vi.advanceTimersByTime(10_000); // now at 30s after reschedule
    const commitCalls2 = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls2.length).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run core/__tests__/auto-commit.test.ts`
Expected: FAIL — `flushAllAutoCommits` is not exported, per-vault timer behavior doesn't match.

- [ ] **Step 5: Refactor auto-commit.ts to per-vault Map**

Replace `core/auto-commit.ts`:

```typescript
import { execSync } from "node:child_process";
import * as fs from "node:fs";

import { isGitRepo } from "./git.js";

// ---------------------------------------------------------------------------
// Debounced vault auto-commit (per-vault timers)
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 30_000; // 30 seconds

const commitTimers = new Map<string, ReturnType<typeof setTimeout>>();

function hasUncommittedChanges(vaultPath: string): boolean {
  try {
    const status = execSync("git status --porcelain", { cwd: vaultPath, stdio: "pipe" }).toString().trim();
    return status !== "";
  } catch {
    return false;
  }
}

function commitChanges(vaultPath: string): void {
  try {
    const date = new Date().toISOString().slice(0, 10);
    execSync("git add -A", { cwd: vaultPath, stdio: "pipe" });
    execSync(`git commit -m "brainkit: auto-save ${date}"`, { cwd: vaultPath, stdio: "pipe" });
  } catch {
    // Commit failed (nothing to commit, or git error) — skip silently
  }
}

export function scheduleAutoCommit(vaultPath: string): void {
  if (!fs.existsSync(vaultPath)) return;
  if (!isGitRepo(vaultPath)) return;

  // Clear existing timer for THIS vault — restart its debounce window
  const existing = commitTimers.get(vaultPath);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    if (hasUncommittedChanges(vaultPath)) {
      commitChanges(vaultPath);
    }
    commitTimers.delete(vaultPath);
  }, DEBOUNCE_MS);

  commitTimers.set(vaultPath, timer);
}

export function flushAutoCommit(vaultPath: string): void {
  // Called on session shutdown for a specific vault — commit immediately if pending
  const timer = commitTimers.get(vaultPath);
  if (timer !== undefined) {
    clearTimeout(timer);
    commitTimers.delete(vaultPath);
  }

  if (fs.existsSync(vaultPath) && isGitRepo(vaultPath) && hasUncommittedChanges(vaultPath)) {
    commitChanges(vaultPath);
  }
}

export function flushAllAutoCommits(): void {
  // Flush all tracked vaults — used in multi-vault mode on session shutdown
  for (const [vaultPath, timer] of commitTimers) {
    clearTimeout(timer);
    if (fs.existsSync(vaultPath) && isGitRepo(vaultPath) && hasUncommittedChanges(vaultPath)) {
      commitChanges(vaultPath);
    }
  }
  commitTimers.clear();
}
```

- [ ] **Step 6: Export flushAllAutoCommits from core/index.ts**

Update the auto-commit export line:

```typescript
export { scheduleAutoCommit, flushAutoCommit, flushAllAutoCommits } from "./auto-commit.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run core/__tests__/auto-commit.test.ts`
Expected: All tests PASS.

- [ ] **Step 8: Run full test suite for regressions**

Run: `npx vitest run`
Expected: All tests PASS. The single-vault code path is unaffected (one entry in the map behaves identically to the old singleton).

- [ ] **Step 9: Commit**

```bash
git add core/types.ts core/auto-commit.ts core/index.ts core/__tests__/auto-commit.test.ts
git commit -m "feat: add VaultContext type and refactor auto-commit to per-vault timers"
```

---

### Task 2: Core Multi-Vault Builders

**Files:**

- Create: `core/vault-context.ts`
- Modify: `core/system-prompt.ts`
- Modify: `core/prompt-sections.ts`
- Modify: `core/index.ts`
- Create: `core/__tests__/vault-context.test.ts`
- Modify: `core/__tests__/system-prompt.test.ts`
- Test: `npx vitest run core/__tests__/vault-context.test.ts core/__tests__/system-prompt.test.ts`

**Can run in parallel with Task 3** (no shared file modifications except `core/index.ts` exports, which are additive).

#### 2a. resolveVaultContext

- [ ] **Step 1: Write failing tests for resolveVaultContext**

Create `core/__tests__/vault-context.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../vault.js", () => ({
  readGlobalConfig: vi.fn(),
  discoverVaults: vi.fn(),
  readVaultConfigSimple: vi.fn(),
}));

import { resolveVaultContext } from "../vault-context.js";
import { readGlobalConfig, discoverVaults, readVaultConfigSimple } from "../vault.js";
import type { BrainkitConfig } from "../types.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);
const mockDiscoverVaults = vi.mocked(discoverVaults);
const mockReadVaultConfigSimple = vi.mocked(readVaultConfigSimple);

function makeConfig(name = "Test"): BrainkitConfig {
  return { version: 1, user: { name, role: "Engineer" } };
}

describe("resolveVaultContext", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns single mode when BRAINKIT_VAULT_PATH is set", () => {
    process.env.BRAINKIT_VAULT_PATH = "/brain/work";
    delete process.env.BRAINKIT_ALL_VAULTS;

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/work" });
  });

  it("returns all mode when BRAINKIT_ALL_VAULTS=1", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work", "personal"]);
    mockReadVaultConfigSimple.mockImplementation((vaultPath: string) => {
      if (vaultPath.endsWith("work")) return makeConfig("WorkUser");
      if (vaultPath.endsWith("personal")) return makeConfig("PersonalUser");
      return makeConfig();
    });

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
    if (ctx.mode === "all") {
      expect(ctx.vaults).toHaveLength(2);
      expect(ctx.vaults[0]?.name).toBe("work");
      expect(ctx.vaults[1]?.name).toBe("personal");
    }
  });

  it("BRAINKIT_ALL_VAULTS takes precedence over BRAINKIT_VAULT_PATH", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    process.env.BRAINKIT_VAULT_PATH = "/brain/work";

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work"]);
    mockReadVaultConfigSimple.mockReturnValue(makeConfig());

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
  });

  it("skips vaults with unreadable configs (warns, does not abort)", () => {
    process.env.BRAINKIT_ALL_VAULTS = "1";
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["good", "bad"]);
    mockReadVaultConfigSimple.mockImplementation((vaultPath: string) => {
      if (vaultPath.endsWith("bad")) throw new Error("TOML parse error");
      return makeConfig();
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("all");
    if (ctx.mode === "all") {
      expect(ctx.vaults).toHaveLength(1);
      expect(ctx.vaults[0]?.name).toBe("good");
    }
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns none when no env vars and multiple vaults", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["work", "personal"]);

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("none");
  });

  it("auto-selects single vault in fallback (no env vars, 1 vault)", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "/brain" });
    mockDiscoverVaults.mockReturnValue(["only"]);

    const ctx = resolveVaultContext();
    expect(ctx).toEqual({ mode: "single", vaultPath: "/brain/only" });
  });

  it("returns none when no global config", () => {
    delete process.env.BRAINKIT_ALL_VAULTS;
    delete process.env.BRAINKIT_VAULT_PATH;

    mockReadGlobalConfig.mockReturnValue(null);

    const ctx = resolveVaultContext();
    expect(ctx.mode).toBe("none");
  });
});
```

- [ ] **Step 2: Implement resolveVaultContext**

Create `core/vault-context.ts`:

```typescript
import * as path from "node:path";
import * as os from "node:os";

import { readGlobalConfig, discoverVaults, readVaultConfigSimple } from "./vault.js";
import type { VaultContext } from "./types.js";

/**
 * Resolve the current vault context from environment variables and global config.
 *
 * Resolution order:
 * 1. BRAINKIT_ALL_VAULTS=1 -> multi-vault mode (reads brain_path from global config)
 * 2. BRAINKIT_VAULT_PATH -> single vault mode
 * 3. Fallback: auto-select if 1 vault, else none
 */
export function resolveVaultContext(): VaultContext {
  // 1. All-vaults mode (takes precedence)
  if (process.env.BRAINKIT_ALL_VAULTS === "1") {
    try {
      const globalConfig = readGlobalConfig();
      if (!globalConfig?.brain_path) return { mode: "none" };

      const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
      const vaultNames = discoverVaults(brainPath);

      const vaults: VaultContext & { mode: "all" } extends { vaults: infer V } ? V : never = [];
      for (const name of vaultNames) {
        const vaultPath = path.join(brainPath, name);
        try {
          const config = readVaultConfigSimple(vaultPath);
          vaults.push({ name, path: vaultPath, config });
        } catch {
          console.warn(`[brainkit] Skipping vault "${name}": config unreadable`);
        }
      }

      if (vaults.length === 0) return { mode: "none" };
      return { mode: "all", vaults };
    } catch {
      return { mode: "none" };
    }
  }

  // 2. Single vault from env var
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return { mode: "single", vaultPath: fromEnv };

  // 3. Fallback discovery
  try {
    const globalConfig = readGlobalConfig();
    if (!globalConfig?.brain_path) return { mode: "none" };

    const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
    const vaults = discoverVaults(brainPath);
    if (vaults.length === 1) return { mode: "single", vaultPath: path.join(brainPath, vaults[0]!) };
  } catch {
    // Can't resolve
  }

  return { mode: "none" };
}
```

Wait — the `vaults` type extraction is awkward. Let me simplify:

```typescript
import * as path from "node:path";
import * as os from "node:os";

import { readGlobalConfig, discoverVaults, readVaultConfigSimple } from "./vault.js";
import type { VaultContext, BrainkitConfig } from "./types.js";

/**
 * Resolve the current vault context from environment variables and global config.
 *
 * Resolution order:
 * 1. BRAINKIT_ALL_VAULTS=1 -> multi-vault mode (reads brain_path from global config)
 * 2. BRAINKIT_VAULT_PATH -> single vault mode
 * 3. Fallback: auto-select if 1 vault, else none
 */
export function resolveVaultContext(): VaultContext {
  // 1. All-vaults mode (takes precedence)
  if (process.env.BRAINKIT_ALL_VAULTS === "1") {
    try {
      const globalConfig = readGlobalConfig();
      if (!globalConfig?.brain_path) return { mode: "none" };

      const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
      const vaultNames = discoverVaults(brainPath);

      const vaults: Array<{ name: string; path: string; config: BrainkitConfig }> = [];
      for (const name of vaultNames) {
        const vaultPath = path.join(brainPath, name);
        try {
          const config = readVaultConfigSimple(vaultPath);
          vaults.push({ name, path: vaultPath, config });
        } catch {
          console.warn(`[brainkit] Skipping vault "${name}": config unreadable`);
        }
      }

      if (vaults.length === 0) return { mode: "none" };
      return { mode: "all", vaults };
    } catch {
      return { mode: "none" };
    }
  }

  // 2. Single vault from env var
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return { mode: "single", vaultPath: fromEnv };

  // 3. Fallback discovery
  try {
    const globalConfig = readGlobalConfig();
    if (!globalConfig?.brain_path) return { mode: "none" };

    const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
    const vaults = discoverVaults(brainPath);
    if (vaults.length === 1) return { mode: "single", vaultPath: path.join(brainPath, vaults[0]!) };
  } catch {
    // Can't resolve
  }

  return { mode: "none" };
}
```

- [ ] **Step 3: Export resolveVaultContext from core/index.ts**

Add to `core/index.ts`:

```typescript
// Vault context resolution
export { resolveVaultContext } from "./vault-context.js";
```

- [ ] **Step 4: Run resolveVaultContext tests**

Run: `npx vitest run core/__tests__/vault-context.test.ts`
Expected: All tests PASS.

#### 2b. Multi-vault prompt builder

- [ ] **Step 5: Write failing tests for buildMultiVaultPrompt**

Add to `core/__tests__/system-prompt.test.ts`:

```typescript
import { buildMultiVaultPrompt } from "../system-prompt.js";

function makeVaultEntry(name: string, overrides?: Partial<BrainkitConfig>) {
  return {
    name,
    path: `/brain/${name}`,
    config: {
      version: 1,
      user: { name: "Ori", role: "Staff Engineer", tone: name === "work" ? "direct" : "casual", ...overrides?.user },
      features: { bragfile: true, contacts: false, ...overrides?.features },
      ...overrides,
    } as BrainkitConfig,
  };
}

describe("buildMultiVaultPrompt", () => {
  it("produces per-vault identity blocks with vault names", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("## Vault: work");
    expect(result).toContain("## Vault: personal");
  });

  it("includes multi-vault preamble", () => {
    const vaults = [makeVaultEntry("work")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("multiple brainkit vaults");
  });

  it("includes write routing instructions", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("Write Routing");
  });

  it("includes shared sections only once", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    // Vault Structure and Conventions should appear once
    const structureMatches = result.match(/## Vault Structure/g);
    expect(structureMatches).toHaveLength(1);
  });

  it("includes brainkit sentinel", () => {
    const vaults = [makeVaultEntry("work")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("<!-- brainkit:generated -->");
  });

  it("caps brag reminders at 2", () => {
    // This test verifies the cap logic — actual staleness requires mocked getBragStats
    const vaults = [makeVaultEntry("a"), makeVaultEntry("b"), makeVaultEntry("c")];
    const result = buildMultiVaultPrompt(vaults);
    // Should not have more than 2 individual brag reminder sections
    const reminderMatches = result.match(/bragfile hasn't been updated/g) ?? [];
    expect(reminderMatches.length).toBeLessThanOrEqual(2);
  });

  it("produces tone-neutral conventions section", () => {
    const vaults = [
      makeVaultEntry("work", { user: { name: "Ori", role: "Engineer", tone: "direct" } }),
      makeVaultEntry("personal", { user: { name: "Ori", role: "Engineer", tone: "casual" } }),
    ];
    const result = buildMultiVaultPrompt(vaults);
    // The shared conventions section should not contain a per-vault tone directive
    // (tone is in the per-vault identity blocks instead)
    const conventionsStart = result.indexOf("## Conventions");
    const conventionsEnd = result.indexOf("\n## ", conventionsStart + 1);
    const conventionsSection = result.slice(conventionsStart, conventionsEnd > -1 ? conventionsEnd : undefined);
    expect(conventionsSection).not.toContain("direct tone");
    expect(conventionsSection).not.toContain("casual tone");
  });
});
```

- [ ] **Step 6: Add multi-vault section builders to prompt-sections.ts**

Add these functions to `core/prompt-sections.ts`:

```typescript
// ---------------------------------------------------------------------------
// Multi-vault section builders
// ---------------------------------------------------------------------------

export function buildMultiVaultPreamble(vaults: Array<{ name: string; path: string }>): string {
  const table = vaults.map((v) => `| \`${v.name}\` | \`${v.path}\` |`).join("\n");
  return [
    "## Brainkit — All Vaults",
    "",
    "You have access to multiple brainkit vaults, each a personal second brain organized with the PARA method.",
    "",
    "| Vault | Path |",
    "|-------|------|",
    table,
  ].join("\n");
}

export function buildMultiVaultIdentity(vault: { name: string; path: string; config: BrainkitConfig }): string {
  const ctx: SectionContext = {
    config: vault.config,
    vaultPath: vault.path,
    mode: "cli",
  };
  const tone = vault.config.user.tone ?? "direct";
  return (
    `## Vault: ${vault.name}\n\n` + `Tone for this vault: ${tone}.\n\n` + buildIdentity(ctx).replace(/^## .+\n\n/, "")
  );
}

export function buildMultiVaultKeyFiles(vault: { name: string; path: string; config: BrainkitConfig }): string | null {
  const ctx: SectionContext = {
    config: vault.config,
    vaultPath: vault.path,
    mode: "cli",
  };
  const keyFiles = buildKeyFiles(ctx);
  if (!keyFiles) return null;
  // Replace the generic heading with a vault-scoped one
  return keyFiles.replace("## Key Files", `### Key Files — \`${vault.name}\``);
}

export function buildMultiVaultCustomRules(vault: {
  name: string;
  path: string;
  config: BrainkitConfig;
}): string | null {
  const ctx: SectionContext = {
    config: vault.config,
    vaultPath: vault.path,
    mode: "cli",
  };
  const rules = buildCustomRules(ctx);
  if (!rules) return null;
  return rules.replace("## Custom Rules", `### Custom Rules — \`${vault.name}\``);
}

export function buildConventionsToneNeutral(): string {
  return [
    "## Conventions",
    "",
    "- Directory names: lowercase with hyphens (e.g., `my-project/`)",
    "- File names: lowercase with hyphens (e.g., `meeting-notes.md`)",
    "- `README.md` is the entry point for every directory",
    "- Meeting notes: `YYYY-MM-DD-topic.md`",
    "- Use **bold** for key names, decisions, action items, people",
    "- Use the tone of the vault you are writing into.",
    '- Use first person ("I", "my") — this is a personal vault',
  ].join("\n");
}

export function buildWriteRouting(): string {
  return [
    "## Write Routing",
    "",
    "When writing to the vault, choose the appropriate vault based on the content's context.",
    "Use the tone of the vault you are writing into.",
    "If the correct vault is ambiguous, ask the user which vault to use before writing.",
  ].join("\n");
}

export function buildMultiVaultProjectContext(
  vaults: Array<{ name: string; path: string }>,
  cwd?: string,
): string | null {
  if (cwd === undefined || cwd === "") return null;
  const cwdBasename = path.basename(cwd);
  const matches: Array<{ vaultName: string; readmePath: string }> = [];

  for (const vault of vaults) {
    const projectsDir = path.resolve(vault.path, "01_projects");
    try {
      const entries = fs.readdirSync(projectsDir);
      if (entries.includes(cwdBasename)) {
        matches.push({
          vaultName: vault.name,
          readmePath: path.join(vault.path, "01_projects", cwdBasename, "README.md"),
        });
      }
    } catch {
      // 01_projects doesn't exist in this vault
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const m = matches[0]!;
    return [
      "## Current Project Context",
      "",
      `You are working in a directory that matches the project \`${cwdBasename}\` in vault \`${m.vaultName}\`.`,
      `The project README is at \`${m.readmePath}\`.`,
    ].join("\n");
  }

  // Multiple matches — ambiguity note
  const lines = matches.map((m) => `- \`${m.vaultName}\`: \`${m.readmePath}\``);
  return [
    "## Current Project Context",
    "",
    `You are working in a directory that matches the project \`${cwdBasename}\` in multiple vaults:`,
    ...lines,
    "",
    "Check which vault's project is relevant before making changes.",
  ].join("\n");
}
```

- [ ] **Step 7: Add buildMultiVaultPrompt to system-prompt.ts**

Add to `core/system-prompt.ts`:

```typescript
import {
  // ... existing imports ...
  buildMultiVaultPreamble,
  buildMultiVaultIdentity,
  buildMultiVaultKeyFiles,
  buildMultiVaultCustomRules,
  buildConventionsToneNeutral,
  buildWriteRouting,
  buildMultiVaultProjectContext,
  buildBragReminder,
  buildOnboarding,
  buildProfileNudge,
  buildVaultStructure,
  buildBehavioralRules,
} from "./prompt-sections.js";

export function buildMultiVaultPrompt(
  vaults: Array<{ name: string; path: string; config: BrainkitConfig }>,
  options?: { cwd?: string; mode?: PromptMode },
): string {
  if (vaults.length > 5) {
    console.warn(
      `[brainkit] ${String(vaults.length)} vaults loaded. Prompt size grows linearly; consider using fewer vaults.`,
    );
  }

  // Per-vault identity blocks
  const identityBlocks = vaults.map((v) => buildMultiVaultIdentity(v));

  // Per-vault key files
  const keyFileBlocks = vaults.map((v) => buildMultiVaultKeyFiles(v)).filter(Boolean);

  // Per-vault custom rules
  const customRuleBlocks = vaults.map((v) => buildMultiVaultCustomRules(v)).filter(Boolean);

  // Per-vault brag reminders (capped at 2)
  const bragReminders: string[] = [];
  for (const v of vaults) {
    if (bragReminders.length >= 2) break;
    const ctx: SectionContext = {
      config: v.config,
      vaultPath: v.path,
      mode: options?.mode ?? "cli",
    };
    const reminder = buildBragReminder(ctx);
    if (reminder) bragReminders.push(reminder.replace("## Reminder", `### Reminder — \`${v.name}\``));
  }
  // If more vaults are stale beyond the cap, aggregate
  if (vaults.length > 2) {
    const remainingStale: string[] = [];
    for (let i = 2; i < vaults.length; i++) {
      const v = vaults[i]!;
      const ctx: SectionContext = { config: v.config, vaultPath: v.path, mode: options?.mode ?? "cli" };
      if (buildBragReminder(ctx)) remainingStale.push(v.name);
    }
    if (remainingStale.length > 0) {
      bragReminders.push(`Also stale: ${remainingStale.map((n) => `\`${n}\``).join(", ")}.`);
    }
  }

  // Per-vault onboarding/profile nudge (cap at 1 fresh-vault nudge)
  const onboardingNudges: string[] = [];
  const freshVaults: string[] = [];
  for (const v of vaults) {
    const ctx: SectionContext = { config: v.config, vaultPath: v.path, mode: options?.mode ?? "cli" };
    const onboarding = buildOnboarding(ctx);
    if (onboarding) freshVaults.push(v.name);
    const nudge = buildProfileNudge(ctx);
    if (nudge) onboardingNudges.push(nudge.replace("## Profile Incomplete", `### Profile Incomplete — \`${v.name}\``));
  }
  if (freshVaults.length === 1) {
    onboardingNudges.unshift(
      `## Fresh Vault Detected\n\nVault \`${freshVaults[0]}\` was just set up and has no content yet. Guide the user through their first entries.`,
    );
  } else if (freshVaults.length > 1) {
    onboardingNudges.unshift(
      `## Fresh Vaults Detected\n\nThese vaults are fresh: ${freshVaults.map((n) => `\`${n}\``).join(", ")}. Guide the user through their first entries.`,
    );
  }

  return joinSections([
    BRAINKIT_PROMPT_SENTINEL,
    buildMultiVaultPreamble(vaults),
    ...identityBlocks,
    ...keyFileBlocks,
    buildVaultStructure(),
    buildConventionsToneNeutral(),
    ...customRuleBlocks,
    buildBehavioralRules({ config: vaults[0]!.config, vaultPath: vaults[0]!.path, mode: options?.mode ?? "cli" }),
    buildWriteRouting(),
    buildMultiVaultProjectContext(vaults, options?.cwd),
    ...bragReminders,
    ...onboardingNudges,
  ]);
}
```

- [ ] **Step 8: Update core/index.ts exports**

Add `buildMultiVaultPrompt` to the system prompt export:

```typescript
export { detectProjectContext, buildSystemPrompt, buildMultiVaultPrompt } from "./system-prompt.js";
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run core/__tests__/system-prompt.test.ts core/__tests__/vault-context.test.ts`
Expected: All tests PASS.

- [ ] **Step 10: Commit**

```bash
git add core/vault-context.ts core/system-prompt.ts core/prompt-sections.ts core/index.ts \
  core/__tests__/vault-context.test.ts core/__tests__/system-prompt.test.ts
git commit -m "feat: add resolveVaultContext and buildMultiVaultPrompt"
```

---

### Task 3: CLI All-Vaults Support

**Files:**

- Modify: `cli/launch.ts`
- Modify: `cli/index.ts`
- Modify: `cli/copilot.ts`
- Modify: `cli/claude.ts`
- Modify: `cli/__tests__/vault-selection.test.ts`
- Modify: `cli/__tests__/launch.test.ts`
- Test: `npx vitest run cli/__tests__/vault-selection.test.ts cli/__tests__/launch.test.ts`

**Can run in parallel with Task 2** (no file conflicts).

#### 3a. VaultSelection + LaunchTarget types and selectVault refactor

- [ ] **Step 1: Write failing tests for VaultSelection**

Add to `cli/__tests__/vault-selection.test.ts`:

```typescript
describe("selectVault — all-vaults mode", () => {
  let brainDir: string;

  beforeEach(() => {
    brainDir = mkdtempSync(join(tmpdir(), "brainkit-sv-"));
    mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: brainDir });
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    rmSync(brainDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("--vault all returns { mode: 'all', brainPath }", async () => {
    mockDiscoverVaults.mockReturnValue(["work", "personal"]);
    const result = await selectVault("all");
    expect(result).toEqual({ mode: "all", brainPath: brainDir });
  });

  it("--vault ALL is case-insensitive", async () => {
    mockDiscoverVaults.mockReturnValue(["work"]);
    const result = await selectVault("ALL");
    expect(result).toEqual({ mode: "all", brainPath: brainDir });
  });

  it("--vault all with 0 vaults exits with error", async () => {
    mockDiscoverVaults.mockReturnValue([]);
    await expect(selectVault("all")).rejects.toThrow("process.exit");
    expect(p.cancel).toHaveBeenCalledWith(expect.stringContaining("No vaults found"));
  });

  it("--vault all with 1 vault enters multi-vault mode (no special-casing)", async () => {
    mockDiscoverVaults.mockReturnValue(["only"]);
    const result = await selectVault("all");
    expect(result).toEqual({ mode: "all", brainPath: brainDir });
  });

  it("warns when a vault named 'all' (any case) is discovered", async () => {
    mockDiscoverVaults.mockReturnValue(["all", "work"]);
    await selectVault(null);
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("reserved"));
  });

  it("single vault returns { mode: 'single', vaultPath, brainPath }", async () => {
    mockDiscoverVaults.mockReturnValue(["work"]);
    const result = await selectVault(null);
    expect(result).toEqual({ mode: "single", vaultPath: join(brainDir, "work"), brainPath: brainDir });
  });

  it("no global config returns { mode: 'onboarding' }", async () => {
    mockReadGlobalConfig.mockReturnValue(null);
    const result = await selectVault(null);
    expect(result).toEqual({ mode: "onboarding" });
  });
});
```

- [ ] **Step 2: Add types and refactor selectVault in cli/launch.ts**

Add types near the top of `cli/launch.ts`:

```typescript
export type VaultSelection =
  | { mode: "single"; vaultPath: string; brainPath: string }
  | { mode: "all"; brainPath: string }
  | { mode: "onboarding" };

export type LaunchTarget =
  | { mode: "single"; vaultPath: string }
  | { mode: "all"; brainPath: string }
  | { mode: "onboarding" };
```

Update the `Harness` interface:

```typescript
interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[], target: LaunchTarget) => void;
}
```

Refactor `selectVault` to return `VaultSelection`:

```typescript
const ALL_VAULT_RESERVED = /^all$/i;

export async function selectVault(vaultFlag: string | null): Promise<VaultSelection> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    return { mode: "onboarding" };
  }

  const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
  let vaults: string[];

  try {
    vaults = discoverVaults(brainPath);
  } catch {
    // ... existing missing-brain-dir handling (reset flow) ...
    // On reset success:
    return { mode: "onboarding" };
  }

  // Warn if a vault named "all" exists
  if (vaults.some((v) => ALL_VAULT_RESERVED.test(v))) {
    p.log.warn('"all" is a reserved vault name in brainkit. A vault with this name may conflict with --vault all.');
  }

  // --vault all (case-insensitive reserved name)
  if (vaultFlag !== null && ALL_VAULT_RESERVED.test(vaultFlag)) {
    if (vaults.length === 0) {
      p.cancel("No vaults found. Run brainkit to set up your first vault.");
      process.exit(1);
    }
    return { mode: "all", brainPath };
  }

  // Explicit --vault flag (specific vault name)
  if (vaultFlag !== null) {
    if (!vaults.includes(vaultFlag)) {
      const msg =
        vaults.length > 0
          ? `Vault "${vaultFlag}" not found. Available: ${vaults.join(", ")}`
          : `Vault "${vaultFlag}" not found.`;
      p.cancel(msg);
      process.exit(1);
    }
    return { mode: "single", vaultPath: path.join(brainPath, vaultFlag), brainPath };
  }

  // 0 vaults — fresh brain
  if (vaults.length === 0) {
    return { mode: "single", vaultPath: brainPath, brainPath };
  }

  // 1 vault — auto-select
  if (vaults.length === 1) {
    const single = vaults[0]!;
    return { mode: "single", vaultPath: path.join(brainPath, single), brainPath };
  }

  // 2+ vaults — interactive prompt with "All vaults" option
  const selected = await promptVaultSelection(vaults);
  if (selected === "__all__") {
    return { mode: "all", brainPath };
  }
  return { mode: "single", vaultPath: path.join(brainPath, selected), brainPath };
}
```

Update `promptVaultSelection` to include "All vaults" option:

```typescript
async function promptVaultSelection(vaults: string[]): Promise<string> {
  if (!process.stdin.isTTY) {
    p.cancel("Multiple vaults found. Use --vault <name> to select one.");
    process.exit(1);
  }

  // Filter out vaults named "all" from the picker to avoid visual collision
  const pickerVaults = vaults.filter((v) => !ALL_VAULT_RESERVED.test(v));

  const options = [{ value: "__all__", label: "+ All vaults" }, ...pickerVaults.map((v) => ({ value: v, label: v }))];

  const selected = await p.select({
    message: "Select a vault",
    options,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return selected;
}
```

- [ ] **Step 3: Update launchOpenCode to accept LaunchTarget**

```typescript
function launchOpenCode(args: string[], target: LaunchTarget): void {
  const isOnboarding = target.mode === "onboarding";
  ensureOpenCodeConfig(isOnboarding);

  const configDir = getConfigDir();
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  };

  if (target.mode === "single") {
    env["BRAINKIT_VAULT_PATH"] = target.vaultPath;
  } else if (target.mode === "all") {
    env["BRAINKIT_ALL_VAULTS"] = "1";
  }

  const launchArgs = isOnboarding ? ["--prompt", "Let's set up my first brainkit vault!", ...args] : args;

  const child = spawnHarness("opencode", launchArgs, { stdio: "inherit", env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

- [ ] **Step 4: Update launchHarness and detectAndLaunch for LaunchTarget**

```typescript
export async function launchHarness(alias: string, args: string[], target: LaunchTarget): Promise<void> {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    p.cancel(`Unknown harness: ${alias}`);
    process.exit(1);
  }
  if (!isInstalled(harness.binaries)) {
    p.cancel(`${harness.name} is not installed.`);
    process.exit(1);
  }
  await maybeCheckHarnessVersion(harness.name);
  p.outro(`Launching ${harness.name}...`);
  harness.launch(args, target);
}

export async function detectAndLaunch(args: string[], target: LaunchTarget): Promise<void> {
  // ... same logic as before, but pass target instead of vaultPath ...
  // selected.launch(args, target);
}
```

- [ ] **Step 5: Update cli/index.ts to map VaultSelection -> LaunchTarget**

```typescript
const selection = await selectVault(vaultFlag);

const target: LaunchTarget =
  selection.mode === "single" ? { mode: "single", vaultPath: selection.vaultPath } : selection; // "all" and "onboarding" map directly

// Harness alias — launch explicitly
if (firstArg !== undefined && isHarnessAlias(firstArg)) {
  await launchHarness(firstArg, remaining.slice(1), target);
  return;
}

// No args or unknown — auto-detect and launch
await detectAndLaunch(remaining, target);
```

- [ ] **Step 6: Gate launchCopilot on all-vaults mode**

In `cli/copilot.ts`, change the signature and add gating:

```typescript
export function launchCopilot(args: string[], target: LaunchTarget): void {
  if (target.mode === "all") {
    p.cancel("All-vaults mode is not yet supported for Copilot CLI. Use --vault <name> to pick one.");
    process.exit(1);
  }

  const selectedVaultPath = target.mode === "single" ? target.vaultPath : undefined;
  // ... rest of existing logic using selectedVaultPath ...
}
```

- [ ] **Step 7: Gate launchClaude on all-vaults mode**

In `cli/claude.ts`, change the signature and add gating:

```typescript
export function launchClaude(args: string[], target: LaunchTarget): void {
  if (target.mode === "all") {
    p.cancel("All-vaults mode is not yet supported for Claude Code. Use --vault <name> to pick one.");
    process.exit(1);
  }

  const selectedVaultPath = target.mode === "single" ? target.vaultPath : undefined;
  // ... rest of existing logic using selectedVaultPath ...
}
```

- [ ] **Step 8: Update existing vault-selection tests for new return types**

Existing tests return `{ vaultPath, brainPath }` — update expectations to match `VaultSelection`:

```typescript
// Before: expect(result.vaultPath).toBe(join(brainDir, "work"));
// After:  expect(result).toEqual({ mode: "single", vaultPath: join(brainDir, "work"), brainPath: brainDir });
```

- [ ] **Step 9: Update launch.test.ts source-level isolation tests**

Add a test that verifies `BRAINKIT_ALL_VAULTS` is set in the all-vaults path:

```typescript
it("sets BRAINKIT_ALL_VAULTS on spawned env in all-vaults mode", () => {
  expect(launchSource).toMatch(/BRAINKIT_ALL_VAULTS/);
});
```

- [ ] **Step 10: Run tests**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts cli/__tests__/launch.test.ts`
Expected: All tests PASS.

- [ ] **Step 11: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including copilot and claude tests, which may need minor signature updates).

- [ ] **Step 12: Commit**

```bash
git add cli/launch.ts cli/index.ts cli/copilot.ts cli/claude.ts \
  cli/__tests__/vault-selection.test.ts cli/__tests__/launch.test.ts
git commit -m "feat: CLI all-vaults support with VaultSelection/LaunchTarget types"
```

---

### Task 4: Plugin Wiring

**Files:**

- Modify: `opencode/server.ts`
- Modify: `opencode/side.tsx`
- Test: `npx vitest run` (full suite — changes to server.ts are integration-level)

**Depends on:** Tasks 1, 2, and 3 (uses VaultContext, resolveVaultContext, buildMultiVaultPrompt, flushAllAutoCommits, and LaunchTarget).

- [ ] **Step 1: Update server.ts to use resolveVaultContext**

Replace `resolveVaultPath()` with `resolveVaultContext()` from core:

```typescript
import {
  readVaultConfigSimple,
  buildSystemPrompt,
  buildMultiVaultPrompt,
  buildOnboardingPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
  resolveVaultContext,
  type VaultContext,
} from "../core/index.ts";
```

Remove the old `resolveVaultPath` function entirely.

- [ ] **Step 2: Update system prompt hook for multi-vault dispatch**

```typescript
"experimental.chat.system.transform": async (_input, output) => {
  const ctx = resolveVaultContext();

  if (ctx.mode === "none") {
    const onboardingPrompt = buildOnboardingPrompt("opencode");
    if (!output.system.includes(onboardingPrompt)) {
      output.system.push(onboardingPrompt);
    }
    return;
  }

  if (ctx.mode === "all") {
    const prompt = buildMultiVaultPrompt(ctx.vaults, { mode: "cli" });
    if (!output.system.includes(prompt)) {
      output.system.push(prompt);
    }
    return;
  }

  // Single vault
  try {
    const vaultConfig = readVaultConfigSimple(ctx.vaultPath);
    if (!vaultConfig) return;
    const prompt = buildSystemPrompt(vaultConfig, ctx.vaultPath, { mode: "cli" });
    if (!output.system.includes(prompt)) {
      output.system.push(prompt);
    }
  } catch {
    // Gracefully handle missing vault
  }
},
```

- [ ] **Step 3: Update compaction hook for multi-vault**

```typescript
"experimental.session.compacting": async (_input, output) => {
  const ctx = resolveVaultContext();

  if (ctx.mode === "all") {
    const blocks = ctx.vaults.map((v) => {
      const features = Object.entries(v.config.features ?? {})
        .filter(([, val]) => val)
        .map(([k]) => k)
        .join(", ") || "defaults";
      return [
        `### \`${v.name}\``,
        `- User: ${v.config.user.name} (${v.config.user.role})`,
        `- Path: ${v.path}`,
        `- Features: ${features}`,
        `- Tone: ${v.config.user.tone ?? "direct"}`,
      ].join("\n");
    });
    output.system.push("## Brainkit Vault Context (Condensed — All Vaults)\n" + blocks.join("\n\n"));
    return;
  }

  if (ctx.mode !== "single") return;
  try {
    const vaultConfig = readVaultConfigSimple(ctx.vaultPath);
    if (!vaultConfig) return;
    const vaultName = path.basename(ctx.vaultPath);
    const identity = [
      "## Brainkit Vault Context (Condensed)",
      `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
      `- Vault: ${vaultName} (${ctx.vaultPath})`,
      `- Features: ${
        Object.entries(vaultConfig.features ?? {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "defaults"
      }`,
      `- Tone: ${vaultConfig.user.tone ?? "direct"}`,
    ].join("\n");
    output.system.push(identity);
  } catch {
    // Gracefully handle missing vault
  }
},
```

- [ ] **Step 4: Update session.idle hook for multi-vault auto-commit**

```typescript
"session.idle": async (event, api) => {
  const ctx = resolveVaultContext();

  // Brag detection (unchanged — toast is generic, agent knows routing)
  try {
    const sessionId = event.session?.id;
    if (sessionId && !suggestedSessions.has(sessionId)) {
      const messages = event.messages ?? [];
      for (const msg of messages) {
        if (msg.role === "user" && typeof msg.content === "string") {
          if (containsUserAccomplishment(msg.content)) {
            suggestedSessions.add(sessionId);
            api.tui.showToast({
              variant: "info",
              message: "Sounds like an accomplishment! Consider adding it to your bragfile.",
            });
            break;
          }
        }
      }
    }
  } catch {
    // Gracefully handle errors
  }

  // Auto-commit
  try {
    if (ctx.mode === "single") {
      scheduleAutoCommit(ctx.vaultPath);
    } else if (ctx.mode === "all") {
      for (const vault of ctx.vaults) {
        scheduleAutoCommit(vault.path);
      }
    }
  } catch {
    // Gracefully handle errors
  }
},
```

- [ ] **Step 5: Update side.tsx for all-vaults mode**

```typescript
export const Sidebar = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);

  const vaultPath = process.env.BRAINKIT_VAULT_PATH;
  const isAllVaults = process.env.BRAINKIT_ALL_VAULTS === "1";

  const data = createMemo(() => {
    if (isAllVaults) {
      return { allVaults: true as const };
    }
    if (!vaultPath) return null;
    // ... existing single-vault data logic unchanged ...
  });

  return (
    <box paddingLeft={1} paddingRight={1} flexDirection="column" gap={1}>
      {(() => {
        const d = data();
        if (!d) {
          return <text fg={theme().textMuted}>No vault configured</text>;
        }

        if ("allVaults" in d) {
          return (
            <box flexDirection="column">
              <text fg={theme().primary} bold>
                🧠 All vaults
              </text>
              <text fg={theme().textMuted}>Multi-vault mode</text>
            </box>
          );
        }

        // ... existing single-vault rendering unchanged ...
      })()}
    </box>
  );
};
```

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add opencode/server.ts opencode/side.tsx
git commit -m "feat: wire all-vaults mode in OpenCode plugin"
```

---

## Self-Review Checklist

After implementing all tasks, verify each DoD item from `main.md`:

- [ ] `selectVault` returns `VaultSelection` discriminated union
- [ ] `Harness.launch` accepts `LaunchTarget`
- [ ] `--vault all` sets `BRAINKIT_ALL_VAULTS=1`
- [ ] `--vault all` with Copilot/Claude errors clearly
- [ ] Vault picker shows "All vaults" when 2+ vaults
- [ ] Reserved name "all" is case-insensitive
- [ ] `VaultContext` lives in `core/types.ts`
- [ ] `resolveVaultContext()` returns correct context per env var combo
- [ ] `resolveVaultContext()` skips bad configs
- [ ] `buildMultiVaultPrompt` produces per-vault identity with per-vault tone
- [ ] Compaction emits condensed multi-vault block
- [ ] Auto-commit uses per-vault `Map<string, Timer>`
- [ ] `flushAllAutoCommits` flushes all
- [ ] Brag reminder capped at 2
- [ ] TUI sidebar shows "All vaults" label
- [ ] Edge cases: 0 vaults error, 1 vault, reserved name warning, partial failure
- [ ] Tests cover all criteria
- [ ] Existing single-vault path unaffected
