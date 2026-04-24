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
  const links = REFERENCE_SKILLS.map(
    (s) => `- [${s.label}](references/${s.name})`,
  );
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
  const rootSource = fs.readFileSync(
    path.join(skillsSourceDir, "brainkit", "SKILL.md"),
    "utf-8",
  );
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
