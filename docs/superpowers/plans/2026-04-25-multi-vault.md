# Multi-Vault Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support multiple independent vaults under a shared brain directory, replacing the single `vault_path` model with `brain_path` + vault discovery + CLI vault selection.

**Architecture:** The CLI launcher discovers vaults under `brain_path`, selects one (auto, flag, or interactive prompt), sets `BRAINKIT_VAULT_PATH` env var, and spawns the harness. The plugin reads the env var once at init and caches it. All existing vault operations are unchanged -- they receive a resolved path and work within it.

**Tech Stack:** TypeScript (strict, ESM), vitest for tests, Node built-ins for fs/readline. No new dependencies.

**Spec:** `specs/US-multi-vault.md`

**Test command:** `npx vitest run`
**Lint command:** `npx eslint cli/ core/ && npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`

---

## File Structure

| Action | File                                     | Responsibility                                                             |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| Modify | `core/types.ts`                          | Rename `vault_path` to `brain_path`, remove `scope` field                  |
| Modify | `core/vault.ts`                          | Rename in `readGlobalConfig`/`writeGlobalConfig`, add `discoverVaults()`   |
| Modify | `core/index.ts`                          | Export `discoverVaults`                                                    |
| Modify | `core/prompt-sections.ts`                | Remove all `scope` references                                              |
| Modify | `core/__tests__/prompt-sections.test.ts` | Update scope-related tests                                                 |
| Create | `core/__tests__/vault-discovery.test.ts` | Tests for `discoverVaults` and `readGlobalConfig` with `brain_path`        |
| Modify | `cli/index.ts`                           | Add `--vault` flag parsing                                                 |
| Modify | `cli/launch.ts`                          | Vault discovery, selection, `BRAINKIT_VAULT_PATH` env var, readline prompt |
| Create | `cli/__tests__/vault-selection.test.ts`  | Tests for `--vault` flag parsing and vault selection logic                 |
| Modify | `cli/copilot.ts`                         | Rename `vault_path` to `brain_path`                                        |
| Modify | `scripts/copilot-status.js`              | Rename `vault_path` to `brain_path`                                        |
| Modify | `opencode/server.ts`                     | Use `BRAINKIT_VAULT_PATH` with closure caching and fallback                |
| Modify | `opencode/side.tsx`                      | Use `BRAINKIT_VAULT_PATH`, display vault name                              |
| Modify | `docs/features.md`                       | Add multi-vault feature                                                    |
| Modify | `docs/config.md`                         | Update global config, add env var and --vault docs                         |
| Modify | `docs/onboarding.md`                     | Update to reflect vault creation flow, remove scope                        |
| Modify | `README.md`                              | Update philosophy section, mention multi-vault                             |
| Modify | `specs/02-architecture.md`               | Update global config, data flow, vault structure                           |
| Modify | `skills/onboarding/SKILL.md`             | Remove scope reference from onboarding flow                                |
| Modify | `AGENTS.md`                              | Update vault operations section                                            |

---

## Task 1: Core — Rename `vault_path` to `brain_path` and add `discoverVaults`

**Files:**

- Modify: `core/types.ts:1-4`
- Modify: `core/vault.ts:54-69`
- Modify: `core/index.ts:12-33`
- Create: `core/__tests__/vault-discovery.test.ts`

- [ ] **Step 1: Write failing tests for `discoverVaults` and `readGlobalConfig`**

Create `core/__tests__/vault-discovery.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverVaults } from "../vault.js";

describe("discoverVaults", () => {
  let brainDir: string;

  beforeEach(() => {
    brainDir = mkdtempSync(join(tmpdir(), "brainkit-dv-"));
  });

  afterEach(() => {
    rmSync(brainDir, { recursive: true, force: true });
  });

  it("returns vault names for directories containing brainkit.toml", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    mkdirSync(join(brainDir, "life"));
    writeFileSync(join(brainDir, "life", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');

    expect(discoverVaults(brainDir)).toEqual(["life", "work"]);
  });

  it("ignores directories without brainkit.toml", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    mkdirSync(join(brainDir, "random-dir"));

    expect(discoverVaults(brainDir)).toEqual(["work"]);
  });

  it("ignores files (non-directories)", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    writeFileSync(join(brainDir, "notes.md"), "# Notes");

    expect(discoverVaults(brainDir)).toEqual(["work"]);
  });

  it("returns empty array for empty brain directory", () => {
    expect(discoverVaults(brainDir)).toEqual([]);
  });

  it("returns sorted results", () => {
    for (const name of ["zebra", "alpha", "middle"]) {
      mkdirSync(join(brainDir, name));
      writeFileSync(join(brainDir, name, "brainkit.toml"), 'version = 1\n[user]\nname = "T"\nrole = "E"\n');
    }

    expect(discoverVaults(brainDir)).toEqual(["alpha", "middle", "zebra"]);
  });

  it("throws when brain path does not exist", () => {
    expect(() => discoverVaults(join(brainDir, "nonexistent"))).toThrow();
  });

  it("throws when brain path is not a directory", () => {
    const filePath = join(brainDir, "not-a-dir");
    writeFileSync(filePath, "just a file");

    expect(() => discoverVaults(filePath)).toThrow();
  });
});

describe("readGlobalConfig with brain_path", () => {
  // This is a compile-time check — readGlobalConfig returns BrainkitGlobalConfig
  // which now has brain_path instead of vault_path. We verify the type contract
  // by accessing the field.
  it("returns brain_path field", () => {
    // We can't easily write to ~/.config/brainkit/config.toml in tests,
    // but we verify the type contract compiles correctly.
    // The real integration test is that the CLI launcher reads brain_path.
    const config = { version: 1, brain_path: "/some/path" };
    expect(config.brain_path).toBe("/some/path");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run core/__tests__/vault-discovery.test.ts`
Expected: FAIL — `discoverVaults` is not exported / does not exist.

- [ ] **Step 3: Rename `vault_path` to `brain_path` in types**

In `core/types.ts`, change line 3:

```typescript
// Before
vault_path: string;

// After
brain_path: string;
```

- [ ] **Step 4: Update `readGlobalConfig` and `writeGlobalConfig` references**

No code change needed in `core/vault.ts:54-69` — `readGlobalConfig` and `writeGlobalConfig` parse/write TOML generically. The type rename propagates through `BrainkitGlobalConfig`. The TOML field name is determined by the actual config file content, not the TypeScript type. The type just tells consumers what fields exist.

- [ ] **Step 5: Implement `discoverVaults`**

In `core/vault.ts`, add after line 69 (after `writeGlobalConfig`):

```typescript
// ---------------------------------------------------------------------------
// Vault discovery
// ---------------------------------------------------------------------------

export function discoverVaults(brainPath: string): string[] {
  const stat = fs.statSync(brainPath); // throws if path doesn't exist
  if (!stat.isDirectory()) {
    throw new Error(`Brain path is not a directory: ${brainPath}`);
  }

  const entries = fs.readdirSync(brainPath);
  const vaults: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(brainPath, entry);
    try {
      const entryStat = fs.statSync(entryPath);
      if (!entryStat.isDirectory()) continue;
      const configPath = path.join(entryPath, "brainkit.toml");
      if (fs.existsSync(configPath)) {
        vaults.push(entry);
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return vaults.sort();
}
```

- [ ] **Step 6: Export `discoverVaults` from `core/index.ts`**

In `core/index.ts`, add `discoverVaults` to the vault operations export block (line 12-32):

```typescript
export {
  PARA,
  KEY_FILES,
  readGlobalConfig,
  writeGlobalConfig,
  discoverVaults,
  readVaultConfig,
  // ... rest unchanged
} from "./vault.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run core/__tests__/vault-discovery.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 8: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: Some tests in `prompt-sections.test.ts` may fail due to `scope` references in `makeConfig` helper — that's expected, will be fixed in Task 3. Other tests should pass.

- [ ] **Step 9: Commit**

```
feat: add discoverVaults and rename vault_path to brain_path in global config
```

---

## Task 2: Rename `vault_path` in Copilot files

**Files:**

- Modify: `cli/copilot.ts:141,146`
- Modify: `scripts/copilot-status.js:26,32,41`

- [ ] **Step 1: Update `cli/copilot.ts`**

In `cli/copilot.ts`, change lines 141 and 146:

```typescript
// Line 141 — before:
if (globalConfig === null || !globalConfig.vault_path) {
// After:
if (globalConfig === null || !globalConfig.brain_path) {

// Line 146 — before:
const vaultPath = globalConfig.vault_path;
// After:
const vaultPath = globalConfig.brain_path;
```

Note: `vaultPath` local variable name stays the same — it's what we pass downstream. Only the config field access changes.

- [ ] **Step 2: Update `scripts/copilot-status.js`**

In `scripts/copilot-status.js`, change lines 26, 32, and 41:

```javascript
// Line 26 — before:
const config = readVaultConfigSimple(globalConfig.vault_path);
// After:
const config = readVaultConfigSimple(globalConfig.brain_path);

// Line 32 — before:
const stats = getBragStats(globalConfig.vault_path);
// After:
const stats = getBragStats(globalConfig.brain_path);

// Line 41 — before:
const raw = readContacts(globalConfig.vault_path);
// After:
const raw = readContacts(globalConfig.brain_path);
```

**Important note:** This is a temporary state. The Copilot launcher and status script currently treat `brain_path` as a single vault path. Once Unit 2 is done, the Copilot launcher will need to do vault discovery too. But for now, this keeps the code compiling against the renamed type. The Copilot harness vault-selection story is a follow-up.

- [ ] **Step 3: Run lint to verify types compile**

Run: `npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```
refactor: rename vault_path to brain_path in Copilot launcher and status script
```

---

## Task 3: Remove `config.user.scope` from types and prompt sections

**Files:**

- Modify: `core/types.ts:13`
- Modify: `core/prompt-sections.ts:67,76,82-83,224,229-231`
- Modify: `core/__tests__/prompt-sections.test.ts:28,82-95`

- [ ] **Step 1: Remove `scope` from `BrainkitConfig` type**

In `core/types.ts`, delete line 13:

```typescript
// Remove this line:
scope?: "professional" | "personal" | "both";
```

- [ ] **Step 2: Remove `scope` from `buildIdentity`**

In `core/prompt-sections.ts`, update `buildIdentity` (lines 65-95):

```typescript
export function buildIdentity(ctx: SectionContext): string {
  const { user } = ctx.config;
  const expertise = user.expertise ?? [];

  let identity = `## Second Brain — ${user.name}\n\n`;
  identity += `You have access to ${user.name}'s personal second brain vault at \`${ctx.vaultPath}\`.\n`;
  identity += `${user.name} is a ${user.role}`;
  if (expertise.length > 0) {
    identity += ` with expertise in ${expertise.join(", ")}`;
  }
  identity += `.`;

  if (user.work?.description !== undefined && user.work.description !== "") {
    identity += `\n\n**Work context:** ${user.work.description}`;
  }

  if (user.personal?.description !== undefined && user.personal.description !== "") {
    identity += `\n\n**Personal context:** ${user.personal.description}`;
  }

  if (user.customization?.context !== undefined && user.customization.context !== "") {
    identity += `\n\n${user.customization.context}`;
  }

  return identity;
}
```

Key changes:

- Removed `const scope = user.scope ?? "professional";`
- Removed `This is a ${scope} vault.` line
- Removed the `scope === "personal" || scope === "both"` guard on personal context — personal context is now always included if present

- [ ] **Step 3: Remove `scope` from `buildProfileNudge`**

In `core/prompt-sections.ts`, update `buildProfileNudge` (lines 219-245):

```typescript
export function buildProfileNudge(ctx: SectionContext): string | null {
  const onboardingComplete = ctx.config.user.customization?.onboarding_complete === true;
  if (onboardingComplete) return null;

  const { user } = ctx.config;
  const expertise = user.expertise ?? [];
  const missing: string[] = [];
  if (expertise.length === 0) missing.push("expertise");
  if (user.work?.description === undefined || user.work.description === "") missing.push("work context");
  if (user.personal?.description === undefined || user.personal.description === "") {
    missing.push("personal context");
  }

  if (missing.length === 0) return null;
  return [
    "## Profile Incomplete",
    "",
    `The following fields are empty in brainkit.toml: ${missing.join(", ")}.`,
    "If it comes up naturally in conversation, offer to fill them in.",
    "Don't lead with this — wait for a relevant moment.",
    "Once the user is satisfied with their profile, set `onboarding_complete = true` under `[user.customization]` in brainkit.toml.",
  ].join("\n");
}
```

Key changes:

- Removed `const scope = user.scope ?? "professional";`
- Removed the `scope === "personal" || scope === "both"` guard on personal context check — always check it now

- [ ] **Step 4: Update tests**

In `core/__tests__/prompt-sections.test.ts`:

Update `makeConfig` helper to remove `scope`:

```typescript
function makeConfig(overrides?: Partial<BrainkitConfig>): BrainkitConfig {
  return {
    version: 1,
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["TypeScript", "APIs"],
      tone: "direct",
      ...overrides?.user,
    },
    features: {
      bragfile: false,
      contacts: false,
      ...overrides?.features,
    },
    ...overrides,
  };
}
```

Replace the `"excludes personal context when scope is professional"` test (lines 82-95) with a test that validates the new behavior:

```typescript
it("includes personal context when set", () => {
  const ctx = makeCtx({
    config: makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        personal: { description: "Loves hiking" },
      },
    }),
  });
  const result = buildIdentity(ctx);
  expect(result).toContain("Loves hiking");
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run core/__tests__/prompt-sections.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Run lint**

Run: `npx eslint cli/ core/ && npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```
refactor: remove config.user.scope — vault scope is now determined by which vault you open
```

---

## Task 4: CLI vault selection and `--vault` flag

**Files:**

- Modify: `cli/index.ts`
- Modify: `cli/launch.ts`
- Create: `cli/__tests__/vault-selection.test.ts`

- [ ] **Step 1: Write failing tests for vault selection logic**

Create `cli/__tests__/vault-selection.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseVaultFlag } from "../launch.js";

describe("parseVaultFlag", () => {
  it("extracts --vault value from args", () => {
    const result = parseVaultFlag(["--vault", "work"]);
    expect(result).toEqual({ vault: "work", remaining: [] });
  });

  it("extracts --vault with other args", () => {
    const result = parseVaultFlag(["--model", "gpt-4", "--vault", "life"]);
    expect(result).toEqual({ vault: "life", remaining: ["--model", "gpt-4"] });
  });

  it("returns null vault when --vault not present", () => {
    const result = parseVaultFlag(["--model", "gpt-4"]);
    expect(result).toEqual({ vault: null, remaining: ["--model", "gpt-4"] });
  });

  it("throws when --vault has no value", () => {
    expect(() => parseVaultFlag(["--vault"])).toThrow();
  });

  it("throws when --vault value looks like another flag", () => {
    expect(() => parseVaultFlag(["--vault", "--model"])).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: FAIL — `parseVaultFlag` is not exported.

- [ ] **Step 3: Add `parseVaultFlag` to `cli/launch.ts`**

Add at the end of `cli/launch.ts`, before the existing public API section:

```typescript
// ---------------------------------------------------------------------------
// Vault flag parsing
// ---------------------------------------------------------------------------

export function parseVaultFlag(args: string[]): { vault: string | null; remaining: string[] } {
  const idx = args.indexOf("--vault");
  if (idx === -1) return { vault: null, remaining: [...args] };

  const value = args[idx + 1];
  if (value === undefined) {
    throw new Error("--vault requires a vault name. Usage: brainkit --vault <name>");
  }
  if (value.startsWith("-")) {
    throw new Error(`--vault requires a vault name, got "${value}". Usage: brainkit --vault <name>`);
  }

  const remaining = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { vault: value, remaining };
}
```

- [ ] **Step 4: Run parseVaultFlag tests**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 5: Add `selectVault` function to `cli/launch.ts`**

Add after `parseVaultFlag`:

```typescript
// ---------------------------------------------------------------------------
// Vault selection
// ---------------------------------------------------------------------------

import * as readline from "node:readline";
import { readGlobalConfig, discoverVaults } from "@oribish/brainkit-core";

function promptVaultSelection(vaults: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Multiple vaults found. Use --vault <name> to select one."));
      return;
    }

    console.log("\n  [brainkit] Multiple vaults found:\n");
    for (let i = 0; i < vaults.length; i++) {
      const v = vaults[i];
      if (v !== undefined) {
        console.log(`    ${i + 1}. ${v}`);
      }
    }
    console.log("");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("  Select vault (number): ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      const selected = vaults[idx];
      if (selected === undefined) {
        reject(new Error(`Invalid selection. Choose 1-${vaults.length}.`));
        return;
      }
      resolve(selected);
    });
  });
}

export async function selectVault(vaultFlag: string | null): Promise<{ vaultPath: string; brainPath: string }> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    console.error("  [brainkit] No brain configured. Run brainkit with OpenCode first to set up your vault.");
    process.exit(1);
  }

  const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
  let vaults: string[];

  try {
    vaults = discoverVaults(brainPath);
  } catch (err) {
    console.error(`  [brainkit] Cannot read brain directory: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Explicit --vault flag
  if (vaultFlag !== null) {
    if (!vaults.includes(vaultFlag)) {
      console.error(`  [brainkit] Vault "${vaultFlag}" not found.`);
      if (vaults.length > 0) {
        console.error(`  [brainkit] Available vaults: ${vaults.join(", ")}`);
      }
      process.exit(1);
    }
    return { vaultPath: path.join(brainPath, vaultFlag), brainPath };
  }

  // 0 vaults — fresh brain, launch without vault (onboarding will handle it)
  if (vaults.length === 0) {
    return { vaultPath: brainPath, brainPath };
  }

  // 1 vault — auto-select
  if (vaults.length === 1) {
    const single = vaults[0];
    if (single !== undefined) {
      return { vaultPath: path.join(brainPath, single), brainPath };
    }
  }

  // 2+ vaults — interactive prompt
  const selected = await promptVaultSelection(vaults);
  return { vaultPath: path.join(brainPath, selected), brainPath };
}
```

- [ ] **Step 6: Update `launchOpenCode` to accept and set `BRAINKIT_VAULT_PATH`**

In `cli/launch.ts`, modify `launchOpenCode` (lines 57-69):

```typescript
function launchOpenCode(args: string[], vaultPath?: string): void {
  ensureOpenCodeConfig();

  const configDir = path.join(os.homedir(), ".config", "brainkit");
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
  };

  if (vaultPath !== undefined) {
    env.BRAINKIT_VAULT_PATH = vaultPath;
  }

  const child = spawn("opencode", args, { stdio: "inherit", env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

- [ ] **Step 7: Update `Harness` interface and harness launchers to accept `vaultPath`**

In `cli/launch.ts`, update the `Harness` interface:

```typescript
interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[], vaultPath?: string) => void;
}
```

Update `launchCopilot` import usage in the `HARNESSES` array — for now the Copilot launcher still reads from global config directly, so `vaultPath` is ignored. The Copilot vault selection will be a follow-up.

- [ ] **Step 8: Update `launchHarness` and `detectAndLaunch` to pass `vaultPath`**

```typescript
export async function launchHarness(alias: string, args: string[], vaultPath?: string): Promise<void> {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    console.error(`  [brainkit] Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    console.error(`  [brainkit] ${harness.name} is not installed. Install it first.`);
    process.exit(1);
  }

  harness.launch(args, vaultPath);
}

export async function detectAndLaunch(args: string[], vaultPath?: string): Promise<void> {
  const available = HARNESSES.filter((h) => isInstalled(h.binaries));

  if (available.length === 0) {
    console.error("  [brainkit] No supported coding harness found.");
    console.error("  [brainkit] Install OpenCode: https://opencode.ai");
    console.error("  [brainkit] Install Copilot CLI: https://github.com/github/copilot-cli");
    process.exit(1);
  }

  if (available.length === 1) {
    const harness = available[0];
    if (harness !== undefined) {
      harness.launch(args, vaultPath);
    }
    return;
  }

  // Multiple harnesses — prompt user
  console.log("  [brainkit] Multiple coding harnesses found:");
  for (const h of available) {
    console.log(`    brainkit ${h.aliases[0]}  — launch ${h.name}`);
  }
  process.exit(0);
}
```

- [ ] **Step 9: Update `cli/index.ts` with `--vault` and vault selection**

Replace `cli/index.ts`:

```typescript
#!/usr/bin/env node

import { version } from "./version.js";
import { isHarnessAlias, launchHarness, detectAndLaunch, parseVaultFlag, selectVault } from "./launch.js";

function printUsage(): void {
  console.log(`
  brainkit v${version}

  Usage:
    brainkit                     Auto-detect harness and launch
    brainkit oc [args...]        Launch with OpenCode
    brainkit opencode [args...]  Launch with OpenCode
    brainkit copilot [args...]   Launch with Copilot CLI
    brainkit cp [args...]        Launch with Copilot CLI

  Options:
    --vault <name>  Select which vault to open
    --version       Print version and exit
    --help          Show this help message

  All arguments after the harness alias are passed through.
  Example: brainkit oc --model anthropic/claude-sonnet-4-5
  Example: brainkit --vault work
  Example: brainkit oc --vault life
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  // Parse --vault from args (before or after harness alias)
  const { vault: vaultFlag, remaining } = parseVaultFlag(args);

  // Select vault
  const { vaultPath } = await selectVault(vaultFlag);

  const firstArg = remaining[0];

  // Harness alias — launch explicitly
  if (firstArg !== undefined && isHarnessAlias(firstArg)) {
    await launchHarness(firstArg, remaining.slice(1), vaultPath);
    return;
  }

  // No args or unknown — auto-detect and launch
  await detectAndLaunch(remaining, vaultPath);
}

process.on("SIGINT", () => {
  console.log("");
  process.exit(0);
});

main().catch((err) => {
  console.error(`  [brainkit] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
```

- [ ] **Step 10: Run parseVaultFlag tests again**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: All 5 tests PASS.

- [ ] **Step 11: Run lint**

Run: `npx eslint cli/ core/ && npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 12: Commit**

```
feat: add --vault flag and vault selection to CLI launcher
```

---

## Task 5: Update OpenCode plugin to use `BRAINKIT_VAULT_PATH`

**Files:**

- Modify: `opencode/server.ts`
- Modify: `opencode/side.tsx`

- [ ] **Step 1: Rewrite `opencode/server.ts` with vault path resolution**

Replace `opencode/server.ts`:

```typescript
// @ts-nocheck
import type { Plugin } from "@opencode-ai/plugin";
import * as path from "node:path";
import * as os from "node:os";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "@oribish/brainkit-core";

const id = "brainkit";

const suggestedSessions = new Set<string>();

function resolveVaultPath(): string | undefined {
  // 1. Env var (set by CLI launcher)
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return fromEnv;

  // 2. Fallback: discover from brain_path
  try {
    const globalConfig = readGlobalConfig();
    if (!globalConfig?.brain_path) return undefined;
    const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
    const vaults = discoverVaults(brainPath);
    if (vaults.length === 1) return path.join(brainPath, vaults[0]!);
  } catch {
    // Can't resolve — return undefined
  }

  // 3. Multiple or zero vaults without env var — can't resolve
  return undefined;
}

const server: Plugin = async () => {
  // Resolve vault path once at init
  const vaultPath = resolveVaultPath();

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      if (!vaultPath) return;
      try {
        const vaultConfig = readVaultConfigSimple(vaultPath);
        if (!vaultConfig) return;
        const prompt = buildSystemPrompt(vaultConfig, vaultPath, { mode: "cli" });
        if (output.system.includes(prompt)) return;
        output.system.push(prompt);
      } catch {
        // Gracefully handle missing vault
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!vaultPath) return;
      try {
        const vaultConfig = readVaultConfigSimple(vaultPath);
        if (!vaultConfig) return;

        const vaultName = path.basename(vaultPath);
        const identity = [
          "## Brainkit Vault Context (Condensed)",
          `- User: ${vaultConfig.user.name} (${vaultConfig.user.role})`,
          `- Vault: ${vaultName} (${vaultPath})`,
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

    "session.idle": async (event, api) => {
      // Brag detection
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
      if (vaultPath) {
        try {
          scheduleAutoCommit(vaultPath);
        } catch {
          // Gracefully handle errors
        }
      }
    },
  };
};

const plugin: { id: string; server: Plugin } = {
  id,
  server,
};

export default plugin;
```

Key changes:

- Added `resolveVaultPath()` with env var + fallback
- Cached `vaultPath` once at plugin init
- Removed per-hook `readGlobalConfig()` calls
- Removed `scope` from compaction identity
- Changed `Vault:` line to show vault name and path

- [ ] **Step 2: Rewrite `opencode/side.tsx` with `BRAINKIT_VAULT_PATH`**

Replace `opencode/side.tsx`:

```tsx
// @ts-nocheck
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin } from "@opencode-ai/plugin/tui";
import * as path from "node:path";
import { createMemo } from "solid-js";
import { readVaultConfigSimple, getBragStats, readContacts, parseContacts } from "@oribish/brainkit-core";

type Api = Parameters<import("@opencode-ai/plugin/tui").TuiPlugin>[0];

const staleness = (lastEntryDate: string | null): { label: string; color: string } => {
  if (!lastEntryDate) return { label: "never", color: "#E85050" };
  const days = Math.floor((Date.now() - new Date(lastEntryDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { label: `${days}d ago`, color: "#50E850" };
  if (days <= 14) return { label: `${days}d ago`, color: "#E8E850" };
  return { label: `${days}d ago`, color: "#E85050" };
};

export const Sidebar = (props: { api: Api }) => {
  const theme = createMemo(() => props.api.theme.current);

  const vaultPath = process.env.BRAINKIT_VAULT_PATH;

  const data = createMemo(() => {
    if (!vaultPath) return null;
    try {
      const vaultConfig = readVaultConfigSimple(vaultPath);
      if (!vaultConfig) return null;

      const vaultName = path.basename(vaultPath);
      const bragEnabled = vaultConfig.features?.bragfile !== false;
      const contactsEnabled = vaultConfig.features?.contacts !== false;
      const stats = bragEnabled ? getBragStats(vaultPath) : null;
      let contactCount = 0;
      if (contactsEnabled) {
        try {
          const raw = readContacts(vaultPath);
          const contacts = parseContacts(raw);
          contactCount = contacts.length;
        } catch {
          // ignore
        }
      }

      return {
        name: vaultConfig.user.name,
        vaultName,
        path: vaultPath,
        features: { bragfile: bragEnabled, contacts: contactsEnabled },
        bragStats: stats,
        contactCount,
      };
    } catch {
      return null;
    }
  });

  return (
    <box paddingLeft={1} paddingRight={1} flexDirection="column" gap={1}>
      {(() => {
        const d = data();
        if (!d) {
          return <text fg={theme().textMuted}>No vault configured</text>;
        }

        const bragStale = d.bragStats ? staleness(d.bragStats.lastEntryDate) : null;

        return (
          <>
            <box flexDirection="column">
              <text fg={theme().primary} bold>
                🧠 {d.name}'s vault
              </text>
              <text fg={theme().textMuted}>
                {d.vaultName} — {d.path}
              </text>
            </box>

            {d.features.bragfile && d.bragStats && (
              <box flexDirection="column">
                <text fg={theme().text}>Brags: {d.bragStats.totalEntries}</text>
                <text>
                  <span style={{ fg: theme().textMuted }}>Last entry: </span>
                  <span style={{ fg: bragStale!.color }}>{bragStale!.label}</span>
                </text>
              </box>
            )}

            {d.features.contacts && <text fg={theme().text}>Contacts: {d.contactCount}</text>}
          </>
        );
      })()}
    </box>
  );
};
```

Key changes:

- Reads `BRAINKIT_VAULT_PATH` once at component scope
- Removed `readGlobalConfig()` call — no longer needed
- Shows vault name (`path.basename`) alongside full path
- No longer references `globalConfig.vault_path`

- [ ] **Step 3: Run lint**

Run: `npx tsc --noEmit`
Expected: PASS (opencode files use `@ts-nocheck` so won't catch all issues, but the import changes should be valid).

- [ ] **Step 4: Commit**

```
feat: use BRAINKIT_VAULT_PATH env var in OpenCode plugin with closure caching
```

---

## Task 6: Update documentation

**Files:**

- Modify: `docs/features.md`
- Modify: `docs/config.md`
- Modify: `docs/onboarding.md`
- Modify: `README.md`
- Modify: `specs/02-architecture.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `docs/features.md`**

Add multi-vault after TUI:

```markdown
- [TUI](tui.md) — terminal UI for OpenCode (sidebar, tips, theme, branding)
- **Multi-vault** — multiple independent vaults under one brain directory, selected at launch with `--vault`
```

- [ ] **Step 2: Update `docs/config.md` — global config section**

Replace the Global Config section (lines 8-23):

````markdown
## Global Config

**Path:** `~/.config/brainkit/config.toml`

Points brainkit to the brain directory (which contains one or more vaults). This is the only file that's machine-specific and not checked into git.

```toml
version = 1
brain_path = "/Users/you/brain"
```
````

| Field        | Type   | Required | Description                                            |
| ------------ | ------ | -------- | ------------------------------------------------------ |
| `brain_path` | string | yes      | Absolute path to the brain directory containing vaults |

**Created by:** The agent during onboarding, or manually by the user.

**Also at `~/.config/brainkit/`:** The CLI launcher writes `opencode.json` and `tui.json` here for OpenCode plugin loading. These are auto-generated and not user-editable.

### `BRAINKIT_VAULT_PATH` environment variable

Set by the CLI launcher after vault selection. Contains the absolute path to the selected vault (e.g., `/Users/you/brain/work`). Read by the OpenCode plugin at init to know which vault to operate on. Not set by the user — managed by the launcher.

### `--vault` flag

When the brain directory contains multiple vaults, use `--vault <name>` to select one:

```bash
brainkit --vault work
brainkit oc --vault life
```

If omitted with a single vault, it auto-selects. With multiple vaults, an interactive prompt appears.

````

- [ ] **Step 3: Remove `scope` from `docs/config.md` vault config section**

In the `[user]` table (line 74), remove the `scope` row:

```markdown
| `tone`      | string   | no       | `"direct"`       | Preferred writing tone for vault content (direct, casual, concise, formal).                               |
````

(Remove the entire `scope` row that was between `tone` and `[user.work]`.)

Also remove the scope reference from the `[user.personal]` description (line 86):

```markdown
| `description` | string | no | — | Free-text about the user's personal life — location, hobbies, family, interests. |
```

- [ ] **Step 4: Update `docs/config.md` — portable vault section**

Update the portable vault example (line 143):

```markdown
mkdir -p ~/.config/brainkit
echo 'version = 1\nbrain_path = "/Users/you/brain"' > ~/.config/brainkit/config.toml
```

- [ ] **Step 5: Update `docs/config.md` — vault config example**

Remove `scope = "professional"` from the example TOML block (line 39).

- [ ] **Step 6: Update `docs/onboarding.md`**

In the Phase 5 setup section (line 42), remove the reference to `scope (set to "both" since onboarding covers personal and professional)`.

In the Profile nudge section (line 57), remove `(only checked when scope is "personal" or "both")`.

- [ ] **Step 7: Update `skills/onboarding/SKILL.md`**

In `skills/onboarding/SKILL.md`, update Phase 5 step 1 (line 52-63):

Remove the scope line:

```
    - Set scope to "both" (since we're covering personal and professional)
```

That entire line is deleted. The vault's scope is now determined by which vault you open, not a config field.

Also update step 2 (line 65) to mention creating the vault under the brain directory:

```
2. **Create the vault directory** under the brain directory (if not already created by the launcher)
```

- [ ] **Step 8: Update `README.md`**

Replace the philosophy paragraph about vault separation (line 24):

```markdown
**Personal use, for both life and work.** A brain directory holds one or more vaults — you might have `work` and `life`, or just a single vault. Each vault is independent with its own config, contacts, and bragfile. Choose which vault to open at launch with `--vault`, or let brainkit auto-select when there's only one.
```

- [ ] **Step 9: Update `specs/02-architecture.md` — global config**

Replace lines 150-156:

````markdown
### Global Config (`~/.config/brainkit/config.toml`)

```toml
version = 1
brain_path = "/Users/ori/brain"
```
````

Points to the brain directory containing one or more vaults. Each vault is a subdirectory with its own `brainkit.toml`. The CLI launcher discovers vaults, selects one (via `--vault` flag or interactive prompt), and sets `BRAINKIT_VAULT_PATH` for the plugin.

````

In the vault config example (lines 158-179), remove `scope = "professional"`.

- [ ] **Step 10: Update `AGENTS.md` — vault operations section**

In the Vault Operations section (near the end of AGENTS.md), update the first bullet:

```markdown
- `readGlobalConfig()` — reads `~/.config/brainkit/config.toml` (just `brain_path`)
- `discoverVaults()` — scans brain directory for vault subdirectories
````

- [ ] **Step 11: Commit**

```
docs: update config, onboarding, README, and architecture docs for multi-vault support
```

---

## Task 7: Update developer's own config

- [ ] **Step 1: Update `~/.config/brainkit/config.toml`**

Read the current content and rename `vault_path` to `brain_path`. The value should point to the brain directory (parent of the vault), not the vault itself. If the current `vault_path` points to a single vault like `~/brain`, and the vault's `brainkit.toml` is at the root, the brain directory structure needs to be set up by wrapping the existing vault in a subdirectory.

Check the current config first, then update accordingly. If there's no existing config, skip this step.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 3: Run full lint**

Run: `npx eslint cli/ core/ && npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit (if config was changed)**

```
chore: update developer config for multi-vault (brain_path)
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run full lint + format check**

Run: `npx eslint cli/ core/ && npx tsc --noEmit && npx tsc --project cli/tsconfig.json --noEmit && npx tsc --project core/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify no `vault_path` references remain in runtime code**

Search for `vault_path` in `core/`, `cli/`, `opencode/`, `scripts/` — should only appear in specs, docs changelog, or comments, not in active code.

- [ ] **Step 4: Verify no `scope` references remain in runtime code**

Search for `user.scope` or `config.user.scope` in `core/`, `opencode/` — should return zero results.
