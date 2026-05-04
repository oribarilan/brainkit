# US-copilot-settings-overwrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Stop `brainkit copilot` from (a) doing wasteful per-launch I/O rewriting unchanged config files and (b) silently clobbering Copilot CLI's runtime mutations to `$COPILOT_HOME/settings.json` (e.g. user-added MCP servers, approved tools, theme prefs).

## Architecture

Two changes in `cli/copilot.ts`:

1. **Idempotent writes** for `writeCopilotInstructions` and `installCopilotHooks`: read existing content first, skip the write when it would be byte-identical. `installSkills` already short-circuits on version match (verified — no change needed).
2. **Read-merge-write** for `generateCopilotSettings`: read existing `settings.json`, merge brainkit-owned keys (`companyAnnouncements`, `statusLine`, `hooks`) on top while preserving everything else. For `hooks.agentStop` and `hooks.sessionEnd`, brainkit-owned entries are tagged via a `description` prefix (`brainkit:`); the merge strips prior brainkit entries from existing arrays before appending fresh ones — idempotent and lossless for user-added hook entries. Malformed existing JSON falls back to overwrite with a warning.

Skip-write check after merge: if the on-disk content equals the new content byte-for-byte, no `writeFileSync` happens.

**Two non-obvious correctness requirements** (call out to implementer):

- **Legacy hook entries from prior brainkit versions don't have the `brainkit:` description prefix** — they used unprefixed strings like `"Auto-commit vault changes after agent turns"`. The merge must also strip those exact legacy descriptions on first encounter, or existing installs will end up with duplicate auto-commit hooks (vault committed twice per agent turn) on first launch after upgrade.
- **`mergeCopilotSettings` must produce a canonical key order** so `JSON.stringify` output is deterministic across launches. Otherwise the skip-on-unchanged test passes once and fails forever after, because input key order from `existing` differs from output key order. Strategy: build the result object with a fixed key order — non-brainkit keys first (in their existing insertion order, preserved from input), then `companyAnnouncements`, `statusLine`, `hooks` in that fixed order at the end.

## Tech Stack

- TypeScript, `node:fs`, `node:path` (no new deps)
- Vitest (existing patterns in `cli/__tests__/copilot.test.ts`)

## File Structure

- **Modify:** `cli/copilot.ts`
  - `generateCopilotSettings` — replace overwrite with merge-and-conditional-write
  - `writeCopilotInstructions` — add skip-on-unchanged
  - `installCopilotHooks` — add skip-on-unchanged
  - Add new constants: `BRAINKIT_HOOK_DESCRIPTION_PREFIX`, `BRAINKIT_OWNED_SETTINGS_KEYS`
  - Add new helper: `mergeCopilotSettings(existing, brainkitOwned)` — pure function for unit testing
  - Add new helper: `writeIfChanged(path, content)` — small DRY wrapper around the read+compare+write pattern
- **Modify:** `cli/__tests__/copilot.test.ts` — new tests for merge logic + skip-on-unchanged
- **No spec changes required.** Behavior is internal; the public contract (Copilot launches with brainkit prompt + hooks active) is unchanged.

---

## Definition of Done

- [x] `generateCopilotSettings` preserves user-added top-level keys in `settings.json` across launches.
- [x] `generateCopilotSettings` preserves user-added entries in `hooks.agentStop` and `hooks.sessionEnd` while keeping brainkit's hook entries idempotent (no duplicates after N launches).
- [x] `generateCopilotSettings`, `writeCopilotInstructions`, and `installCopilotHooks` perform zero `fs.writeFileSync` calls when the resulting content is unchanged.
- [x] Malformed existing `settings.json` (invalid JSON) → warning logged, file overwritten, launch does not crash.
- [x] All existing tests still pass.
- [x] `just check` passes (lint + format + test).
- [x] CI's `test-windows` job passes.
- [x] `CHANGELOG.md` has a user-facing entry: "brainkit copilot now preserves user-added entries in `~/.config/brainkit/copilot/settings.json` (such as MCP servers added via Copilot's interactive commands) instead of overwriting them on each launch."

---

## Task Priority

1. **Task 1** — Add `writeIfChanged` helper + apply to `writeCopilotInstructions` and `installCopilotHooks`. Smallest safe change. Unblocks the merge work.
2. **Task 2** — Add `mergeCopilotSettings` pure function + tests. No I/O, easy to TDD in isolation.
3. **Task 3** — Wire `mergeCopilotSettings` into `generateCopilotSettings` with malformed-JSON fallback + integration tests via `launchCopilot`.
4. **Task 4** — Changelog entry.

---

## Cross-Cutting Concerns

- **Pure-function decomposition.** `mergeCopilotSettings` is pure (input → output, no I/O). All merge edge cases unit-tested without filesystem. `generateCopilotSettings` becomes a thin I/O shell around it.
- **Brainkit-owned key list is explicit.** `BRAINKIT_OWNED_SETTINGS_KEYS = ["companyAnnouncements", "statusLine", "hooks"] as const`. Future additions to brainkit's settings touch this constant; the merge automatically respects it.
- **Hook entry ownership via `description` prefix.** Brainkit's existing hook entries already use `description: "Auto-commit vault changes after agent turns"` etc. Change to `description: "brainkit: Auto-commit vault changes after agent turns"` so the merge can identify and refresh brainkit-owned entries without touching user entries.
- **No new runtime dependencies.** `node:fs`, `node:path` only.
- **Cross-platform.** No path separator changes; merge logic is JSON-only. The existing `.replace(/\\/g, "/")` in `generateCopilotSettings` for command paths is preserved.
- **Atomicity unchanged.** Existing ordering invariant (`$COPILOT_HOME` populated before vault deletion) is preserved — these are all reads before writes within the population phase.

---

## Task 1: `writeIfChanged` helper + apply to instructions and hooks

**Files:**

- Modify: `cli/copilot.ts` — add `writeIfChanged`, update `writeCopilotInstructions` (line 381) and `installCopilotHooks` (line 391)
- Modify: `cli/__tests__/copilot.test.ts` — add tests verifying skip behavior

### Step 1: Write failing test for `writeIfChanged` — skips when content matches

Add to `cli/__tests__/copilot.test.ts` after the `installCopilotHooks` describe block:

```typescript
describe("writeIfChanged", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempDir("write-if-changed");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes when file does not exist", () => {
    const target = path.join(tmp, "f.txt");
    const wrote = writeIfChanged(target, "hello");
    expect(wrote).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("hello");
  });

  it("skips write when content is byte-identical", () => {
    const target = path.join(tmp, "f.txt");
    fs.writeFileSync(target, "hello", "utf-8");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    try {
      const wrote = writeIfChanged(target, "hello");
      expect(wrote).toBe(false);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("writes when content differs", () => {
    const target = path.join(tmp, "f.txt");
    fs.writeFileSync(target, "hello", "utf-8");
    const wrote = writeIfChanged(target, "world");
    expect(wrote).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("world");
  });
});
```

Add `writeIfChanged` to the imports list at the top of the test file:

```typescript
import {
  // ...existing imports...
  writeIfChanged,
} from "../copilot.js";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `just test cli/__tests__/copilot.test.ts`
Expected: FAIL with "writeIfChanged is not exported" (or similar — the function doesn't exist yet).

- [ ] **Step 3: Implement `writeIfChanged` in `cli/copilot.ts`**

Add immediately after the `safeRemove` helper (around line 160):

```typescript
/**
 * Write `content` to `target` only if the existing file's content differs.
 * Returns `true` if a write occurred, `false` if skipped. Creates parent
 * directories implicitly via `fs.writeFileSync`'s default behavior — caller
 * is responsible for `mkdirSync` of the directory if it may not exist.
 *
 * Used to avoid per-launch I/O rewriting unchanged brainkit-managed files.
 */
export function writeIfChanged(target: string, content: string): boolean {
  try {
    const existing = fs.readFileSync(target, "utf-8");
    if (existing === content) return false;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.writeFileSync(target, content, "utf-8");
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test cli/__tests__/copilot.test.ts -t writeIfChanged`
Expected: 3 tests PASS.

- [ ] **Step 5: Update `writeCopilotInstructions` to use `writeIfChanged`**

Replace the body at `cli/copilot.ts:381-389`:

```typescript
export function writeCopilotInstructions(
  copilotHome: string,
  config: ReturnType<typeof readVaultConfigSimple>,
  vaultPath: string,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });
  const prompt = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  writeIfChanged(path.join(copilotHome, "copilot-instructions.md"), prompt + "\n");
}
```

- [ ] **Step 6: Update `installCopilotHooks` to use `writeIfChanged`**

Replace the body at `cli/copilot.ts:391-397`:

```typescript
export function installCopilotHooks(copilotHome: string): string {
  const scriptsDir = path.join(copilotHome, "hooks", "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, "auto-commit.js");
  writeIfChanged(scriptPath, AUTO_COMMIT_SCRIPT);
  return scriptPath;
}
```

- [ ] **Step 7: Add an integration test verifying the second launch performs no writes for these two files**

Add to `cli/__tests__/copilot.test.ts` in the `launchCopilot — isolation` describe block:

```typescript
it("second launch on unchanged state skips writes for instructions and auto-commit script", () => {
  // First launch: populates everything.
  launchCopilot([], vault);
  const instrPath = path.join(mockCopilotHome(), "copilot-instructions.md");
  const hookPath = path.join(mockCopilotHome(), "hooks", "scripts", "auto-commit.js");

  // Second launch: spy on fs.writeFileSync and assert these two paths are not written.
  const writeSpy = vi.spyOn(fs, "writeFileSync");
  try {
    launchCopilot([], vault);
    const writtenPaths = writeSpy.mock.calls.map((call) => String(call[0]));
    expect(writtenPaths).not.toContain(instrPath);
    expect(writtenPaths).not.toContain(hookPath);
  } finally {
    writeSpy.mockRestore();
  }
});
```

- [ ] **Step 8: Run all copilot tests to verify nothing regressed**

Run: `just test cli/__tests__/copilot.test.ts`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add cli/copilot.ts cli/__tests__/copilot.test.ts
git commit -m "perf(copilot): skip rewriting unchanged instructions and auto-commit script"
```

---

## Task 2: `mergeCopilotSettings` pure function + tests

**Files:**

- Modify: `cli/copilot.ts` — add `BRAINKIT_HOOK_DESCRIPTION_PREFIX`, `BRAINKIT_OWNED_SETTINGS_KEYS`, `mergeCopilotSettings`
- Modify: `cli/__tests__/copilot.test.ts` — unit tests for `mergeCopilotSettings`

### Step 1: Write failing tests for `mergeCopilotSettings`

Add a new describe block at the bottom of `cli/__tests__/copilot.test.ts`:

```typescript
describe("mergeCopilotSettings", () => {
  const brainkitOwned = {
    companyAnnouncements: ["bk-msg"],
    statusLine: { command: "node /abs/status.js" },
    hooks: {
      agentStop: [{ command: "node /abs/auto-commit.js", description: "brainkit: auto-commit on agent stop" }],
      sessionEnd: [{ command: "node /abs/auto-commit.js", description: "brainkit: auto-commit on session end" }],
    },
  };

  it("no existing settings → returns brainkit-owned content as-is", () => {
    const result = mergeCopilotSettings(null, brainkitOwned);
    expect(result).toEqual(brainkitOwned);
  });

  it("preserves user-added top-level keys", () => {
    const existing = { mcpServers: { foo: { command: "bar" } }, theme: "dark" };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    expect(result["mcpServers"]).toEqual({ foo: { command: "bar" } });
    expect(result["theme"]).toBe("dark");
    expect(result["companyAnnouncements"]).toEqual(["bk-msg"]);
    expect(result["statusLine"]).toEqual({ command: "node /abs/status.js" });
  });

  it("replaces brainkit-owned top-level scalar keys (companyAnnouncements, statusLine)", () => {
    const existing = {
      companyAnnouncements: ["stale"],
      statusLine: { command: "node /old/status.js" },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    expect(result["companyAnnouncements"]).toEqual(["bk-msg"]);
    expect(result["statusLine"]).toEqual({ command: "node /abs/status.js" });
  });

  it("preserves user-added hook entries in agentStop/sessionEnd while refreshing brainkit entries", () => {
    const existing = {
      hooks: {
        agentStop: [
          { command: "user-script.sh", description: "my hook" },
          { command: "node /old/path.js", description: "brainkit: stale entry" },
        ],
        sessionEnd: [{ command: "another-user-script.sh", description: "another user hook" }],
        sessionStart: [{ command: "user-start.sh", description: "user start hook" }],
      },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as {
      agentStop: { command: string; description: string }[];
      sessionEnd: { command: string; description: string }[];
      sessionStart: { command: string; description: string }[];
    };
    // User entry preserved, stale brainkit entry stripped, fresh brainkit entry appended.
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user-script.sh", description: "my hook" });
    expect(hooks.agentStop[1]?.description).toBe("brainkit: auto-commit on agent stop");
    // sessionEnd: user entry preserved, brainkit entry appended.
    expect(hooks.sessionEnd).toHaveLength(2);
    expect(hooks.sessionEnd[0]).toEqual({ command: "another-user-script.sh", description: "another user hook" });
    expect(hooks.sessionEnd[1]?.description).toBe("brainkit: auto-commit on session end");
    // User-only event preserved untouched.
    expect(hooks.sessionStart).toEqual([{ command: "user-start.sh", description: "user start hook" }]);
  });

  it("idempotent: merging brainkit-owned content twice produces the same result", () => {
    const once = mergeCopilotSettings(null, brainkitOwned);
    const twice = mergeCopilotSettings(once, brainkitOwned);
    expect(twice).toEqual(once);
    // Specifically, hook arrays don't grow.
    const hooks = twice["hooks"] as { agentStop: unknown[]; sessionEnd: unknown[] };
    expect(hooks.agentStop).toHaveLength(1);
    expect(hooks.sessionEnd).toHaveLength(1);
  });

  it("strips legacy unprefixed brainkit hook descriptions (upgrade safety, no duplicate auto-commits)", () => {
    // Simulates settings.json from a prior brainkit version that wrote
    // descriptions without the `brainkit:` prefix.
    const existing = {
      hooks: {
        agentStop: [
          { command: "node /old/auto-commit.js", description: "Auto-commit vault changes after agent turns" },
          { command: "user.sh", description: "my hook" },
        ],
        sessionEnd: [
          { command: "node /old/auto-commit.js", description: "Commit any remaining vault changes on session end" },
        ],
      },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as {
      agentStop: { command: string; description: string }[];
      sessionEnd: { command: string; description: string }[];
    };
    // agentStop: legacy brainkit entry stripped, user entry kept, fresh brainkit entry appended.
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user.sh", description: "my hook" });
    expect(hooks.agentStop[1]?.description).toMatch(/^brainkit:/);
    // sessionEnd: legacy brainkit entry stripped, fresh brainkit entry appended (count stays at 1).
    expect(hooks.sessionEnd).toHaveLength(1);
    expect(hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
  });

  it("produces canonical key order: non-brainkit keys first, then companyAnnouncements/statusLine/hooks", () => {
    // Canonical order is load-bearing for skip-on-unchanged. If output key
    // order varied across launches, JSON.stringify would produce different
    // bytes for semantically identical content and the file would be
    // rewritten on every launch.
    const existing = {
      mcpServers: { foo: { command: "bar" } },
      theme: "dark",
      // Brainkit-owned keys present in existing — should be re-emitted at the
      // END of the output, not in their existing position.
      companyAnnouncements: ["stale"],
      hooks: { agentStop: [] },
      statusLine: { command: "old" },
      anotherUserKey: "value",
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const keys = Object.keys(result);
    // Non-brainkit keys preserved in their existing insertion order, first.
    expect(keys.slice(0, 3)).toEqual(["mcpServers", "theme", "anotherUserKey"]);
    // Brainkit keys in fixed order at the end.
    expect(keys.slice(3)).toEqual(["companyAnnouncements", "statusLine", "hooks"]);
  });

  it("hook entry without description (user added bare entry) is preserved", () => {
    const existing = { hooks: { agentStop: [{ command: "user.sh" }] } };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as { agentStop: { command: string; description?: string }[] };
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user.sh" });
    expect(hooks.agentStop[1]?.description).toBe("brainkit: auto-commit on agent stop");
  });

  it("existing hooks key with non-array event values (malformed) → brainkit overwrites that event", () => {
    const existing = { hooks: { agentStop: "not an array" as unknown } };
    const result = mergeCopilotSettings(existing as Record<string, unknown>, brainkitOwned);
    const hooks = result["hooks"] as { agentStop: { description: string }[] };
    expect(Array.isArray(hooks.agentStop)).toBe(true);
    expect(hooks.agentStop).toHaveLength(1);
    expect(hooks.agentStop[0]?.description).toBe("brainkit: auto-commit on agent stop");
  });
});
```

Add to imports at top of test file:

```typescript
import {
  // ...existing imports...
  mergeCopilotSettings,
} from "../copilot.js";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test cli/__tests__/copilot.test.ts -t mergeCopilotSettings`
Expected: FAIL with "mergeCopilotSettings is not exported".

- [ ] **Step 3: Add constants and implement `mergeCopilotSettings` in `cli/copilot.ts`**

Add to the constants section (around line 49, after `COMPANY_ANNOUNCEMENTS`):

```typescript
/**
 * Prefix on `description` field of brainkit-managed hook entries. The merge
 * uses this to identify and replace stale brainkit hook entries on re-launch
 * while preserving user-added entries under the same hook event.
 */
const BRAINKIT_HOOK_DESCRIPTION_PREFIX = "brainkit:";

/**
 * Exact descriptions used by brainkit hook entries in versions BEFORE the
 * `brainkit:` prefix was introduced. The merge strips entries matching any
 * of these too, so users upgrading from older brainkit versions don't end up
 * with duplicate auto-commit hooks (vault committed twice per agent turn).
 *
 * Do NOT add new brainkit descriptions here — only legacy strings that
 * shipped in earlier versions and could exist in users' settings.json today.
 */
const LEGACY_BRAINKIT_HOOK_DESCRIPTIONS: ReadonlySet<string> = new Set([
  "Auto-commit vault changes after agent turns",
  "Commit any remaining vault changes on session end",
]);

/**
 * Top-level keys in `settings.json` that brainkit owns and may overwrite on
 * launch. Any key NOT in this list is preserved verbatim across launches —
 * including keys Copilot CLI writes itself (e.g. `mcpServers`, `theme`,
 * approved-tools entries).
 */
const BRAINKIT_OWNED_SETTINGS_KEYS = ["companyAnnouncements", "statusLine", "hooks"] as const;
```

Update the existing `AUTO_COMMIT_SCRIPT` consumers — actually, no, just update the `description` strings in `generateCopilotSettings` in Task 3. For now, add the merge function.

Add the `mergeCopilotSettings` function in a new section before `generateCopilotSettings` (around line 398):

```typescript
// ---------------------------------------------------------------------------
// settings.json merge (preserves user / Copilot-runtime additions)
// ---------------------------------------------------------------------------

interface HookEntry {
  command: string;
  description?: string;
}

type HooksObject = Record<string, HookEntry[] | unknown>;

/**
 * Merge brainkit-owned settings into existing settings.json content.
 *
 * Behavior:
 * - All keys NOT in `BRAINKIT_OWNED_SETTINGS_KEYS` are preserved verbatim
 *   from `existing` (preserves `mcpServers`, `theme`, etc. that Copilot CLI
 *   may write at runtime). They appear FIRST in the output object, in their
 *   existing insertion order.
 * - `companyAnnouncements`, `statusLine`, `hooks` are appended in that fixed
 *   order at the END of the output object. Replace-wholesale for the first
 *   two; per-event merge for `hooks` (see below).
 * - `hooks` is merged per-event:
 *   - For each event key in `brainkitOwned.hooks`: strip entries identified
 *     as brainkit-owned (description starts with
 *     `BRAINKIT_HOOK_DESCRIPTION_PREFIX` OR matches an entry in
 *     `LEGACY_BRAINKIT_HOOK_DESCRIPTIONS`) from the existing array, then
 *     append brainkit's fresh entries. Preserves user entries; idempotent
 *     across N launches; safe across upgrades from prior brainkit versions
 *     that used unprefixed descriptions.
 *   - User-added event keys not present in `brainkitOwned.hooks` are
 *     preserved untouched.
 *   - If existing event value is not an array (malformed), brainkit
 *     overwrites it.
 *
 * **Canonical key order is load-bearing:** `JSON.stringify` preserves
 * insertion order, and the skip-on-unchanged check is byte-equality based.
 * If the output key order varied across launches, the file would be
 * rewritten on every launch even when content was semantically identical.
 *
 * Pure function — no I/O. Pass `null` for `existing` when the file doesn't
 * exist or was unparseable.
 */
export function mergeCopilotSettings(
  existing: Record<string, unknown> | null,
  brainkitOwned: {
    companyAnnouncements: string[];
    statusLine: { command: string };
    hooks: Record<string, HookEntry[]>;
  },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 1. Carry over all non-brainkit-owned keys from existing FIRST, preserving
  //    their insertion order. This must happen before any brainkit-owned key
  //    is set so the canonical order is: [user keys..., brainkit keys...].
  if (existing !== null) {
    for (const [key, value] of Object.entries(existing)) {
      if (!BRAINKIT_OWNED_SETTINGS_KEYS.includes(key as (typeof BRAINKIT_OWNED_SETTINGS_KEYS)[number])) {
        result[key] = value;
      }
    }
  }

  // 2. Brainkit-owned scalar keys: replace wholesale, fixed order.
  result["companyAnnouncements"] = brainkitOwned.companyAnnouncements;
  result["statusLine"] = brainkitOwned.statusLine;

  // 3. Hooks: per-event merge.
  const existingHooks: HooksObject =
    existing !== null && typeof existing["hooks"] === "object" && existing["hooks"] !== null
      ? (existing["hooks"] as HooksObject)
      : {};
  const mergedHooks: Record<string, HookEntry[]> = {};

  // 3a. Carry over user-only event keys (events brainkit doesn't manage).
  for (const [event, entries] of Object.entries(existingHooks)) {
    if (!(event in brainkitOwned.hooks) && Array.isArray(entries)) {
      mergedHooks[event] = entries as HookEntry[];
    }
  }

  // 3b. For each brainkit-managed event: strip brainkit-owned entries
  //     (current-prefix OR legacy exact-match) from existing, then append
  //     fresh brainkit entries.
  for (const [event, brainkitEntries] of Object.entries(brainkitOwned.hooks)) {
    const existingEntries = existingHooks[event];
    const userEntries: HookEntry[] = Array.isArray(existingEntries)
      ? (existingEntries as HookEntry[]).filter((entry) => !isBrainkitOwnedHookEntry(entry))
      : [];
    mergedHooks[event] = [...userEntries, ...brainkitEntries];
  }

  result["hooks"] = mergedHooks;
  return result;
}

/**
 * True if a hook entry is brainkit-owned (current `brainkit:` prefix or any
 * legacy exact-match description from prior versions). Used by the merge to
 * strip brainkit entries before re-appending fresh ones.
 */
function isBrainkitOwnedHookEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const desc = (entry as { description?: unknown }).description;
  if (typeof desc !== "string") return false;
  if (desc.startsWith(BRAINKIT_HOOK_DESCRIPTION_PREFIX)) return true;
  if (LEGACY_BRAINKIT_HOOK_DESCRIPTIONS.has(desc)) return true;
  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test cli/__tests__/copilot.test.ts -t mergeCopilotSettings`
Expected: 9 tests PASS.

- [ ] **Step 5: Run full test file to verify no regressions**

Run: `just test cli/__tests__/copilot.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/copilot.ts cli/__tests__/copilot.test.ts
git commit -m "feat(copilot): add mergeCopilotSettings pure function for settings.json merge"
```

---

## Task 3: Wire `mergeCopilotSettings` into `generateCopilotSettings`

**Files:**

- Modify: `cli/copilot.ts` — `generateCopilotSettings`
- Modify: `cli/__tests__/copilot.test.ts` — integration tests via `launchCopilot`

### Step 1: Update existing `generateCopilotSettings` test to expect prefixed description

The existing test at `cli/__tests__/copilot.test.ts:344-359` expects descriptions like "Auto-commit vault changes after agent turns". It now needs to expect the `brainkit:` prefix. Update the assertions:

Find this in `generateCopilotSettings` describe block:

```typescript
expect(settings.hooks.agentStop[0]?.command).toContain("/abs/auto-commit.js");
expect(settings.hooks.sessionEnd[0]?.command).toContain("/abs/auto-commit.js");
```

Add after them:

```typescript
expect(settings.hooks.agentStop[0]?.description).toMatch(/^brainkit:/);
expect(settings.hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
```

(Need the JSON parse type annotation widened to include `description`. Update the type:)

```typescript
const settings = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
  companyAnnouncements: string[];
  statusLine: { command: string };
  hooks: {
    agentStop: { command: string; description: string }[];
    sessionEnd: { command: string; description: string }[];
  };
};
```

### Step 2: Add failing integration tests for the merge behavior end-to-end

Add a new describe block in `cli/__tests__/copilot.test.ts` after the existing `generateCopilotSettings` block:

```typescript
describe("generateCopilotSettings — merge with existing settings.json", () => {
  beforeEach(() => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
  });

  it("preserves user-added top-level keys (e.g. mcpServers) across regeneration", () => {
    fs.writeFileSync(
      path.join(mockCopilotHome(), "settings.json"),
      JSON.stringify({ mcpServers: { foo: { command: "bar" } }, theme: "dark" }),
      "utf-8",
    );
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      mcpServers: unknown;
      theme: string;
      companyAnnouncements: string[];
      statusLine: { command: string };
    };
    expect(after.mcpServers).toEqual({ foo: { command: "bar" } });
    expect(after.theme).toBe("dark");
    expect(after.companyAnnouncements.length).toBeGreaterThan(0);
    expect(after.statusLine.command).toContain("/abs/status.js");
  });

  it("preserves user-added hook entries while refreshing brainkit hook entries", () => {
    fs.writeFileSync(
      path.join(mockCopilotHome(), "settings.json"),
      JSON.stringify({
        hooks: {
          agentStop: [{ command: "user.sh", description: "my hook" }],
          sessionStart: [{ command: "start.sh", description: "user start" }],
        },
      }),
      "utf-8",
    );
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      hooks: {
        agentStop: { command: string; description: string }[];
        sessionEnd: { command: string; description: string }[];
        sessionStart: { command: string; description: string }[];
      };
    };
    // agentStop: user entry preserved, brainkit entry appended.
    expect(after.hooks.agentStop).toHaveLength(2);
    expect(after.hooks.agentStop[0]).toEqual({ command: "user.sh", description: "my hook" });
    expect(after.hooks.agentStop[1]?.description).toMatch(/^brainkit:/);
    // sessionEnd: brainkit only (no existing user entries for that event).
    expect(after.hooks.sessionEnd).toHaveLength(1);
    expect(after.hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
    // sessionStart (user-only event): preserved untouched.
    expect(after.hooks.sessionStart).toEqual([{ command: "start.sh", description: "user start" }]);
  });

  it("idempotent: running generateCopilotSettings twice does not duplicate brainkit hook entries", () => {
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const firstContent = fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8");
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const secondContent = fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8");
    expect(secondContent).toBe(firstContent);
  });

  it("malformed existing settings.json → logs warning, overwrites with brainkit content, does not throw", () => {
    fs.writeFileSync(path.join(mockCopilotHome(), "settings.json"), "{not valid json", "utf-8");
    expect(() => {
      generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    }).not.toThrow();
    expect(mockLog.warn).toHaveBeenCalled();
    const warnMsg = mockLog.warn.mock.calls[0]?.[0] as string;
    expect(warnMsg).toContain("settings.json");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      companyAnnouncements: string[];
    };
    expect(after.companyAnnouncements.length).toBeGreaterThan(0);
  });

  it("skips file write when content is unchanged (idempotent at I/O level)", () => {
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const settingsPath = path.join(mockCopilotHome(), "settings.json");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    try {
      generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
      const writtenPaths = writeSpy.mock.calls.map((call) => String(call[0]));
      expect(writtenPaths).not.toContain(settingsPath);
    } finally {
      writeSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `just test cli/__tests__/copilot.test.ts -t "merge with existing"`
Expected: FAIL — current `generateCopilotSettings` overwrites without merging.

- [ ] **Step 4: Rewrite `generateCopilotSettings` to use `mergeCopilotSettings` + `writeIfChanged`**

Replace the body of `generateCopilotSettings` (around line 399-427):

```typescript
export function generateCopilotSettings(
  copilotHome: string,
  statusScriptPath: string,
  autoCommitScriptPath: string,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });

  // Brainkit-owned content. Hook entries get the `brainkit:` description
  // prefix so the merge can identify and refresh them on re-launch without
  // touching user-added entries under the same event.
  // Schema verified 2026-04-28 against Copilot CLI v1.0.37 (event-keyed inline hooks).
  const brainkitOwned = {
    companyAnnouncements: COMPANY_ANNOUNCEMENTS,
    statusLine: {
      command: `node ${statusScriptPath.replace(/\\/g, "/")}`,
    },
    hooks: {
      agentStop: [
        {
          command: `node ${autoCommitScriptPath.replace(/\\/g, "/")}`,
          description: `${BRAINKIT_HOOK_DESCRIPTION_PREFIX} auto-commit vault changes after agent turns`,
        },
      ],
      sessionEnd: [
        {
          command: `node ${autoCommitScriptPath.replace(/\\/g, "/")}`,
          description: `${BRAINKIT_HOOK_DESCRIPTION_PREFIX} commit any remaining vault changes on session end`,
        },
      ],
    },
  };

  // Read existing settings if present, parse defensively. Malformed JSON
  // falls back to overwrite — we don't want a corrupt file to permanently
  // break launches.
  const settingsPath = path.join(copilotHome, "settings.json");
  let existing: Record<string, unknown> | null = null;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      } else {
        p.log.warn(
          `~/.config/brainkit/copilot/settings.json is not a JSON object — overwriting with brainkit-managed content. Any prior content is lost.`,
        );
      }
    } catch {
      p.log.warn(
        `~/.config/brainkit/copilot/settings.json is not valid JSON — overwriting with brainkit-managed content. Any prior content is lost.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const merged = mergeCopilotSettings(existing, brainkitOwned);
  writeIfChanged(settingsPath, JSON.stringify(merged, null, 2) + "\n");
}
```

- [ ] **Step 5: Run new merge tests to verify they pass**

Run: `just test cli/__tests__/copilot.test.ts -t "merge with existing"`
Expected: 5 tests PASS.

- [ ] **Step 6: Run the full copilot test file to verify no regressions**

Run: `just test cli/__tests__/copilot.test.ts`
Expected: all tests PASS. (The existing `generateCopilotSettings` test from Step 1 of this task should now also pass with the updated `description` assertion.)

- [ ] **Step 7: Add a regression test for `launchCopilot` end-to-end preserving MCP entries**

Add to the `launchCopilot — isolation` describe block in `cli/__tests__/copilot.test.ts`:

```typescript
it("launchCopilot preserves user-added settings.json keys across launches (regression: MCP servers)", () => {
  // First launch: populate everything fresh.
  launchCopilot([], vault);

  // Simulate Copilot CLI runtime adding an MCP server to the file.
  const settingsPath = path.join(mockCopilotHome(), "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  settings["mcpServers"] = { myserver: { command: "node", args: ["/path/server.js"] } };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

  // Second launch: brainkit must NOT clobber mcpServers.
  launchCopilot([], vault);
  const after = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
  expect(after["mcpServers"]).toEqual({ myserver: { command: "node", args: ["/path/server.js"] } });
  expect(after["companyAnnouncements"]).toBeDefined();
});
```

- [ ] **Step 8: Run the new regression test**

Run: `just test cli/__tests__/copilot.test.ts -t "preserves user-added settings"`
Expected: PASS.

- [ ] **Step 9: Run `just check`**

Run: `just check`
Expected: lint + format + test all pass.

- [ ] **Step 10: Commit**

```bash
git add cli/copilot.ts cli/__tests__/copilot.test.ts
git commit -m "feat(copilot): merge user-added keys in settings.json instead of overwriting

Previously, every `brainkit copilot` launch rewrote ~/.config/brainkit/copilot/settings.json
from scratch, silently clobbering any keys Copilot CLI itself wrote at runtime
(MCP servers, approved tools, theme prefs, etc.) and forcing per-launch I/O on
unchanged content.

generateCopilotSettings now reads existing settings.json, merges brainkit-owned
keys (companyAnnouncements, statusLine, hooks) on top while preserving everything
else, and skips the write entirely when the result is unchanged. Hook entries are
tagged with a 'brainkit:' description prefix so brainkit's own entries can be
refreshed across launches without touching user-added hooks under the same event.
Malformed existing JSON falls back to overwrite with a warning."
```

---

## Task 4: Changelog entry

**Files:**

- Modify: `CHANGELOG.md`

### Step 1: Read existing CHANGELOG to match style and find the unreleased section

Read `CHANGELOG.md`. Identify the unreleased / next-version section.

### Step 2: Add the user-facing entry

Add under the appropriate section (likely `### Fixed` or `### Changed` per the existing style):

```markdown
- `brainkit copilot` now preserves user-added entries in `~/.config/brainkit/copilot/settings.json` (such as MCP servers, approved tools, or theme preferences added through Copilot's interactive commands) across launches instead of overwriting them. Per-launch disk I/O for unchanged config files is also skipped.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note settings.json merge behavior"
```

---

## Self-Review Checklist (run before handoff)

- [ ] All Definition of Done items map to a task above.
- [ ] No placeholders ("TBD", "implement later", "similar to Task N") in any step.
- [ ] Type names consistent: `HookEntry`, `BRAINKIT_OWNED_SETTINGS_KEYS`, `BRAINKIT_HOOK_DESCRIPTION_PREFIX`, `LEGACY_BRAINKIT_HOOK_DESCRIPTIONS`, `mergeCopilotSettings`, `isBrainkitOwnedHookEntry`, `writeIfChanged` all match across tasks.
- [ ] Every `expect` assertion in tests matches a behavior the implementation will produce.
- [ ] Existing test at `cli/__tests__/copilot.test.ts:344-359` is updated (Task 3 Step 1) to reflect the new `description` prefix — won't be left broken.
- [ ] Cross-platform: no path separator hard-coding; `replace(/\\/g, "/")` for command paths preserved in `generateCopilotSettings`.
- [ ] Atomicity preserved: all reads happen before writes within the population phase; no change to the ordering invariant established in US-copilot-isolation.
- [ ] **Upgrade safety:** legacy unprefixed brainkit hook descriptions are stripped via `LEGACY_BRAINKIT_HOOK_DESCRIPTIONS` (verified by Task 2 dedicated test). Without this, existing installs would get duplicate auto-commit hooks on first launch after upgrade.
- [ ] **Canonical key order:** `mergeCopilotSettings` produces output keys in fixed order (non-brainkit first in their existing order, then `companyAnnouncements`, `statusLine`, `hooks`). Verified by dedicated test in Task 2. Required for skip-on-unchanged byte-equality to actually skip.
- [ ] **Skip-write tests use `fs.writeFileSync` spies, not mtime comparisons.** Mtime granularity varies by filesystem (1s on FAT/ext3, ~1ns on ext4/APFS/NTFS) — spy-based assertions are reliable across all CI runners.
