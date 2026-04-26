# Streamlined First-Run Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `brainkit` launch immediately for first-time users with no config, and let the agent guide them through vault setup conversationally.

**Architecture:** Remove the CLI hard-exit on missing config; instead launch the harness with no vault. The server plugin detects the missing vault and injects an onboarding system prompt. The agent creates all files mid-conversation. Dynamic vault path resolution allows automatic transition to the normal prompt once files exist.

**Tech Stack:** TypeScript, Vitest, OpenCode plugin API

**Spec:** `specs/US-streamlined-onboarding.md`

---

### Task 1: Update `selectVault()` to return undefined instead of exiting

**Files:**

- Modify: `cli/launch.ts:150-155`
- Modify: `cli/index.ts:46`
- Test: `cli/__tests__/vault-selection.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new test to the `selectVault` describe block in `cli/__tests__/vault-selection.test.ts`:

```typescript
it("returns undefined paths when no global config exists", async () => {
  mockReadGlobalConfig.mockReturnValue(null);

  const result = await selectVault(null);
  expect(result.vaultPath).toBeUndefined();
  expect(result.brainPath).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: FAIL — `selectVault` calls `process.exit(1)` which throws `"process.exit called"` (from the mock), instead of returning undefined.

- [ ] **Step 3: Update `selectVault()` in `cli/launch.ts`**

Change the return type and remove the `process.exit`:

```typescript
// Change the return type
export async function selectVault(
  vaultFlag: string | null,
): Promise<{ vaultPath: string | undefined; brainPath: string | undefined }> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    return { vaultPath: undefined, brainPath: undefined };
  }
  // ... rest unchanged
```

- [ ] **Step 4: Update `cli/index.ts` to handle undefined vaultPath**

The `vaultPath` destructured at line 46 may now be `undefined`. This is already compatible with `launchHarness` and `detectAndLaunch` which accept `vaultPath?: string`. No functional change needed, just ensure the types flow through:

```typescript
// line 46 — no code change needed, just verify this compiles:
const { vaultPath } = await selectVault(vaultFlag);
```

The type of `vaultPath` becomes `string | undefined`, and both `launchHarness` (line 52) and `detectAndLaunch` (line 57) already accept `vaultPath?: string`.

- [ ] **Step 5: Update existing test that mocked process.exit for no-config case**

The existing test `"exits with error when --vault names a nonexistent vault"` (line 86) still uses `process.exit` for a different scenario (valid config, bad vault name) — that test stays as-is.

Remove the `process.exit` spy from `beforeEach` if it's no longer needed for any remaining test. Check: the nonexistent vault test (line 86) still needs it. Keep the spy but verify the new test does NOT trigger it:

```typescript
it("returns undefined paths when no global config exists", async () => {
  mockReadGlobalConfig.mockReturnValue(null);

  const result = await selectVault(null);
  expect(result.vaultPath).toBeUndefined();
  expect(result.brainPath).toBeUndefined();
  expect(process.exit).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run all tests to verify everything passes**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: All tests pass, including the new one and the existing ones.

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit -p cli/tsconfig.json 2>&1 || npx tsc --noEmit 2>&1 || echo "check AGENTS.md for typecheck command"`
Verify no type errors from the return type change.

- [ ] **Step 8: Commit**

```bash
git add cli/launch.ts cli/index.ts cli/__tests__/vault-selection.test.ts
git commit -m "feat: selectVault returns undefined instead of exiting when no config"
```

---

### Task 2: Server plugin — dynamic vault path resolution

**Files:**

- Modify: `opencode/server.ts:38-115`

- [ ] **Step 1: Move `resolveVaultPath()` from init-time to per-call**

In `opencode/server.ts`, remove the cached `vaultPath` variable and call `resolveVaultPath()` inside each hook:

```typescript
const server: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const vaultPath = resolveVaultPath();
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
      const vaultPath = resolveVaultPath();
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
      const vaultPath = resolveVaultPath();

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
```

- [ ] **Step 2: Verify the plugin still works with existing vaults**

Run: `just lint`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add opencode/server.ts
git commit -m "refactor: resolve vault path per-call instead of caching at init"
```

---

### Task 3: Server plugin — onboarding prompt injection

**Files:**

- Modify: `opencode/server.ts`

- [ ] **Step 1: Add the onboarding prompt constant**

Add the `ONBOARDING_PROMPT` constant to `opencode/server.ts`, above the `server` function:

```typescript
const ONBOARDING_PROMPT = `## Brainkit — First-Time Setup

You are brainkit, a personal second brain assistant. This user has no vault configured yet. Your job is to guide them through setting up their first vault in a natural, conversational way.

### How to guide setup

Ask one topic at a time. Be conversational — this is a getting-to-know-you chat, not a form. Offer sensible defaults and alternatives.

1. **Brain location** — Ask where they'd like to store their brain directory. Suggest \`~/brain\`. Explain it's a folder (ideally git-backed) that will hold their vaults.

2. **Vault name** — Ask what to call their first vault. Recommend starting with a work-related vault (e.g., "work"). Mention that brainkit supports multiple vaults, so they can always add a "life" or "side-projects" vault later.

3. **Basics** — Ask their name, professional role, and main areas of expertise.

4. **Professional context** — Ask about current projects, team, key collaborators, and work rhythm (meetings, async work, etc.).

5. **Personal context** — Transition naturally: "Let's set up the personal side too." Ask about life outside work — family, personal projects, responsibilities, hobbies. If they want to skip this, respect that immediately.

6. **Preferences** — Ask how they'd like you to communicate (direct and technical, casual, concise, etc.) and whether they have any rules they want you to always follow.

### What to create

After gathering enough information, create all of these:

**1. Global config** at \`~/.config/brainkit/config.toml\`:

\`\`\`toml
version = 1
brain_path = "~/brain"
\`\`\`

Replace \`~/brain\` with whatever path they chose.

**2. Vault directory** at \`<brain_path>/<vault_name>/\`

**3. Vault config** at \`<brain_path>/<vault_name>/brainkit.toml\`:

\`\`\`toml
version = 1

[user]
name = "Their Name"
role = "Their Role"
expertise = ["skill1", "skill2"]
tone = "their preferred tone"

[user.work]
description = "Work context summary"

[user.personal]
description = "Personal context summary"

[user.customization]
context = """
Professional: [role] at [company]. [team context]. Current focus: [projects].
Personal: [family/living situation]. Interests: [hobbies]. Ongoing: [personal projects/responsibilities].
"""
rules = []
onboarding_complete = false

[features]
bragfile = true
contacts = true
\`\`\`

**4. PARA directories** with a README.md in each:
- \`01_projects/README.md\`
- \`02_areas/README.md\`
- \`03_resources/README.md\`
- \`04_archive/README.md\`

**5. Key files:**
- \`02_areas/career/bragfile.md\` (with \`# Bragfile\` heading)
- \`03_resources/contacts.md\` (with \`# Contacts\` heading)

**6. Pre-create directories** based on the conversation:
- Projects mentioned → \`01_projects/<project-name>/README.md\`
- Areas mentioned → \`02_areas/<area-name>/README.md\`
- Interests/resources → \`03_resources/<topic>/README.md\`

**7. First entries** — if they mentioned a recent accomplishment, offer to add it as the first brag entry. If they mentioned colleagues, offer to add them as first contacts.

### After setup

Summarize what was created: directories, config, first entries. Mention they can always adjust settings by editing \`brainkit.toml\` or just asking you.

### Tone

Warm but efficient. One topic at a time. Don't dump all questions at once. If they volunteer information, use it — don't re-ask. If they want to skip personal stuff, move on immediately.

### Important

- Use \`kebab-case\` for all directory and file names (e.g., \`my-project\`, not \`My Project\`)
- All README.md files should have a heading matching the directory name
- The brain directory should be initialized as a git repo (\`git init\`) if it isn't already
- Directory names: use lowercase with hyphens`;
```

- [ ] **Step 2: Inject the onboarding prompt when no vault is found**

Update the `experimental.chat.system.transform` hook to inject the onboarding prompt when `resolveVaultPath()` returns `undefined`:

```typescript
"experimental.chat.system.transform": async (_input, output) => {
  const vaultPath = resolveVaultPath();
  if (!vaultPath) {
    if (!output.system.includes(ONBOARDING_PROMPT)) {
      output.system.push(ONBOARDING_PROMPT);
    }
    return;
  }
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
```

- [ ] **Step 3: Run lint**

Run: `just lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add opencode/server.ts
git commit -m "feat: inject onboarding prompt when no vault configured"
```

---

### Task 4: Add multi-vault tip

**Files:**

- Modify: `opencode/tips.tsx:6-15`

- [ ] **Step 1: Add the multi-vault tip**

Add a new entry to the `tips` array in `opencode/tips.tsx`:

```typescript
const tips = [
  "/doctor to check vault health",
  "mention an accomplishment and I'll offer to capture it",
  "I can create meeting notes from any conversation",
  "ask me about your vault stats",
  "I can search your vault for anything",
  "I organize using the PARA method",
  "I'll remind you if your bragfile gets stale",
  "@ a vault file to add it as context",
  "you can add another vault anytime — just ask me to set one up",
];
```

- [ ] **Step 2: Commit**

```bash
git add opencode/tips.tsx
git commit -m "feat: add multi-vault tip to rotating tips"
```

---

### Task 5: Update existing tests for new selectVault behavior

**Files:**

- Test: `cli/__tests__/vault-selection.test.ts`

- [ ] **Step 1: Verify no existing tests broke**

Run: `npx vitest run`
Expected: All 63+ tests pass. If the test added in Task 1 is already passing, this is a verification step.

- [ ] **Step 2: Add test for `selectVault` with empty brain_path**

```typescript
it("returns undefined paths when global config has empty brain_path", async () => {
  mockReadGlobalConfig.mockReturnValue({ version: 1, brain_path: "" });

  const result = await selectVault(null);
  expect(result.vaultPath).toBeUndefined();
  expect(result.brainPath).toBeUndefined();
  expect(process.exit).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run cli/__tests__/vault-selection.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add cli/__tests__/vault-selection.test.ts
git commit -m "test: add edge case tests for selectVault with no config"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run lint and typecheck**

Run: `just lint`
Expected: No errors.

- [ ] **Step 3: Run format check**

Run: `just check`
Expected: All checks pass (lint + format + tests).
