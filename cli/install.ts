import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { readVaultConfig } from "../extensions/vault.js";
import type { BrainkitConfig } from "../extensions/vault.js";
import { buildSystemPrompt } from "../extensions/system-prompt.js";

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version: string };
const version: string = packageJson.version;

const PROVIDER_DIRS: Record<string, string> = {
  copilot: ".agents/skills/brainkit",
  opencode: ".agents/skills/brainkit",
  codex: ".agents/skills/brainkit",
  "claude-code": ".claude/skills/brainkit",
};

const REFERENCE_SKILLS = ["para", "bragfile", "contacts", "meeting-notes", "maintenance", "onboarding"] as const;

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n*/);
  return match ? content.slice(match[0].length) : content;
}

function resolveSkillsSourceDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");
}

function getTargetDirs(config: BrainkitConfig): string[] {
  const providers = config.agents?.providers ?? [];
  if (providers.length === 0) {
    return [".agents/skills/brainkit"];
  }

  const dirs = new Set<string>();
  for (const provider of providers) {
    const dir = PROVIDER_DIRS[provider];
    if (dir !== undefined) {
      dirs.add(dir);
    }
  }

  if (dirs.size === 0) {
    return [".agents/skills/brainkit"];
  }

  return [...dirs];
}

const ROOT_SKILL_CONTENT = `---
name: brainkit
description: >
  Personal second brain vault using the PARA method. Use when working with
  notes, bragfile entries, contacts, meeting notes, or vault organization.
---

# brainkit

A personal second brain system — a structured markdown vault organized using the PARA method.

## Vault conventions

- Directory names: lowercase with hyphens (\`my-project/\`)
- File names: lowercase with hyphens (\`meeting-notes.md\`)
- \`README.md\` is the entry point for every directory
- Use **bold** for key names, decisions, action items, and people
- Use first person ("I", "my") — this is a personal vault
- Never delete content — archive instead (move to \`04_archive/\`)

## Features

See the reference files for detailed conventions:

- [PARA method](references/para.md) — vault organization system
- [Bragfile](references/bragfile.md) — professional accomplishments log
- [Contacts](references/contacts.md) — people index
- [Meeting notes](references/meeting-notes.md) — structured meeting documentation
- [Maintenance](references/maintenance.md) — vault health and cleanup
- [Onboarding](references/onboarding.md) — first-run setup guidance
`;

function installSkillsToDir(cwd: string, targetDir: string, skillsSourceDir: string): void {
  const targetPath = path.join(cwd, targetDir);
  const refsPath = path.join(targetPath, "references");

  // Create directories
  fs.mkdirSync(refsPath, { recursive: true });

  // Write root SKILL.md
  fs.writeFileSync(path.join(targetPath, "SKILL.md"), ROOT_SKILL_CONTENT, "utf-8");

  // Copy reference skills (strip frontmatter)
  for (const skill of REFERENCE_SKILLS) {
    const sourcePath = path.join(skillsSourceDir, skill, "SKILL.md");
    try {
      const content = fs.readFileSync(sourcePath, "utf-8");
      const stripped = stripFrontmatter(content);
      fs.writeFileSync(path.join(refsPath, `${skill}.md`), stripped, "utf-8");
    } catch {
      // Skip missing skill files silently
    }
  }

  // Write version marker
  fs.writeFileSync(path.join(targetPath, ".brainkit-version"), version, "utf-8");
}

function updateGitignore(cwd: string, targetDirs: string[]): void {
  const gitignorePath = path.join(cwd, ".gitignore");

  let content = "";
  try {
    content = fs.readFileSync(gitignorePath, "utf-8");
  } catch {
    // No .gitignore yet
  }

  const lines = content.split("\n");
  const existingEntries = new Set(lines.map((l) => l.trim()));

  const newEntries: string[] = [];
  for (const dir of targetDirs) {
    const entry = dir.endsWith("/") ? dir : `${dir}/`;
    if (!existingEntries.has(entry)) {
      newEntries.push(entry);
    }
  }

  if (newEntries.length === 0) {
    return;
  }

  let addition = "";

  // Add header if no brainkit entries exist yet
  const hasBrainkitHeader = content.includes("# brainkit CLI");
  if (!hasBrainkitHeader) {
    addition += "\n# brainkit CLI — generated skill files\n";
  }

  addition += newEntries.join("\n") + "\n";

  // Ensure content ends with newline before appending
  if (content.length > 0 && !content.endsWith("\n")) {
    addition = "\n" + addition;
  }

  fs.writeFileSync(gitignorePath, content + addition, "utf-8");
}

function formatDirList(targetDirs: string[]): string {
  const uniqueParents = [...new Set(targetDirs.map((d) => d.split("/").slice(0, -1).join("/")))];
  return uniqueParents.map((d) => `${d}/`).join(" and ");
}

function installSkillsAndAgentsMd(cwd: string, config: BrainkitConfig): void {
  const targetDirs = getTargetDirs(config);
  const skillsSourceDir = resolveSkillsSourceDir();

  // Read previous version before overwriting
  let previousVersion: string | null = null;
  const firstDir = targetDirs[0];
  if (firstDir !== undefined) {
    const versionFile = path.join(cwd, firstDir, ".brainkit-version");
    try {
      previousVersion = fs.readFileSync(versionFile, "utf-8").trim();
    } catch {
      // No previous installation
    }
  }

  // Install skills
  for (const dir of targetDirs) {
    installSkillsToDir(cwd, dir, skillsSourceDir);
  }

  // Generate AGENTS.md
  const agentsMd = buildSystemPrompt(config, cwd, { mode: "cli" });
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), agentsMd, "utf-8");

  // Update .gitignore
  updateGitignore(cwd, targetDirs);

  // Print status with version comparison
  if (previousVersion !== null && previousVersion !== version) {
    console.log(`  [brainkit] Updated skills from ${previousVersion} to ${version} in ${formatDirList(targetDirs)}`);
  } else {
    console.log(`  [brainkit] Installed skills to ${formatDirList(targetDirs)} (v${version})`);
  }
  console.log("  [brainkit] Generated AGENTS.md");
}

export function install(cwd: string): void {
  const config = readVaultConfig(cwd);
  installSkillsAndAgentsMd(cwd, config);
}

export async function update(cwd: string): Promise<void> {
  console.log("\n  [brainkit] Vault found in current directory.");
  console.log(
    "  [brainkit] This will overwrite installed skills and AGENTS.md.\n             Vault content (notes, bragfile, contacts) is never modified.\n",
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await rl.question(`  Continue? (Y/n)\n  > `);
    const response = answer.trim() || "Y";

    if (response.toLowerCase() === "n") {
      console.log("  [brainkit] Update cancelled.");
      return;
    }

    const config = readVaultConfig(cwd);
    installSkillsAndAgentsMd(cwd, config);

    console.log(`\n  [brainkit] Done! Skills and AGENTS.md are up to date.\n`);
  } finally {
    rl.close();
  }
}
