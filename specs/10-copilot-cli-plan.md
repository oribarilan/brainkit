# Copilot CLI harness implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Copilot CLI as a second harness to brainkit, with skill installation, AGENTS.md generation, auto-commit hooks, and visual touches via companyAnnouncements + statusLine.

**Architecture:** The Copilot launcher installs skills, hooks, and config into the vault directory (not `~/.copilot/`), then spawns `copilot` with CWD set to the vault path. A shared `install-skills.ts` module handles Agent Skills standard skill installation, reusable by future harnesses.

**Tech Stack:** TypeScript (Node.js built-ins only), shell scripts for hooks, vitest for tests.

---

### Task 1: Skill installer — tests

**Files:**

- Create: `cli/__tests__/install-skills.test.ts`

- [ ] **Step 1: Write tests for skill installation**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installSkills } from "../install-skills.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
}

function createSourceSkills(dir: string): void {
  // Root skill
  const brainkitDir = path.join(dir, "brainkit");
  fs.mkdirSync(brainkitDir, { recursive: true });
  fs.writeFileSync(
    path.join(brainkitDir, "SKILL.md"),
    "---\ndescription: Core brainkit conventions\n---\n\n# Skill: brainkit\n\nSome content here.\n",
  );

  // Sub-skill: para
  const paraDir = path.join(dir, "para");
  fs.mkdirSync(paraDir, { recursive: true });
  fs.writeFileSync(
    path.join(paraDir, "SKILL.md"),
    "---\ndescription: PARA method\n---\n\n# Skill: PARA method\n\nPARA content.\n",
  );

  // Sub-skill: bragfile
  const bragDir = path.join(dir, "bragfile");
  fs.mkdirSync(bragDir, { recursive: true });
  fs.writeFileSync(
    path.join(bragDir, "SKILL.md"),
    "---\ndescription: Bragfile format\n---\n\n# Bragfile\n\nBragfile content.\n",
  );
}

describe("installSkills", () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir();
    targetDir = path.join(makeTempDir(), ".agents", "skills", "brainkit");
    createSourceSkills(sourceDir);
  });

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(path.resolve(targetDir, "../../.."), { recursive: true, force: true });
  });

  it("creates the target directory structure", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "references"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, ".brainkit-version"))).toBe(true);
  });

  it("adds Agent Skills frontmatter to root SKILL.md", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const content = fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("name: brainkit");
    expect(content).toContain("description:");
    expect(content).toContain("Personal second brain vault");
  });

  it("adds reference links to root SKILL.md", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const content = fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("## Reference skills");
    expect(content).toContain("references/para.md");
    expect(content).toContain("references/bragfile.md");
  });

  it("strips frontmatter from sub-skills", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const paraContent = fs.readFileSync(path.join(targetDir, "references", "para.md"), "utf-8");
    expect(paraContent).not.toContain("---");
    expect(paraContent).toContain("PARA content.");
  });

  it("writes version marker", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const version = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(version).toBe("0.1.0");
  });

  it("skips installation when version matches", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });
    const firstMtime = fs.statSync(path.join(targetDir, "SKILL.md")).mtimeMs;

    // Small delay to ensure mtime would differ
    const result = installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    expect(result.installed).toBe(false);
  });

  it("reinstalls when version differs", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });
    const result = installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.2.0" });

    expect(result.installed).toBe(true);
    const version = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(version).toBe("0.2.0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/__tests__/install-skills.test.ts`
Expected: FAIL — `installSkills` module does not exist.

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/install-skills.test.ts
git commit -m "test: add skill installer tests"
```

---

### Task 2: Skill installer — implementation

**Files:**

- Create: `cli/install-skills.ts`

- [ ] **Step 1: Implement the skill installer**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallSkillsOptions {
  skillsSourceDir: string;
  targetDir: string;
  version: string;
}

export interface InstallSkillsResult {
  installed: boolean;
  version: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_SKILLS_FRONTMATTER = `---
name: brainkit
description: >
  Personal second brain vault using the PARA method. Use when working with
  notes, bragfile entries, contacts, meeting notes, or vault organization.
---`;

const REFERENCE_SKILLS: { dir: string; name: string; label: string }[] = [
  { dir: "para", name: "para.md", label: "PARA method" },
  { dir: "bragfile", name: "bragfile.md", label: "Bragfile" },
  { dir: "contacts", name: "contacts.md", label: "Contacts" },
  { dir: "meeting-notes", name: "meeting-notes.md", label: "Meeting notes" },
  { dir: "maintenance", name: "maintenance.md", label: "Maintenance" },
  { dir: "onboarding", name: "onboarding.md", label: "Onboarding" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) return content;
  return content.slice(endIndex + 3).trimStart();
}

function buildReferenceLinksSection(): string {
  const links = REFERENCE_SKILLS.map((s) => `- [${s.label}](references/${s.name})`);
  return "\n\n## Reference skills\n\n" + links.join("\n") + "\n";
}

function transformRootSkill(sourceContent: string): string {
  const body = stripFrontmatter(sourceContent);
  return AGENT_SKILLS_FRONTMATTER + "\n\n" + body.trimEnd() + buildReferenceLinksSection();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function installSkills(options: InstallSkillsOptions): InstallSkillsResult {
  const { skillsSourceDir, targetDir, version } = options;

  // Check version marker — skip if already up to date
  const versionFile = path.join(targetDir, ".brainkit-version");
  if (fs.existsSync(versionFile)) {
    const existing = fs.readFileSync(versionFile, "utf-8").trim();
    if (existing === version) {
      return { installed: false, version };
    }
  }

  // Create target directory structure
  const refsDir = path.join(targetDir, "references");
  fs.mkdirSync(refsDir, { recursive: true });

  // Transform and write root skill
  const rootSource = fs.readFileSync(path.join(skillsSourceDir, "brainkit", "SKILL.md"), "utf-8");
  fs.writeFileSync(path.join(targetDir, "SKILL.md"), transformRootSkill(rootSource), "utf-8");

  // Copy sub-skills with frontmatter stripped
  for (const skill of REFERENCE_SKILLS) {
    const sourcePath = path.join(skillsSourceDir, skill.dir, "SKILL.md");
    if (!fs.existsSync(sourcePath)) continue;
    const content = fs.readFileSync(sourcePath, "utf-8");
    fs.writeFileSync(path.join(refsDir, skill.name), stripFrontmatter(content), "utf-8");
  }

  // Write version marker
  fs.writeFileSync(versionFile, version + "\n", "utf-8");

  return { installed: true, version };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run cli/__tests__/install-skills.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `just test`
Expected: All tests pass (existing 33 + new 7).

- [ ] **Step 4: Commit**

```bash
git add cli/install-skills.ts
git commit -m "feat: add skill installer for Agent Skills standard distribution"
```

---

### Task 3: Copilot launcher — tests

**Files:**

- Create: `cli/__tests__/copilot.test.ts`

- [ ] **Step 1: Write tests for gitignore updater and settings generation**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { updateGitignore, generateCopilotSettings, installCopilotHooks } from "../copilot.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-copilot-test-"));
}

describe("updateGitignore", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates .gitignore if it does not exist", () => {
    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    expect(content).toContain(".agents/skills/brainkit/");
    expect(content).toContain(".github/hooks/");
    expect(content).toContain(".github/copilot/");
  });

  it("appends to existing .gitignore", () => {
    fs.writeFileSync(path.join(vaultDir, ".gitignore"), "node_modules/\n", "utf-8");

    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".agents/skills/brainkit/");
  });

  it("does not duplicate entries on re-run", () => {
    updateGitignore(vaultDir);
    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    const matches = content.match(/\.agents\/skills\/brainkit\//g);
    expect(matches).toHaveLength(1);
  });
});

describe("generateCopilotSettings", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates settings.json with companyAnnouncements", () => {
    generateCopilotSettings(vaultDir, "/path/to/copilot-status.js");

    const settingsPath = path.join(vaultDir, ".github", "copilot", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    expect(settings.companyAnnouncements).toBeDefined();
    expect(Array.isArray(settings.companyAnnouncements)).toBe(true);
  });

  it("includes statusLine with script path", () => {
    generateCopilotSettings(vaultDir, "/path/to/copilot-status.js");

    const settingsPath = path.join(vaultDir, ".github", "copilot", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    const statusLine = settings.statusLine as Record<string, unknown>;
    expect(statusLine.command).toContain("/path/to/copilot-status.js");
  });
});

describe("installCopilotHooks", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates hooks.json with agentStop and sessionEnd hooks", () => {
    installCopilotHooks(vaultDir);

    const hooksPath = path.join(vaultDir, ".github", "hooks", "hooks.json");
    expect(fs.existsSync(hooksPath)).toBe(true);

    const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as { hooks: { event: string }[] };
    const events = hooks.hooks.map((h) => h.event);
    expect(events).toContain("agentStop");
    expect(events).toContain("sessionEnd");
  });

  it("creates auto-commit.sh script", () => {
    installCopilotHooks(vaultDir);

    const scriptPath = path.join(vaultDir, ".github", "hooks", "scripts", "auto-commit.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);

    const stat = fs.statSync(scriptPath);
    // Check executable bit (owner execute)
    expect(stat.mode & 0o100).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run cli/__tests__/copilot.test.ts`
Expected: FAIL — imports do not exist.

- [ ] **Step 3: Commit**

```bash
git add cli/__tests__/copilot.test.ts
git commit -m "test: add Copilot launcher tests"
```

---

### Task 4: Copilot launcher — implementation

**Files:**

- Create: `cli/copilot.ts`

- [ ] **Step 1: Implement the Copilot launcher module**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt } from "@oribish/brainkit-core";

import { installSkills } from "./install-skills.js";
import { version } from "./version.js";

// ---------------------------------------------------------------------------
// Gitignore
// ---------------------------------------------------------------------------

const GITIGNORE_ENTRIES = [
  "# brainkit — generated files",
  ".agents/skills/brainkit/",
  ".github/hooks/",
  ".github/copilot/",
];

export function updateGitignore(vaultPath: string): void {
  const gitignorePath = path.join(vaultPath, ".gitignore");
  let content = "";
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
  }

  const linesToAdd = GITIGNORE_ENTRIES.filter((line) => !content.includes(line));
  if (linesToAdd.length === 0) return;

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const prefix = content.length > 0 && !content.endsWith("\n\n") ? "\n" : "";
  fs.writeFileSync(gitignorePath, content + separator + prefix + linesToAdd.join("\n") + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Copilot settings
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

export function generateCopilotSettings(vaultPath: string, statusScriptPath: string): void {
  const settingsDir = path.join(vaultPath, ".github", "copilot");
  fs.mkdirSync(settingsDir, { recursive: true });

  const settings = {
    companyAnnouncements: COMPANY_ANNOUNCEMENTS,
    statusLine: {
      type: "command",
      command: `node ${statusScriptPath}`,
    },
  };

  fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const HOOKS_JSON = {
  hooks: [
    {
      event: "agentStop",
      command: ".github/hooks/scripts/auto-commit.sh",
      description: "Auto-commit vault changes after agent turns",
    },
    {
      event: "sessionEnd",
      command: ".github/hooks/scripts/auto-commit.sh",
      description: "Commit any remaining vault changes on session end",
    },
  ],
};

const AUTO_COMMIT_SCRIPT = `#!/usr/bin/env bash
# Only commit if this is a git repo with uncommitted changes
git rev-parse --git-dir > /dev/null 2>&1 || exit 0
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0
git add -A 2>/dev/null || exit 0
git commit -m "brainkit: auto-save $(date +%Y-%m-%d)" > /dev/null 2>&1 || true
`;

export function installCopilotHooks(vaultPath: string): void {
  const hooksDir = path.join(vaultPath, ".github", "hooks");
  const scriptsDir = path.join(hooksDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });

  fs.writeFileSync(path.join(hooksDir, "hooks.json"), JSON.stringify(HOOKS_JSON, null, 2) + "\n", "utf-8");

  const scriptPath = path.join(scriptsDir, "auto-commit.sh");
  fs.writeFileSync(scriptPath, AUTO_COMMIT_SCRIPT, { mode: 0o755 });
}

// ---------------------------------------------------------------------------
// AGENTS.md
// ---------------------------------------------------------------------------

function generateAgentsMd(vaultPath: string): void {
  const config = readVaultConfigSimple(vaultPath);
  const content = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  fs.writeFileSync(path.join(vaultPath, "AGENTS.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8")) as { name?: string };
        if (pkg.name === "@oribish/brainkit") return dir;
      } catch {
        // not valid JSON, keep walking
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find @oribish/brainkit package root");
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

export function launchCopilot(args: string[]): void {
  const globalConfig = readGlobalConfig();
  if (!globalConfig) {
    console.error("  [brainkit] No vault configured.");
    console.error("  [brainkit] Run `brainkit opencode` first to set up a vault.");
    process.exit(1);
  }

  const vaultPath = globalConfig.vault_path;
  if (!fs.existsSync(vaultPath)) {
    console.error(`  [brainkit] Vault path does not exist: ${vaultPath}`);
    process.exit(1);
  }

  const packageRoot = findPackageRoot();
  const skillsSourceDir = path.join(packageRoot, "skills");

  // 1. Install skills
  const skillsTarget = path.join(vaultPath, ".agents", "skills", "brainkit");
  const skillResult = installSkills({ skillsSourceDir, targetDir: skillsTarget, version });
  if (skillResult.installed) {
    console.log(`  [brainkit] Installed skills (v${version})`);
  }

  // 2. Generate AGENTS.md
  generateAgentsMd(vaultPath);

  // 3. Install hooks
  installCopilotHooks(vaultPath);

  // 4. Write Copilot settings
  const statusScriptPath = path.join(packageRoot, "scripts", "copilot-status.js");
  generateCopilotSettings(vaultPath, statusScriptPath);

  // 5. Update .gitignore
  updateGitignore(vaultPath);

  // 6. Spawn copilot with CWD = vault
  const child = spawn("copilot", args, { stdio: "inherit", cwd: vaultPath });
  child.on("exit", (code) => process.exit(code ?? 0));
}
```

- [ ] **Step 2: Run Copilot launcher tests**

Run: `npx vitest run cli/__tests__/copilot.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 3: Run full test suite**

Run: `just test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add cli/copilot.ts
git commit -m "feat: add Copilot CLI launcher with skills, hooks, and config"
```

---

### Task 5: Harness registry updates

**Files:**

- Modify: `cli/launch.ts`
- Modify: `cli/index.ts`

- [ ] **Step 1: Add Copilot to HARNESSES in launch.ts**

Add import at top of `cli/launch.ts`:

```typescript
import { launchCopilot } from "./copilot.js";
```

Add entry to the `HARNESSES` array after the OpenCode entry:

```typescript
  {
    name: "Copilot CLI",
    binaries: ["copilot"],
    aliases: ["copilot", "cp"],
    launch: launchCopilot,
  },
```

Update the `detectAndLaunch` error message to mention both harnesses:

```typescript
console.error("  [brainkit] No supported coding harness found.");
console.error("  [brainkit] Install OpenCode: https://opencode.ai");
console.error("  [brainkit] Install Copilot CLI: https://github.com/github/copilot-cli");
```

- [ ] **Step 2: Update help text in index.ts**

Replace the `printUsage` function body:

```typescript
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
    --version    Print version and exit
    --help       Show this help message

  All arguments after the harness alias are passed through.
  Example: brainkit oc --model anthropic/claude-sonnet-4-5
  Example: brainkit copilot --model gpt-5.2
`);
}
```

- [ ] **Step 3: Run full test suite**

Run: `just test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add cli/launch.ts cli/index.ts
git commit -m "feat: register Copilot CLI harness in launcher"
```

---

### Task 6: Scripts and package.json

**Files:**

- Create: `scripts/copilot-status.js`
- Modify: `package.json`

- [ ] **Step 1: Create the statusLine script**

```javascript
#!/usr/bin/env node

// Copilot CLI statusLine script — prints vault stats for the footer bar.
// Called by Copilot CLI via the statusLine config in .github/copilot/settings.json.

import {
  readGlobalConfig,
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "@oribish/brainkit-core";

function staleness(lastEntryDate) {
  if (!lastEntryDate) return { text: "never", color: "\x1b[31m" }; // red
  const days = Math.floor((Date.now() - new Date(lastEntryDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { text: `${days}d ago`, color: "\x1b[32m" }; // green
  if (days <= 14) return { text: `${days}d ago`, color: "\x1b[33m" }; // yellow
  return { text: `${days}d ago`, color: "\x1b[31m" }; // red
}

try {
  const globalConfig = readGlobalConfig();
  if (!globalConfig) process.exit(0);

  const config = readVaultConfigSimple(globalConfig.vault_path);
  if (!config) process.exit(0);

  const parts = [`\u{1f9e0} ${config.user.name}'s vault`];

  if (config.features?.bragfile !== false) {
    const stats = getBragStats(globalConfig.vault_path);
    const s = staleness(stats.lastEntryDate);
    const reset = "\x1b[0m";
    parts.push(`${stats.totalEntries} brags`);
    parts.push(`last: ${s.color}${s.text}${reset}`);
  }

  if (config.features?.contacts !== false) {
    try {
      const raw = readContacts(globalConfig.vault_path);
      if (raw) {
        const contacts = parseContacts(raw);
        parts.push(`${contacts.length} contacts`);
      }
    } catch {
      // ignore
    }
  }

  process.stdout.write(parts.join(" \u00b7 "));
} catch {
  // Silent failure — statusLine should never error visibly
}
```

- [ ] **Step 2: Add `scripts/` to package.json `files` field**

In `package.json`, update the `files` array:

```json
  "files": [
    "dist/",
    "opencode/",
    "skills/",
    "scripts/"
  ],
```

- [ ] **Step 3: Update cli/tsconfig.json to include copilot.ts and install-skills.ts**

The existing `include: ["./**/*.ts"]` already covers the new files. But `cli/tsconfig.json` has `rootDir: ".."` which means it can compile files outside `cli/`. Verify the new files compile:

Run: `just build-cli`
Expected: Compiles without errors. `dist/cli/copilot.js` and `dist/cli/install-skills.js` are generated.

- [ ] **Step 4: Commit**

```bash
git add scripts/copilot-status.js package.json
git commit -m "feat: add Copilot statusLine script and include scripts in package"
```

---

### Task 7: Feature doc updates

**Files:**

- Modify: `docs/para.md`
- Modify: `docs/bragfile.md`
- Modify: `docs/contacts.md`
- Modify: `docs/meeting-notes.md`
- Modify: `docs/doctor.md`
- Modify: `docs/onboarding.md`
- Modify: `docs/auto-commit.md`
- Modify: `docs/tui.md`
- Modify: `docs/features.md`
- Modify: `README.md`

- [ ] **Step 1: Add Copilot CLI column to para.md harness table**

Replace the harness implementation table in `docs/para.md` with:

```markdown
| Capability         | OpenCode                                                                                                                                                                  | Copilot CLI                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Structure creation | Agent creates directories and `README.md` files using built-in file tools, guided by the PARA skill and system prompt                                                     | Agent creates directories and files using built-in tools, guided by PARA skill in `.agents/skills/brainkit/` and AGENTS.md |
| Filing decisions   | Agent uses PARA skill knowledge to decide placement; the system prompt injects a vault structure description each turn so the agent always knows what directories exist   | Agent uses PARA skill knowledge; AGENTS.md provides vault structure description (static, generated at launch)              |
| Archival workflow  | Agent follows the skill-defined steps: reads README, appends archive note with date and reason, recreates contents in `04_archive/`, confirms with user before proceeding | Same — agent follows skill instructions using built-in tools                                                               |
| Project detection  | If the user's working directory matches a `01_projects/` entry, the system prompt injects that project's context automatically                                            | Not injected at launch (CWD is vault root); works if user navigates into a project subdirectory                            |
```

- [ ] **Step 2: Add Copilot CLI column to bragfile.md harness table**

Replace the harness implementation table in `docs/bragfile.md` with:

```markdown
| Capability            | OpenCode                                                                                                                                                 | Copilot CLI                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Adding entries        | Agent uses built-in file editing, guided by the bragfile skill for format and placement rules                                                            | Agent uses built-in file editing, guided by bragfile skill in `.agents/skills/brainkit/references/bragfile.md`       |
| Entry formatting      | Agent follows skill conventions (date format, half-year/month sections, quality criteria)                                                                | Same — agent follows skill conventions                                                                               |
| Staleness reminders   | System prompt injection via `experimental.chat.system.transform` — `buildBragReminder()` checks last entry date and adds reminder text if 14+ days stale | Static in AGENTS.md, generated at launch with current staleness data; not updated mid-session                        |
| Auto-brag detection   | `session.idle` event handler scans user messages for accomplishment keywords near "you"/"your"; shows toast via `api.tui.showToast()`                    | Not supported — the bragfile skill instructs the agent to offer capture when accomplishments come up in conversation |
| Brag stats in sidebar | TUI sidebar component reads `getBragStats()` and shows total entries + staleness with color coding (green ≤7d, yellow ≤14d, red >14d)                    | `statusLine` script shows brag count + staleness in Copilot's footer bar with the same color thresholds              |
```

- [ ] **Step 3: Add Copilot CLI column to contacts.md harness table**

Replace the harness implementation table in `docs/contacts.md` with:

```markdown
| Capability               | OpenCode                                                                                                                                                               | Copilot CLI                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Adding contacts          | Agent uses built-in file editing, guided by the contacts skill for format                                                                                              | Agent uses built-in file editing, guided by contacts skill in `.agents/skills/brainkit/references/contacts.md` |
| Searching contacts       | Agent reads the contacts file and searches manually; `parseContacts()` and `searchContacts()` are available in core but used by the sidebar, not directly by the agent | Agent reads the contacts file and searches manually, guided by skill instructions                              |
| Cross-referencing        | Agent checks contacts when people are mentioned, guided by skill instructions in the system prompt                                                                     | Agent checks contacts when people are mentioned, guided by skill instructions in AGENTS.md                     |
| Contact count in sidebar | TUI sidebar component reads and parses contacts, displays total count                                                                                                  | `statusLine` script shows contact count in Copilot's footer bar                                                |
```

- [ ] **Step 4: Add Copilot CLI column to meeting-notes.md harness table**

Replace the harness implementation table in `docs/meeting-notes.md` with:

```markdown
| Capability                | OpenCode                                                                                                                                                                                                   | Copilot CLI                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| File creation             | Agent creates the markdown file in the correct PARA directory using built-in file tools                                                                                                                    | Same — agent creates files using built-in tools                                      |
| Placement decision        | Agent applies meeting-notes skill knowledge to pick the right PARA directory; system prompt injects current vault structure and, if the user's working directory matches a project, that project's context | Agent applies skill knowledge; AGENTS.md provides vault structure (static at launch) |
| Contact cross-referencing | Agent checks `03_resources/contacts.md` when attendees are mentioned, bolding names consistently and optionally offering to add new contacts                                                               | Same — agent follows contacts skill instructions                                     |
| Template formatting       | Agent follows the template defined in the meeting-notes skill; there is no typed tool for this — the agent writes the file directly, relying on skill guidance for structure                               | Same — agent follows skill template                                                  |
```

- [ ] **Step 5: Add Copilot CLI column to doctor.md harness table**

Replace the harness implementation table in `docs/doctor.md` with:

```markdown
| Capability             | OpenCode                                                                                                                                                                                                                       | Copilot CLI                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Triggering             | `/doctor` slash command registered in TUI plugin (`tui.tsx`); submits "Run vault health checks using /doctor and report the results" to chat                                                                                   | User asks "check my vault health" — the maintenance skill guides the agent through the same checks |
| Health check execution | Agent follows maintenance skill instructions, using built-in file tools to check structure, naming, and config. `runHealthChecks()` exists in `core/vault.ts` with equivalent checks but is not called by the OpenCode plugin. | Agent follows maintenance skill instructions using built-in tools                                  |
| Structural fixes       | Agent creates missing directories and files using built-in file tools, guided by skill instructions                                                                                                                            | Same — agent creates missing structure using built-in tools                                        |
| GitHub privacy check   | Agent runs `gh repo view` via shell to check repo visibility; `runHealthChecks()` in core has the same check via `execSync` but is not wired up in OpenCode                                                                    | Agent runs `gh repo view` via shell, guided by skill instructions                                  |
| Naming suggestions     | Agent identifies non-kebab-case entries and suggests renames; waits for user confirmation before changing anything                                                                                                             | Same — agent follows skill guidance                                                                |
| Staleness detection    | Agent follows maintenance skill guidance; uses file modification times and directory contents to identify stale or empty entries                                                                                               | Same — agent follows skill guidance                                                                |
```

- [ ] **Step 6: Add Copilot CLI column to onboarding.md harness table**

Replace the harness implementation table in `docs/onboarding.md` with:

```markdown
| Capability            | OpenCode                                                                                                                                                                                                                                  | Copilot CLI                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh vault detection | `buildOnboarding()` in `core/prompt-sections.ts` checks `onboarding_complete` and calls `isVaultFresh()`; injects "Fresh Vault Detected" into the system prompt via the `experimental.chat.system.transform` hook in `opencode/server.ts` | Static in AGENTS.md — "Fresh Vault Detected" is included if vault is fresh at launch; not removed mid-session after onboarding completes |
| Conversational flow   | Agent follows the onboarding skill instructions; the entire flow is conversation-driven with no typed tools or structured UI                                                                                                              | Same — agent follows onboarding skill from `.agents/skills/brainkit/references/onboarding.md`                                            |
| Config writing        | Agent writes `brainkit.toml` using built-in file tools; the config structure follows the format defined in `core/types.ts`                                                                                                                | Same — agent writes config using built-in tools                                                                                          |
| Directory creation    | Agent creates PARA directories and project/area/resource subdirectories using built-in file tools                                                                                                                                         | Same — agent creates directories using built-in tools                                                                                    |
| Profile nudge         | `buildProfileNudge()` in `core/prompt-sections.ts` checks for empty expertise, work description, and personal description; injects "Profile Incomplete" into the system prompt when fields are missing                                    | Static in AGENTS.md at launch; not updated when fields are filled mid-session                                                            |
| Completion tracking   | Agent sets `onboarding_complete = true` under `[user.customization]` in `brainkit.toml` when the user is satisfied with their profile                                                                                                     | Same — agent sets the flag in config                                                                                                     |
```

- [ ] **Step 7: Add Copilot CLI column to auto-commit.md harness table**

Replace the harness implementation table in `docs/auto-commit.md` with:

```markdown
| Capability        | OpenCode                                                                                           | Copilot CLI                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --- | ----------- | --- | ----- |
| Trigger mechanism | `session.idle` event in server plugin calls `scheduleAutoCommit(vaultPath)`                        | `agentStop` hook runs `.github/hooks/scripts/auto-commit.sh` after each agent turn                         |
| Debouncing        | `setTimeout` with 30s delay; each call clears and restarts the timer                               | No debouncing — each `agentStop` triggers a commit attempt; the script is idempotent (skips if no changes) |
| Session-end flush | Not currently wired up. `flushAutoCommit` exists in core but has no caller in the OpenCode plugin. | `sessionEnd` hook runs the same auto-commit script, catching any remaining changes                         |
| Git operations    | `execSync` runs `git add -A` and `git commit` in the vault directory with `stdio: "pipe"`          | Bash script runs `git add -A` and `git commit` in CWD (the vault)                                          |
| Error handling    | All git operations and pre-checks wrapped in try/catch; failures are silent                        | Script checks for git repo and uncommitted changes; all commands fail silently via `                       |     | exit 0`and` |     | true` |
```

- [ ] **Step 8: Add Copilot CLI column to tui.md harness table**

Replace the harness implementation table in `docs/tui.md` with:

```markdown
| Capability          | OpenCode                                                                                                                                                      | Copilot CLI                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home branding       | `home_logo` slot renders ASCII art brain; `home_prompt` slot customizes the input prompt with "brainkit" hint label and vault-related placeholder suggestions | Not available — Copilot CLI owns its UI; no plugin slots for visual elements                                  |
| Vault stats sidebar | `sidebar_content` slot renders the Sidebar component with vault name, brag stats (count + staleness color), and contact count                                 | `statusLine` script prints a one-liner with vault name, brag stats, and contact count in Copilot's footer bar |
| Rotating tips       | `home_bottom` slot renders Tips component; built-in tips deactivated via `api.plugins.deactivate("internal:home-tips")` and restored on dispose               | `companyAnnouncements` in `.github/copilot/settings.json` — one random tip shown at startup; no cycling       |
| Color theme         | Theme installed from `brainkit.json` via `api.theme.install()` and set as active with `api.theme.set("brainkit")`                                             | Not available — Copilot CLI only supports preset themes (dark/light/auto)                                     |
| Slash commands      | `/doctor` registered via `api.command.register()`, submits health check request to chat                                                                       | Not needed — user asks "check my vault health" directly; the maintenance skill guides the agent               |
```

- [ ] **Step 9: Update features.md index**

Add a note about Copilot CLI support at the top of `docs/features.md`:

```markdown
# Features

Each feature is documented in its own page with behavior specs and per-harness implementation details. Currently supported harnesses: **OpenCode** and **Copilot CLI**.

- [PARA](para.md) — vault structure and organization method
- [Bragfile](bragfile.md) — professional accomplishment tracking, staleness reminders, auto-detection
- [Contacts](contacts.md) — people index, search, cross-referencing
- [Meeting notes](meeting-notes.md) — structured notes with PARA placement
- [Doctor](doctor.md) — vault health checks and structural fixes
- [Onboarding](onboarding.md) — guided first-run setup
- [Auto-commit](auto-commit.md) — automatic git commits of vault changes
- [TUI](tui.md) — terminal UI for OpenCode (sidebar, tips, theme, branding)
```

- [ ] **Step 10: Update README.md install section**

After the existing install section (after the npm badge), add a Copilot CLI subsection:

````markdown
### With Copilot CLI

```bash
brainkit copilot
```
````

Requires [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed and authenticated. The brainkit launcher installs skills and hooks into your vault, then launches Copilot with full vault awareness.

````

- [ ] **Step 11: Commit**

```bash
git add docs/ README.md
git commit -m "docs: add Copilot CLI column to all feature harness tables"
````

---

### Task 8: Lint and final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `just test`
Expected: All tests pass.

- [ ] **Step 2: Run lint and typecheck**

Run: `just lint`
Expected: No errors.

- [ ] **Step 3: Run format check**

Run: `just format`
Expected: No formatting changes needed (or auto-fixed).

- [ ] **Step 4: Build CLI**

Run: `just build-cli`
Expected: Compiles without errors. `dist/cli/copilot.js` and `dist/cli/install-skills.js` are in the output.

- [ ] **Step 5: Run full check**

Run: `just check`
Expected: All checks pass (lint + format + test).
