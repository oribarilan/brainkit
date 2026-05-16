# Librarian Sub-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a Librarian sub-agent for OpenCode that gives the primary agent vault-scoped search delegation, with zero user configuration.

**Architecture:** The launcher writes a markdown agent file (`librarian.md`) to `~/.config/brainkit/agents/`, which OpenCode discovers via `OPENCODE_CONFIG_DIR`. The server plugin injects delegation instructions into the system prompt so the primary agent knows how to invoke it. No `brainkit.toml` config, no flags, no user setup.

**Tech Stack:** TypeScript, OpenCode markdown agent format (YAML frontmatter + prompt body)

---

## File Map

| File                                     | Action | Responsibility                                                              |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `core/librarian-agent.ts`                | Create | Builds the complete `librarian.md` content (YAML frontmatter + prompt body) |
| `core/__tests__/librarian-agent.test.ts` | Create | Tests for the agent file builder                                            |
| `core/prompt-sections.ts`                | Modify | Add `buildDelegation()` section builder                                     |
| `core/__tests__/prompt-sections.test.ts` | Modify | Add delegation tests, remove Thinker/Consultant tests                       |
| `cli/launch.ts`                          | Modify | Write `librarian.md` to agents dir when vault exists                        |
| `cli/__tests__/launch.test.ts`           | Modify | Test agent file writing, update allowed-keys test                           |
| `opencode/server.ts`                     | Modify | Inject delegation section in `system.transform`                             |
| `core/agent-prompts.ts`                  | Delete | Replaced by `core/librarian-agent.ts`                                       |
| `core/types.ts`                          | Modify | Remove `agents?` field from `BrainkitConfig`                                |
| `core/index.ts`                          | Modify | Update exports (remove old, add new)                                        |
| `specs/10-agents.md`                     | Modify | Rewrite to reflect simplified design                                        |

---

### Task 1: Build Librarian agent file builder (TDD)

**Files:**

- Create: `core/__tests__/librarian-agent.test.ts`
- Create: `core/librarian-agent.ts`

This task creates the function that generates the full `librarian.md` content: YAML frontmatter (description, mode, permissions) + prompt body (role, vault structure, key files, search instructions).

- [ ] **Step 1: Write the failing tests**

Create `core/__tests__/librarian-agent.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { BrainkitConfig } from "../types.js";
import { buildLibrarianAgentFile } from "../librarian-agent.js";

function makeConfig(overrides?: Partial<BrainkitConfig>): BrainkitConfig {
  return {
    version: 1,
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["TypeScript"],
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

describe("buildLibrarianAgentFile", () => {
  it("starts with YAML frontmatter delimiters", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---\n/);
  });

  it("sets mode to subagent in frontmatter", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("mode: subagent");
  });

  it("sets hidden to true in frontmatter", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("hidden: true");
  });

  it("includes description in frontmatter", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("description:");
  });

  it("denies edit permission", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("edit: deny");
  });

  it("denies task permission (no delegation from librarian)", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("task: deny");
  });

  it("scopes external_directory to vault path", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/home/user/brain/personal");
    expect(result).toContain('"/home/user/brain/personal/**": allow');
    expect(result).toContain('"*": deny');
  });

  it("allows read-only bash commands", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    for (const cmd of ["cat", "grep", "find", "ls", "head", "tail", "wc"]) {
      expect(result).toContain(`"${cmd} *": allow`);
    }
  });

  it("denies all other bash commands", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    // The bash section should have a "*": deny catch-all
    const bashSection = result.slice(result.indexOf("bash:"));
    expect(bashSection).toContain('"*": deny');
  });

  it("includes Librarian role in prompt body", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("Librarian");
    expect(result).toContain("vault search specialist");
  });

  it("includes vault path in prompt body", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/my/vault");
    // Should appear in the prompt body (after frontmatter)
    const body = result.split("---\n").slice(2).join("---\n");
    expect(body).toContain("/my/vault");
  });

  it("includes PARA structure in prompt body", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("01_projects/");
    expect(result).toContain("04_archive/");
  });

  it("includes key files when features are enabled", () => {
    const config = makeConfig({ features: { bragfile: true, contacts: true } });
    const result = buildLibrarianAgentFile(config, "/fake/vault");
    expect(result).toContain("bragfile.md");
    expect(result).toContain("contacts.md");
  });

  it("omits key files when features are disabled", () => {
    const config = makeConfig({ features: { bragfile: false, contacts: false } });
    const result = buildLibrarianAgentFile(config, "/fake/vault");
    expect(result).not.toContain("bragfile.md");
    expect(result).not.toContain("contacts.md");
  });

  it("includes search instructions in prompt body", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("summary");
    expect(result).toContain("read-only");
  });

  it("does NOT include identity or conventions (librarian is minimal)", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).not.toContain("## Second Brain");
    expect(result).not.toContain("## Conventions");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test core/__tests__/librarian-agent.test.ts`
Expected: FAIL — module `../librarian-agent.js` not found

- [ ] **Step 3: Implement the librarian agent file builder**

Create `core/librarian-agent.ts`:

```typescript
import type { BrainkitConfig } from "./types.js";
import type { SectionContext } from "./prompt-sections.js";
import { joinSections, buildPreamble, buildVaultStructure, buildKeyFiles } from "./prompt-sections.js";

function buildFrontmatter(vaultPath: string): string {
  return [
    "---",
    "description: Vault search specialist. Finds and summarizes relevant vault content.",
    "mode: subagent",
    "hidden: true",
    "permission:",
    "  edit: deny",
    "  bash:",
    '    "*": deny',
    '    "cat *": allow',
    '    "grep *": allow',
    '    "find *": allow',
    '    "ls *": allow',
    '    "head *": allow',
    '    "tail *": allow',
    '    "wc *": allow',
    "  task: deny",
    "  external_directory:",
    '    "*": deny',
    `    "${vaultPath}/**": allow`,
    "---",
  ].join("\n");
}

function buildLibrarianRole(vaultPath: string): string {
  return [
    "## Role",
    "",
    "You are Librarian — brainkit's vault search specialist. Your job is to find relevant information in the user's vault and return a concise, useful summary.",
    "",
    "## Vault",
    "",
    `Path: \`${vaultPath}\``,
    "",
    "## Vault Contents",
    "",
    "Use your read and search tools (`ls`, `find`, `grep`, `cat`) to discover vault contents dynamically. The vault is a git-backed repository — explore it at runtime rather than relying on a static snapshot.",
    "",
    "## Instructions",
    "",
    "1. Read the search query carefully. Understand what the primary agent is looking for.",
    "2. Use your tools to find relevant files and content in the vault.",
    "3. Return a **summary** of what you found — not raw file contents. Include:",
    "   - Which files contained relevant information",
    "   - Key details, quotes, or data points that answer the query",
    "   - How confident you are in the results (exact matches or partial?)",
    "4. If you find nothing relevant, say so clearly. Don't fabricate results.",
    "",
    "## Constraints",
    "",
    "- You are read-only. You cannot modify any files.",
    "- You cannot delegate to other agents.",
    `- Scope your search to the vault at \`${vaultPath}\`. Do not search outside it.`,
    "- Be concise. The primary agent will use your summary to respond to the user — don't include unnecessary context.",
  ].join("\n");
}

export function buildLibrarianAgentFile(config: BrainkitConfig, vaultPath: string): string {
  const ctx: SectionContext = { config, vaultPath, mode: "cli" };
  const frontmatter = buildFrontmatter(vaultPath);
  const body = joinSections([
    buildLibrarianRole(vaultPath),
    buildPreamble(ctx),
    buildVaultStructure(),
    buildKeyFiles(ctx),
  ]);
  return frontmatter + "\n\n" + body;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test core/__tests__/librarian-agent.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add core/librarian-agent.ts core/__tests__/librarian-agent.test.ts
git commit -m "feat: add librarian agent file builder for OpenCode"
```

---

### Task 2: Add delegation section builder (TDD)

**Files:**

- Modify: `core/prompt-sections.ts` (add `buildDelegation`)
- Modify: `core/__tests__/prompt-sections.test.ts` (add delegation tests)

The delegation section tells the primary agent that a Librarian sub-agent is available and how to invoke it. This section is injected by the OpenCode server plugin only — not by Copilot/Claude.

- [ ] **Step 1: Write the failing tests**

Add to `core/__tests__/prompt-sections.test.ts`:

```typescript
import {
  // ... existing imports ...
  buildDelegation,
} from "../prompt-sections.js";

// ... existing tests ...

describe("buildDelegation", () => {
  it("mentions Librarian by name", () => {
    const result = buildDelegation();
    expect(result).toContain("Librarian");
  });

  it("includes task invocation syntax", () => {
    const result = buildDelegation();
    expect(result).toContain("librarian");
    expect(result).toMatch(/task/i);
  });

  it("describes when to delegate", () => {
    const result = buildDelegation();
    expect(result).toMatch(/search|find/i);
    expect(result).toMatch(/vault/i);
  });

  it("describes when NOT to delegate", () => {
    const result = buildDelegation();
    expect(result).toMatch(/already know|single.file|writ/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test core/__tests__/prompt-sections.test.ts`
Expected: FAIL — `buildDelegation` is not exported

- [ ] **Step 3: Implement the delegation section**

Add to `core/prompt-sections.ts`:

```typescript
export function buildDelegation(): string {
  return [
    "## Vault Search Delegation",
    "",
    "You have a sub-agent called Librarian that specializes in vault search. Delegate to it when:",
    "",
    "- The user asks a question that requires searching across multiple vault files",
    "- You need to find specific notes, contacts, meeting notes, or brag entries",
    "- You want to avoid loading large amounts of vault content into your own context",
    "",
    'Delegate via: `task(subagent_type="librarian", prompt="<specific search query>")`',
    "",
    "Write clear, specific search queries. The Librarian returns a summary of what it found — not raw file dumps.",
    "",
    "Do NOT delegate when:",
    "",
    "- You already know the file path (just read it directly)",
    "- The operation is a simple single-file read",
    "- You're writing or editing files (Librarian is read-only)",
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test core/__tests__/prompt-sections.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add core/prompt-sections.ts core/__tests__/prompt-sections.test.ts
git commit -m "feat: add delegation section builder for librarian sub-agent"
```

---

### Task 3: Wire launcher to write agent file

**Files:**

- Modify: `cli/launch.ts` (write `librarian.md` in `ensureOpenCodeConfig`)
- Modify: `cli/__tests__/launch.test.ts` (test agent file writing)

The launcher writes `~/.config/brainkit/agents/librarian.md` when a vault exists. Skipped during onboarding (no vault = no Librarian). Uses `writeIfChanged` for mtime preservation.

- [ ] **Step 1: Write the failing tests**

Add to `cli/__tests__/launch.test.ts`:

```typescript
import { ensureOpenCodeConfig } from "../launch.js";
// (ensureOpenCodeConfig needs to be exported for testing — see step 3)

describe("ensureOpenCodeConfig — librarian agent file", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-launch-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not write agents/ during onboarding (no vault)", () => {
    // This test relies on the function being called without a vaultPath.
    // The actual file writing is validated in the source-level contract below.
    const agentsDir = path.join(tmpDir, "agents");
    expect(fs.existsSync(agentsDir)).toBe(false);
  });
});
```

Add source-level contract test:

```typescript
describe("launchOpenCode agent file contract (source-level)", () => {
  const launchSource = fs.readFileSync(new URL("../launch.ts", import.meta.url), "utf-8");

  it("writes librarian.md to agents directory when vault exists", () => {
    expect(launchSource).toMatch(/librarian\.md/);
  });

  it("uses writeIfChanged for the agent file", () => {
    // Ensure mtime preservation — same pattern as opencode.json
    expect(launchSource).toMatch(/writeIfChanged.*librarian/s);
  });
});
```

Update the allowed-keys test to acknowledge that `buildOpenCodeConfig` itself doesn't change (agent is in a separate file, not in opencode.json):

```typescript
// Existing test stays unchanged — opencode.json still only has $schema, plugin, permission
it("contains only brainkit-owned keys (no leak surface)", () => {
  const allowedKeys = new Set(["$schema", "plugin", "permission"]);
  for (const onboarding of [true, false]) {
    const cfg = buildOpenCodeConfig(onboarding);
    for (const key of Object.keys(cfg)) {
      expect(allowedKeys.has(key), `unexpected key in opencode.json: ${key}`).toBe(true);
    }
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test cli/__tests__/launch.test.ts`
Expected: FAIL — source-level contract tests fail (no `librarian.md` in source yet)

- [ ] **Step 3: Implement agent file writing in the launcher**

Modify `cli/launch.ts`:

Add import at top:

```typescript
import { readVaultConfigSimple } from "../core/index.js";
import { buildLibrarianAgentFile } from "../core/librarian-agent.js";
```

Modify `ensureOpenCodeConfig` to accept `vaultPath` and write the agent file:

```typescript
function ensureOpenCodeConfig(isOnboarding: boolean, vaultPath?: string): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const ocConfigPath = path.join(configDir, "opencode.json");
  const ocContent = JSON.stringify(buildOpenCodeConfig(isOnboarding), null, 2) + "\n";
  writeIfChanged(ocConfigPath, ocContent);

  const tuiConfigPath = path.join(configDir, "tui.json");
  const tuiContent = JSON.stringify(buildOpenCodeTuiConfig(), null, 2) + "\n";
  writeIfChanged(tuiConfigPath, tuiContent);

  // Write librarian agent file when a vault exists
  const agentsDir = path.join(configDir, "agents");
  if (vaultPath !== undefined) {
    try {
      const vaultConfig = readVaultConfigSimple(vaultPath);
      if (vaultConfig) {
        fs.mkdirSync(agentsDir, { recursive: true });
        const agentContent = buildLibrarianAgentFile(vaultConfig, vaultPath);
        writeIfChanged(path.join(agentsDir, "librarian.md"), agentContent);
      }
    } catch {
      // Gracefully skip — no Librarian, but OpenCode still works
    }
  }
}
```

Update `launchOpenCode` to pass `vaultPath` through:

```typescript
function launchOpenCode(args: string[], vaultPath?: string): void {
  const isOnboarding = vaultPath === undefined;
  ensureOpenCodeConfig(isOnboarding, vaultPath);
  // ... rest unchanged
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test cli/__tests__/launch.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add cli/launch.ts cli/__tests__/launch.test.ts
git commit -m "feat: launcher writes librarian agent file for OpenCode"
```

---

### Task 4: Wire server plugin to inject delegation

**Files:**

- Modify: `opencode/server.ts`

The `system.transform` hook already injects the brainkit system prompt. When a vault exists, it also pushes the delegation section so the primary agent knows about Librarian.

- [ ] **Step 1: Add delegation import and injection**

Add import:

```typescript
import { buildDelegation } from "../core/prompt-sections.ts";
```

Modify the `experimental.chat.system.transform` hook to append delegation:

```typescript
"experimental.chat.system.transform": async (_input, output) => {
  const vaultPath = resolveVaultPath();
  if (!vaultPath) {
    const onboardingPrompt = buildOnboardingPrompt("opencode");
    if (!output.system.includes(onboardingPrompt)) {
      output.system.push(onboardingPrompt);
    }
    return;
  }
  try {
    const vaultConfig = readVaultConfigSimple(vaultPath);
    if (!vaultConfig) return;
    const prompt = buildSystemPrompt(vaultConfig, vaultPath, { mode: "cli" });
    if (!output.system.includes(prompt)) {
      output.system.push(prompt);
    }
    // Delegation instructions for the Librarian sub-agent
    const delegation = buildDelegation();
    if (!output.system.includes(delegation)) {
      output.system.push(delegation);
    }
  } catch {
    // Gracefully handle missing vault
  }
},
```

- [ ] **Step 2: Verify the plugin loads without errors**

Run: `just lint`
Expected: No type errors in `opencode/server.ts`

- [ ] **Step 3: Commit**

```bash
git add opencode/server.ts
git commit -m "feat: inject librarian delegation instructions in OpenCode system prompt"
```

---

### Task 5: Remove dead code

**Files:**

- Delete: `core/agent-prompts.ts`
- Modify: `core/types.ts` (remove `agents?` field)
- Modify: `core/index.ts` (update exports)
- Modify: `core/__tests__/prompt-sections.test.ts` (remove old agent prompt tests)

- [ ] **Step 1: Remove Thinker/Consultant/Librarian tests from prompt-sections.test.ts**

Remove these `describe` blocks from `core/__tests__/prompt-sections.test.ts`:

- `buildThinkerPrompt`
- `buildConsultantPrompt`
- `buildLibrarianPrompt`
- `agent prompts use cli mode`

Also remove the import line:

```typescript
import { buildThinkerPrompt, buildConsultantPrompt, buildLibrarianPrompt } from "../agent-prompts.js";
```

- [ ] **Step 2: Remove agent-prompts.ts exports from core/index.ts**

In `core/index.ts`, remove line 51:

```typescript
export { buildThinkerPrompt, buildConsultantPrompt, buildLibrarianPrompt } from "./agent-prompts.js";
```

Add the new export:

```typescript
export { buildLibrarianAgentFile } from "./librarian-agent.js";
```

- [ ] **Step 3: Remove `agents?` field from BrainkitConfig**

In `core/types.ts`, remove:

```typescript
  agents?: {
    enabled?: boolean;
    keep_builtin_agents?: boolean;
    thinker?: { model?: string };
    consultant?: { model?: string };
    librarian?: { model?: string };
  };
```

- [ ] **Step 4: Delete core/agent-prompts.ts**

```bash
rm core/agent-prompts.ts
```

- [ ] **Step 5: Run full test suite**

Run: `just test`
Expected: All PASS — no references to deleted code remain

- [ ] **Step 6: Run lint**

Run: `just lint`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove thinker/consultant agents, simplify to librarian-only"
```

---

### Task 6: Update spec

**Files:**

- Modify: `specs/10-agents.md`

Rewrite the spec to reflect the simplified design: Librarian as a markdown agent file, no Thinker/Consultant registration, no `brainkit.toml` configuration, delegation via system prompt injection.

- [ ] **Step 1: Rewrite the spec**

Replace the full contents of `specs/10-agents.md` with a concise spec covering:

1. **Overview** — Brainkit registers one sub-agent (Librarian) for OpenCode via a markdown agent file. No user configuration. The primary agent gets delegation instructions via the system prompt. Copilot and Claude don't have sub-agent support.

2. **Librarian** — vault-scoped read-only search specialist. Description, permissions, prompt composition (role + preamble + vault structure + key files). Hidden from `@` autocomplete but invocable by the model.

3. **Delegation** — the `system.transform` hook appends delegation instructions to the system prompt. Describes when to delegate and when not to. Only injected for OpenCode (Copilot/Claude don't get delegation instructions since they have no Librarian).

4. **Implementation** — `core/librarian-agent.ts` builds the markdown file. `cli/launch.ts` writes it to `~/.config/brainkit/agents/librarian.md`. `core/prompt-sections.ts` has `buildDelegation()`. `opencode/server.ts` injects delegation via `system.transform`. No `brainkit.toml` config needed.

5. **Why not a config hook** — OpenCode's plugin API doesn't support agent registration via hooks. Agents are defined via JSON config or markdown files. The markdown file approach is idiomatic and inspectable.

- [ ] **Step 2: Commit**

```bash
git add specs/10-agents.md
git commit -m "docs: rewrite agent spec for simplified librarian-only design"
```
