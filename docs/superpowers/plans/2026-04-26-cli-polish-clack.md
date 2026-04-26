# CLI Polish with @clack/prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw readline prompts and plain console output with `@clack/prompts` for a polished, branded CLI launch experience.

**Architecture:** Swap all interactive prompts to clack's `select()`, replace `console.log`/`console.error` with clack's `intro()`, `outro()`, `note()`, `log.*()`, and `cancel()`. No new files — only modifying existing CLI files and adding one dependency.

**Tech Stack:** `@clack/prompts@^1.2.0` (ESM-only, compatible with the CLI's ES2022 module target)

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `@clack/prompts` dependency |
| `cli/index.ts` | Modify | Branded intro, styled help, error handling |
| `cli/launch.ts` | Modify | Select prompts for vault/harness, styled errors, outro |
| `cli/copilot.ts` | Modify | Single error message update |

---

### Task 1: Add @clack/prompts dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run:
```bash
npm install @clack/prompts
```

Expected: `@clack/prompts` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Verify install**

Run:
```bash
node -e "import('@clack/prompts').then(m => console.log(Object.keys(m).slice(0,5).join(', ')))"
```

Expected: prints some export names like `intro, outro, select, text, confirm`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @clack/prompts for CLI polish"
```

---

### Task 2: Update cli/index.ts — branded intro, styled help & errors

**Files:**
- Modify: `cli/index.ts`

**Context:** Current file uses `console.log` for help/version, `console.error` for errors, and a raw `SIGINT` handler. Replace all with clack equivalents.

- [ ] **Step 1: Replace the full file content**

Replace `cli/index.ts` with:

```typescript
#!/usr/bin/env node

import * as p from "@clack/prompts";
import { version } from "./version.js";
import { isHarnessAlias, launchHarness, detectAndLaunch, parseVaultFlag, selectVault } from "./launch.js";

const HELP_TEXT = `Usage:
  brainkit                     Launch (auto-detects harness)
  brainkit oc [args...]        Launch with OpenCode
  brainkit opencode [args...]  Launch with OpenCode
  brainkit copilot [args...]   Launch with Copilot CLI
  brainkit cp [args...]        Launch with Copilot CLI

Options:
  --vault <name>  Pick which vault to open
  --version       Print version
  --help          Show this message

Extra args are passed through to the harness.
Example: brainkit oc --model anthropic/claude-sonnet-4-5
Example: brainkit --vault work`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --version: plain output (for scripting/piping)
  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  // --help: framed output
  if (args.includes("--help")) {
    p.intro(`brainkit v${version}`);
    p.note(HELP_TEXT, "Usage");
    p.outro();
    process.exit(0);
  }

  p.intro("brainkit");

  // Parse --vault from args (before or after harness alias)
  const { vault: vaultFlag, remaining } = parseVaultFlag(args);

  // Select vault
  const { vaultPath } = await selectVault(vaultFlag);

  const firstArg = remaining[0];

  // Harness alias — launch explicitly
  if (firstArg !== undefined && isHarnessAlias(firstArg)) {
    launchHarness(firstArg, remaining.slice(1), vaultPath);
    return;
  }

  // No args or unknown — auto-detect and launch
  await detectAndLaunch(remaining, vaultPath);
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

Key changes from the original:
- Removed `printUsage()` function → replaced with `HELP_TEXT` constant + `p.note()`
- Added `p.intro("brainkit")` at the start of normal flow
- `--help` gets its own `intro/note/outro` frame
- `--version` stays as plain `console.log` (for piping/scripting)
- Removed `process.on("SIGINT")` handler — clack handles cancellation via `isCancel()`
- Error handler uses `p.log.error()` instead of `console.error`
- `detectAndLaunch` is now awaited (it becomes async in Task 3)

- [ ] **Step 2: Verify the file compiles**

Run:
```bash
npx tsc --project cli/tsconfig.json --noEmit
```

Expected: may show errors in `launch.ts` since it's not updated yet. Errors in `index.ts` itself should be zero.

- [ ] **Step 3: Commit**

```bash
git add cli/index.ts
git commit -m "feat(cli): add clack intro, styled help and error output"
```

---

### Task 3: Update cli/launch.ts — select prompts, styled errors, outro

**Files:**
- Modify: `cli/launch.ts`

**Context:** This is the biggest change. Replace `readline`-based interactive prompts with `select()`, swap `console.error` for `cancel()`/`log.error()`, add `outro()` before launching harnesses. `detectAndLaunch` becomes async.

- [ ] **Step 1: Add clack import, remove readline import**

Replace:
```typescript
import * as readline from "node:readline";
```

With:
```typescript
import * as p from "@clack/prompts";
```

The `readline` import is on line 4. The clack import replaces it.

- [ ] **Step 2: Replace `promptVaultSelection` function**

Replace the entire `promptVaultSelection` function (lines 120-148) with:

```typescript
async function promptVaultSelection(vaults: string[]): Promise<string> {
  if (!process.stdin.isTTY) {
    p.cancel("Multiple vaults found. Use --vault <name> to select one.");
    process.exit(1);
  }

  const selected = await p.select({
    message: "Select a vault",
    options: vaults.map((v) => ({ value: v, label: v })),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return selected;
}
```

- [ ] **Step 3: Update error messages in `selectVault`**

In the `selectVault` function, replace the `console.error` + `process.exit` calls:

Replace:
```typescript
    console.error(`  [brainkit] Cannot read brain directory: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
```

With:
```typescript
    p.cancel(`Cannot read brain directory: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
```

Replace:
```typescript
    console.error(`  [brainkit] Vault "${vaultFlag}" not found.`);
    if (vaults.length > 0) {
      console.error(`  [brainkit] Available vaults: ${vaults.join(", ")}`);
    }
    process.exit(1);
```

With:
```typescript
    const msg = vaults.length > 0
      ? `Vault "${vaultFlag}" not found. Available: ${vaults.join(", ")}`
      : `Vault "${vaultFlag}" not found.`;
    p.cancel(msg);
    process.exit(1);
```

- [ ] **Step 4: Update `launchHarness` with styled errors and outro**

Replace the entire `launchHarness` function with:

```typescript
export function launchHarness(alias: string, args: string[], vaultPath?: string): void {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    p.cancel(`Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    p.cancel(`${harness.name} is not installed.`);
    process.exit(1);
  }

  p.outro(`Launching ${harness.name}...`);
  harness.launch(args, vaultPath);
}
```

- [ ] **Step 5: Rewrite `detectAndLaunch` as async with select()**

Replace the entire `detectAndLaunch` function with:

```typescript
export async function detectAndLaunch(args: string[], vaultPath?: string): Promise<void> {
  const available = HARNESSES.filter((h) => isInstalled(h.binaries));

  if (available.length === 0) {
    p.cancel("No supported harness found. Install OpenCode or Copilot CLI.");
    process.exit(1);
  }

  if (available.length === 1) {
    const harness = available[0];
    if (harness !== undefined) {
      p.outro(`Launching ${harness.name}...`);
      harness.launch(args, vaultPath);
    }
    return;
  }

  // Multiple harnesses — check for saved default
  const globalConfig = readGlobalConfig();
  const savedDefault = globalConfig?.default_harness;
  if (savedDefault !== undefined && savedDefault !== "") {
    const defaultHarness = available.find((h) => h.aliases.includes(savedDefault));
    if (defaultHarness) {
      p.outro(`Launching ${defaultHarness.name}...`);
      defaultHarness.launch(args, vaultPath);
      return;
    }
  }

  // Non-TTY — can't prompt
  if (!process.stdin.isTTY) {
    p.cancel("Multiple harnesses found. Specify one: brainkit oc | brainkit copilot");
    process.exit(1);
  }

  // Interactive prompt
  const selected = await p.select({
    message: "Select your default harness",
    options: available.map((h) => ({ value: h, label: h.name })),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Save default
  const config = globalConfig ?? { version: 1, brain_path: "" };
  config.default_harness = selected.aliases[0];
  writeGlobalConfig(config);
  p.log.success(`Default harness set to ${selected.name}.`);

  p.outro(`Launching ${selected.name}...`);
  selected.launch(args, vaultPath);
}
```

- [ ] **Step 6: Verify compilation**

Run:
```bash
npx tsc --project cli/tsconfig.json --noEmit
```

Expected: clean compilation, no errors.

- [ ] **Step 7: Commit**

```bash
git add cli/launch.ts
git commit -m "feat(cli): replace readline with clack select prompts and styled output"
```

---

### Task 4: Update cli/copilot.ts — styled error

**Files:**
- Modify: `cli/copilot.ts`

- [ ] **Step 1: Add clack import**

Add at the top of the file, after the existing imports:

```typescript
import * as p from "@clack/prompts";
```

- [ ] **Step 2: Replace console.error in launchCopilot**

In the `launchCopilot` function, replace:
```typescript
      console.error("  [brainkit] No vault configured. Run brainkit with OpenCode first to set up your vault.");
      process.exit(1);
```

With:
```typescript
      p.cancel("No vault configured. Run brainkit with OpenCode first to set up your vault.");
      process.exit(1);
```

- [ ] **Step 3: Verify compilation**

Run:
```bash
npx tsc --project cli/tsconfig.json --noEmit
```

Expected: clean compilation, no errors.

- [ ] **Step 4: Commit**

```bash
git add cli/copilot.ts
git commit -m "feat(cli): use clack cancel for copilot error message"
```

---

### Task 5: Build verification

- [ ] **Step 1: Full build**

Run:
```bash
just build-cli
```

Expected: compiles to `dist/` without errors.

- [ ] **Step 2: Test help output**

Run:
```bash
node dist/cli/index.js --help
```

Expected: branded intro (`┌ brainkit v0.3.0`), boxed usage note, outro frame.

- [ ] **Step 3: Test version output**

Run:
```bash
node dist/cli/index.js --version
```

Expected: plain `0.3.0` (no framing — for scripting).

- [ ] **Step 4: Run existing tests**

Run:
```bash
just test
```

Expected: all tests pass (this change is UI-only, no logic changes).

- [ ] **Step 5: Run lint + typecheck**

Run:
```bash
just lint
```

Expected: clean.
