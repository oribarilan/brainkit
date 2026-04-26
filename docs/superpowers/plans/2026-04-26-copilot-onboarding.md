# Copilot First-Run Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Copilot CLI users to onboard without requiring OpenCode — the agent guides vault setup conversationally from a temporary workspace.

**Architecture:** Extract the onboarding prompt from `opencode/server.ts` into a shared `core/onboarding-prompt.ts` module. Add a `launchCopilotOnboarding` path in `cli/copilot.ts` that creates a temporary workspace with an AGENTS.md, spawns Copilot there, and lets the agent handle setup. Normal launches clean up the onboarding workspace.

**Tech Stack:** TypeScript, Node.js fs/path/os, existing test patterns (vitest + temp dirs)

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `core/onboarding-prompt.ts` | Create | Shared onboarding prompt builder |
| `core/__tests__/onboarding-prompt.test.ts` | Create | Tests for `buildOnboardingPrompt` |
| `core/index.ts` | Modify | Add barrel export |
| `opencode/server.ts` | Modify | Replace inline prompt with import |
| `cli/copilot.ts` | Modify | Add onboarding flow + cleanup |
| `cli/__tests__/copilot.test.ts` | Modify | Add onboarding workspace tests |

---

### Task 1: Create `core/onboarding-prompt.ts` (TDD)

**Files:**
- Create: `core/__tests__/onboarding-prompt.test.ts`
- Create: `core/onboarding-prompt.ts`

- [ ] **Step 1: Write the tests**

Create `core/__tests__/onboarding-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildOnboardingPrompt } from "../onboarding-prompt.js";

describe("buildOnboardingPrompt", () => {
  it("returns prompt containing first-time setup header", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("Brainkit — First-Time Setup");
  });

  it("includes all setup steps", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("Brain location");
    expect(result).toContain("Vault name");
    expect(result).toContain("Basics");
    expect(result).toContain("Professional context");
    expect(result).toContain("Personal context");
    expect(result).toContain("Preferences");
  });

  it("includes config file templates", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("config.toml");
    expect(result).toContain("brainkit.toml");
  });

  it("opencode variant does not contain restart instruction", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).not.toContain("run `brainkit` again");
  });

  it("copilot variant contains restart instruction", () => {
    const result = buildOnboardingPrompt("copilot");
    expect(result).toContain("run `brainkit` again");
  });

  it("copilot variant is a superset of opencode variant", () => {
    const opencode = buildOnboardingPrompt("opencode");
    const copilot = buildOnboardingPrompt("copilot");
    expect(copilot).toContain(opencode);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run core/__tests__/onboarding-prompt.test.ts
```

Expected: FAIL — module `../onboarding-prompt.js` not found.

- [ ] **Step 3: Implement `core/onboarding-prompt.ts`**

Create `core/onboarding-prompt.ts`:

```typescript
// ---------------------------------------------------------------------------
// Shared onboarding prompt — used by both OpenCode plugin and Copilot launcher
// ---------------------------------------------------------------------------

const ONBOARDING_PROMPT_BODY = `## Brainkit — First-Time Setup

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

const COPILOT_CLOSING = `

### Restart required

After creating all files, tell the user: "Setup complete! Close this session and run \`brainkit\` again to start with your full second brain — all skills, vault tools, and personalized settings will be loaded."`;

export function buildOnboardingPrompt(harness: "opencode" | "copilot"): string {
  if (harness === "copilot") {
    return ONBOARDING_PROMPT_BODY + COPILOT_CLOSING;
  }
  return ONBOARDING_PROMPT_BODY;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run core/__tests__/onboarding-prompt.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add core/onboarding-prompt.ts core/__tests__/onboarding-prompt.test.ts
git commit -m "feat: extract shared onboarding prompt to core module"
```

---

### Task 2: Wire into barrel export and update OpenCode server

**Files:**
- Modify: `core/index.ts`
- Modify: `opencode/server.ts`

- [ ] **Step 1: Add export to `core/index.ts`**

Add after the "System prompt" section (after line 41):

```typescript
// Onboarding
export { buildOnboardingPrompt } from "./onboarding-prompt.js";
```

- [ ] **Step 2: Update `opencode/server.ts`**

Add `buildOnboardingPrompt` to the import from core. Replace:

```typescript
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "../core/index.ts";
```

With:

```typescript
import {
  readGlobalConfig,
  readVaultConfigSimple,
  discoverVaults,
  buildSystemPrompt,
  buildOnboardingPrompt,
  containsUserAccomplishment,
  scheduleAutoCommit,
} from "../core/index.ts";
```

Delete the entire `ONBOARDING_PROMPT` constant (lines 38-133).

Replace its usage on line 140-141:

```typescript
        if (!output.system.includes(ONBOARDING_PROMPT)) {
          output.system.push(ONBOARDING_PROMPT);
```

With:

```typescript
        const onboardingPrompt = buildOnboardingPrompt("opencode");
        if (!output.system.includes(onboardingPrompt)) {
          output.system.push(onboardingPrompt);
```

- [ ] **Step 3: Verify compilation and tests**

Run:
```bash
npx tsc --noEmit && npx vitest run
```

Expected: all clean — the OpenCode server behavior is identical.

- [ ] **Step 4: Commit**

```bash
git add core/index.ts opencode/server.ts
git commit -m "refactor: use shared onboarding prompt in OpenCode server"
```

---

### Task 3: Add onboarding flow to `cli/copilot.ts` (TDD)

**Files:**
- Modify: `cli/__tests__/copilot.test.ts`
- Modify: `cli/copilot.ts`

- [ ] **Step 1: Write tests for onboarding workspace**

Add to `cli/__tests__/copilot.test.ts`, after the existing `installCopilotHooks` describe block:

```typescript
import { ensureOnboardingWorkspace, cleanupOnboardingWorkspace } from "../copilot.js";

describe("ensureOnboardingWorkspace", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("creates onboarding directory", () => {
    ensureOnboardingWorkspace(configDir);
    const onboardingDir = path.join(configDir, "onboarding");
    expect(fs.existsSync(onboardingDir)).toBe(true);
  });

  it("writes AGENTS.md with onboarding prompt", () => {
    ensureOnboardingWorkspace(configDir);
    const agentsPath = path.join(configDir, "onboarding", "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);

    const content = fs.readFileSync(agentsPath, "utf-8");
    expect(content).toContain("Brainkit — First-Time Setup");
  });

  it("AGENTS.md contains copilot restart instruction", () => {
    ensureOnboardingWorkspace(configDir);
    const agentsPath = path.join(configDir, "onboarding", "AGENTS.md");
    const content = fs.readFileSync(agentsPath, "utf-8");
    expect(content).toContain("run `brainkit` again");
  });

  it("returns the onboarding directory path", () => {
    const result = ensureOnboardingWorkspace(configDir);
    expect(result).toBe(path.join(configDir, "onboarding"));
  });

  it("is idempotent — can be called multiple times", () => {
    ensureOnboardingWorkspace(configDir);
    ensureOnboardingWorkspace(configDir);

    const agentsPath = path.join(configDir, "onboarding", "AGENTS.md");
    expect(fs.existsSync(agentsPath)).toBe(true);
  });
});

describe("cleanupOnboardingWorkspace", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("removes onboarding directory when it exists", () => {
    const onboardingDir = path.join(configDir, "onboarding");
    fs.mkdirSync(onboardingDir, { recursive: true });
    fs.writeFileSync(path.join(onboardingDir, "AGENTS.md"), "test", "utf-8");

    cleanupOnboardingWorkspace(configDir);
    expect(fs.existsSync(onboardingDir)).toBe(false);
  });

  it("does nothing when onboarding directory does not exist", () => {
    // Should not throw
    cleanupOnboardingWorkspace(configDir);
    expect(fs.existsSync(path.join(configDir, "onboarding"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run cli/__tests__/copilot.test.ts
```

Expected: FAIL — `ensureOnboardingWorkspace` and `cleanupOnboardingWorkspace` not exported from `../copilot.js`.

- [ ] **Step 3: Implement the onboarding functions in `cli/copilot.ts`**

Add `os` import. Replace:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt } from "../core/index.js";
```

With:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt, buildOnboardingPrompt } from "../core/index.js";
```

Add the onboarding workspace functions before the `launchCopilot` function (before the "Launch orchestrator" section):

```typescript
// ---------------------------------------------------------------------------
// Onboarding workspace
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
    // Best-effort cleanup
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run cli/__tests__/copilot.test.ts
```

Expected: all tests pass (existing + new).

- [ ] **Step 5: Update `launchCopilot` to use onboarding flow**

Replace the entire `launchCopilot` function with:

```typescript
export function launchCopilot(args: string[], selectedVaultPath?: string): void {
  let vaultPath = selectedVaultPath;

  if (vaultPath === undefined) {
    const globalConfig = readGlobalConfig();
    if (globalConfig === null || !globalConfig.brain_path) {
      // No vault configured — launch onboarding
      const configDir = path.join(os.homedir(), ".config", "brainkit");
      const onboardingDir = ensureOnboardingWorkspace(configDir);

      p.outro("Starting onboarding...");
      const child = spawn("copilot", args, { stdio: "inherit", cwd: onboardingDir });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    vaultPath = globalConfig.brain_path;
  }

  // Clean up onboarding workspace from a previous first run
  const configDir = path.join(os.homedir(), ".config", "brainkit");
  cleanupOnboardingWorkspace(configDir);

  const config = readVaultConfigSimple(vaultPath);

  // Install skills
  const packageRoot = findPackageRoot();
  const skillsSourceDir = path.join(packageRoot, "skills");
  const targetDir = path.join(vaultPath, ".agents", "skills", "brainkit");
  installSkills({ skillsSourceDir, targetDir, version });

  // Generate AGENTS.md
  writeAgentsMd(vaultPath, config);

  // Install hooks
  installCopilotHooks(vaultPath);

  // Write Copilot settings
  const statusScriptPath = path.join(packageRoot, "dist", "cli", "copilot-status.js");
  generateCopilotSettings(vaultPath, statusScriptPath);

  // Update .gitignore
  updateGitignore(vaultPath);

  // Spawn copilot with BRAINKIT_VAULT_PATH for status script
  const env = { ...process.env, BRAINKIT_VAULT_PATH: vaultPath };
  const child = spawn("copilot", args, { stdio: "inherit", cwd: vaultPath, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

- [ ] **Step 6: Verify compilation and all tests**

Run:
```bash
npx tsc --project cli/tsconfig.json --noEmit && npx vitest run
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add cli/copilot.ts cli/__tests__/copilot.test.ts
git commit -m "feat(cli): add copilot first-run onboarding flow"
```

---

### Task 4: Full verification

- [ ] **Step 1: Build CLI**

Run:
```bash
just build-cli
```

Expected: compiles to `dist/` without errors.

- [ ] **Step 2: Run all tests**

Run:
```bash
just test
```

Expected: all tests pass.

- [ ] **Step 3: Run lint + typecheck**

Run:
```bash
just lint
```

Expected: clean.

- [ ] **Step 4: Test help output still works**

Run:
```bash
node dist/cli/index.js --help
```

Expected: branded intro, boxed usage, outro.

- [ ] **Step 5: Test version output**

Run:
```bash
node dist/cli/index.js --version
```

Expected: plain version string.
