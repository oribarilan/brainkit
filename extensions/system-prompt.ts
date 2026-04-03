import * as fs from "node:fs";
import * as path from "node:path";

import type { BrainkitConfig } from "./vault.js";

// ---------------------------------------------------------------------------
// Project context detection
// ---------------------------------------------------------------------------

export function detectProjectContext(vaultPath: string, cwd: string): { name: string; readmePath: string } | null {
  const cwdBasename = path.basename(cwd);
  const projectsDir = path.resolve(vaultPath, "01_projects");

  try {
    const entries = fs.readdirSync(projectsDir);
    for (const entry of entries) {
      if (entry === cwdBasename) {
        const readmePath = path.join("01_projects", entry, "README.md");
        return { name: entry, readmePath };
      }
    }
  } catch {
    // 01_projects doesn't exist or isn't readable
  }

  return null;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

export function buildSystemPrompt(config: BrainkitConfig, vaultPath: string, cwd?: string): string {
  const sections: string[] = [];

  // ── 1. Identity ──────────────────────────────────────────────────────
  const { user } = config;
  let identity = `## Second Brain — ${user.name}\n\n`;
  identity += `You have access to ${user.name}'s personal second brain vault at \`${vaultPath}\`.\n`;
  identity += `${user.name} is a ${user.role} with expertise in ${user.expertise.join(", ")}.\n`;
  identity += `This is a ${user.scope} vault.`;

  if (user.context !== undefined && user.context !== "") {
    identity += `\n\n${user.context}`;
  }

  sections.push(identity);

  // ── 2. Vault structure ──────────────────────────────────────────────
  const structure = [
    "## Vault Structure (PARA Method)",
    "",
    "The vault follows the PARA method:",
    "- `01_projects/` — Active, short-term efforts with a goal and deadline",
    "- `02_areas/` — Ongoing responsibilities maintained over time",
    "- `03_resources/` — Topics of interest or useful reference material",
    "- `04_archive/` — Inactive items from the above three categories",
  ].join("\n");

  sections.push(structure);

  // ── 3. Key files (conditional on features) ──────────────────────────
  const keyFilesSections: string[] = [];

  if (config.features.bragfile) {
    keyFilesSections.push(
      [
        "### Bragfile — `02_areas/career/bragfile.md`",
        "A running log of accomplishments. Use the `brain_add_brag` tool to add entries.",
        "Append only. Never overwrite or reorganize existing entries.",
      ].join("\n"),
    );
  }

  if (config.features.contacts) {
    keyFilesSections.push(
      [
        "### Contacts — `03_resources/contacts.md`",
        "People index. Use `brain_query_contacts` to search and `brain_add_contact` to add.",
        "Cross-reference people mentioned in notes and projects.",
      ].join("\n"),
    );
  }

  if (keyFilesSections.length > 0) {
    sections.push("## Key Files\n\n" + keyFilesSections.join("\n\n"));
  }

  // ── 4. Conventions ──────────────────────────────────────────────────
  const conventions = [
    "## Conventions",
    "",
    "- Directory names: lowercase with hyphens (e.g., `my-project/`)",
    "- File names: lowercase with hyphens (e.g., `meeting-notes.md`)",
    "- `README.md` is the entry point for every directory",
    "- Meeting notes: `YYYY-MM-DD-topic.md`",
    "- Use **bold** for key names, decisions, action items, people",
    `- ${user.tone} tone. Write like the vault owner would.`,
    '- Use first person ("I", "my") — this is a personal vault',
  ].join("\n");

  sections.push(conventions);

  // ── 5. Custom rules ─────────────────────────────────────────────────
  if (user.rules && user.rules.length > 0) {
    const rulesLines = user.rules.map((rule) => `- ${rule}`);
    sections.push("## Custom Rules\n\n" + rulesLines.join("\n"));
  }

  // ── 6. Behavioral rules (always included) ───────────────────────────
  const behavioral = [
    "## How to Work With This Vault",
    "",
    "- Use the brain_* tools to interact with the vault. They handle formatting and placement.",
    "- Search the vault before answering — don't guess.",
    "- Preserve existing structure and formatting when editing.",
    "- Cite which file information came from when summarizing.",
    "- Do not modify files in the archive directory unless explicitly asked.",
    "- Never delete vault content — archive instead.",
  ].join("\n");

  sections.push(behavioral);

  // ── 7. Project context (smart detection) ────────────────────────────
  if (cwd !== undefined && cwd !== "") {
    const project = detectProjectContext(vaultPath, cwd);
    if (project) {
      const projectContext = [
        "## Current Project Context",
        "",
        `You are currently working in a directory that matches the vault project \`${project.name}\`.`,
        `The project README is at \`${project.readmePath}\`.`,
      ].join("\n");

      sections.push(projectContext);
    }
  }

  return sections.join("\n\n") + "\n";
}
