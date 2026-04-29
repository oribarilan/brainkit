import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Layout strategy for skill installation.
 *
 * - `copilot-flat`: writes a single root `SKILL.md` at `<targetDir>/SKILL.md`
 *   with reference sub-skills flattened into `<targetDir>/references/<name>.md`.
 *   This matches the Anthropic Agent Skills format consumed by Copilot.
 * - `per-dir`: writes one directory per skill at
 *   `<targetDir>/<skill-name>/SKILL.md`. Each `SKILL.md`'s content is produced
 *   by the caller-supplied `buildSkillContent` so the caller controls the
 *   final frontmatter (e.g. `disable-model-invocation` for Claude).
 */
export type SkillInstallLayout = "copilot-flat" | "per-dir";

export interface SkillSource {
  /** Directory name under `skillsSourceDir` (also used as the skill identifier). */
  dir: string;
  /** Filename used for the flattened reference file (copilot-flat layout only). */
  referenceFileName: string;
  /** Human-readable label used in the generated reference link list. */
  label: string;
  /** Whether this skill is the root brainkit skill. */
  isRoot: boolean;
}

export interface BuildSkillContentArgs {
  /** Skill identifier (matches source dir name). */
  name: string;
  /** Raw source content of the skill's `SKILL.md`, including its frontmatter. */
  sourceContent: string;
  /** True for the root brainkit skill, false for sub-skills. */
  isRoot: boolean;
}

interface CommonInstallOptions {
  skillsSourceDir: string;
  targetDir: string;
  version: string;
  /** Defaults to `.brainkit-version`. */
  versionFileName?: string;
}

export interface CopilotFlatInstallOptions extends CommonInstallOptions {
  layout: "copilot-flat";
}

export interface PerDirInstallOptions extends CommonInstallOptions {
  layout: "per-dir";
  /** Produces the final `SKILL.md` content for a given skill. */
  buildSkillContent: (args: BuildSkillContentArgs) => string;
}

export type InstallSkillsOptions = CopilotFlatInstallOptions | PerDirInstallOptions;

export interface InstallSkillsResult {
  installed: boolean;
  version: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VERSION_FILE = ".brainkit-version";

const ROOT_SKILL: SkillSource = {
  dir: "brainkit",
  referenceFileName: "brainkit.md",
  label: "Brainkit",
  isRoot: true,
};

const REFERENCE_SKILLS: SkillSource[] = [
  { dir: "para", referenceFileName: "para.md", label: "PARA method", isRoot: false },
  { dir: "bragfile", referenceFileName: "bragfile.md", label: "Bragfile", isRoot: false },
  { dir: "contacts", referenceFileName: "contacts.md", label: "Contacts", isRoot: false },
  {
    dir: "meeting-notes",
    referenceFileName: "meeting-notes.md",
    label: "Meeting notes",
    isRoot: false,
  },
  {
    dir: "maintenance",
    referenceFileName: "maintenance.md",
    label: "Maintenance",
    isRoot: false,
  },
  { dir: "onboarding", referenceFileName: "onboarding.md", label: "Onboarding", isRoot: false },
];

const COPILOT_ROOT_FRONTMATTER = `---
name: brainkit
description: >
  Personal second brain vault using the PARA method. Use when working with
  notes, bragfile entries, contacts, meeting notes, or vault organization.
---`;

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
  const links = REFERENCE_SKILLS.map((s) => `- [${s.label}](references/${s.referenceFileName})`);
  return "\n\n## Reference skills\n\n" + links.join("\n") + "\n";
}

function transformCopilotRootSkill(sourceContent: string): string {
  const body = stripFrontmatter(sourceContent);
  return COPILOT_ROOT_FRONTMATTER + "\n\n" + body.trimEnd() + buildReferenceLinksSection();
}

function readVersionMarker(versionFile: string): string | null {
  if (!fs.existsSync(versionFile)) return null;
  return fs.readFileSync(versionFile, "utf-8").trim();
}

// ---------------------------------------------------------------------------
// Layout implementations
// ---------------------------------------------------------------------------

function installCopilotFlat(skillsSourceDir: string, targetDir: string): void {
  const refsDir = path.join(targetDir, "references");
  fs.mkdirSync(refsDir, { recursive: true });

  const rootSource = fs.readFileSync(path.join(skillsSourceDir, ROOT_SKILL.dir, "SKILL.md"), "utf-8");
  fs.writeFileSync(path.join(targetDir, "SKILL.md"), transformCopilotRootSkill(rootSource), "utf-8");

  for (const skill of REFERENCE_SKILLS) {
    const sourcePath = path.join(skillsSourceDir, skill.dir, "SKILL.md");
    if (!fs.existsSync(sourcePath)) continue;
    const content = fs.readFileSync(sourcePath, "utf-8");
    fs.writeFileSync(path.join(refsDir, skill.referenceFileName), stripFrontmatter(content), "utf-8");
  }
}

function installPerDir(
  skillsSourceDir: string,
  targetDir: string,
  buildSkillContent: (args: BuildSkillContentArgs) => string,
): void {
  fs.mkdirSync(targetDir, { recursive: true });

  const allSkills: SkillSource[] = [ROOT_SKILL, ...REFERENCE_SKILLS];
  for (const skill of allSkills) {
    const sourcePath = path.join(skillsSourceDir, skill.dir, "SKILL.md");
    if (!fs.existsSync(sourcePath)) continue;

    const sourceContent = fs.readFileSync(sourcePath, "utf-8");
    const finalContent = buildSkillContent({
      name: skill.dir,
      sourceContent,
      isRoot: skill.isRoot,
    });

    const skillDir = path.join(targetDir, skill.dir);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), finalContent, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function installSkills(options: InstallSkillsOptions): InstallSkillsResult {
  const { skillsSourceDir, targetDir, version, versionFileName = DEFAULT_VERSION_FILE } = options;

  // Check version marker — skip if already up to date.
  const versionFile = path.join(targetDir, versionFileName);
  const existing = readVersionMarker(versionFile);
  if (existing === version) {
    return { installed: false, version };
  }

  switch (options.layout) {
    case "copilot-flat":
      installCopilotFlat(skillsSourceDir, targetDir);
      break;
    case "per-dir":
      installPerDir(skillsSourceDir, targetDir, options.buildSkillContent);
      break;
    default: {
      // Exhaustiveness check — adding a new layout without a case is a compile error.
      const _exhaustive: never = options;
      throw new Error(`installSkills: unhandled layout ${JSON.stringify(_exhaustive)}`);
    }
  }

  fs.writeFileSync(versionFile, version + "\n", "utf-8");

  return { installed: true, version };
}
