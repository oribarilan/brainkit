import { installSkills as installSkillsCore } from "../core/skill-installer.js";

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
// Public API
// ---------------------------------------------------------------------------

/**
 * Install brainkit skills into a Copilot target directory using the
 * Anthropic Agent Skills "flat" layout (root `SKILL.md` + `references/`).
 *
 * Thin wrapper around `core/skill-installer.ts` that locks the layout to
 * `copilot-flat`, preserving Copilot's existing on-disk format.
 */
export function installSkills(options: InstallSkillsOptions): InstallSkillsResult {
  return installSkillsCore({
    skillsSourceDir: options.skillsSourceDir,
    targetDir: options.targetDir,
    version: options.version,
    layout: "copilot-flat",
  });
}
