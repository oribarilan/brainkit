export { detectProjectContext } from "./prompt-sections.js";
export type { PromptMode } from "./prompt-sections.js";

import type { BrainkitConfig } from "./types.js";
import type { SectionContext, PromptMode } from "./prompt-sections.js";
import {
  joinSections,
  buildPreamble,
  buildIdentity,
  buildVaultStructure,
  buildKeyFiles,
  buildConventions,
  buildCustomRules,
  buildBehavioralRules,
  buildProjectContext,
  buildBragReminder,
  buildOnboarding,
  buildProfileNudge,
} from "./prompt-sections.js";
import { isGitRepo } from "./git.js";

/**
 * HTML-comment sentinel emitted as the first line of every brainkit-generated
 * system prompt. Lets future-us (and the Copilot-isolation migration) reliably
 * identify a brainkit-generated `AGENTS.md` / `copilot-instructions.md` without
 * relying on text-content matching. Invisible when rendered as markdown.
 */
export const BRAINKIT_PROMPT_SENTINEL = "<!-- brainkit:generated -->";

export function buildSystemPrompt(
  config: BrainkitConfig,
  vaultPath: string,
  options?: { cwd?: string; mode?: PromptMode },
): string {
  const ctx: SectionContext = {
    config,
    vaultPath,
    mode: options?.mode ?? "cli",
    cwd: options?.cwd,
    isGit: isGitRepo(vaultPath),
  };

  return joinSections([
    BRAINKIT_PROMPT_SENTINEL,
    buildPreamble(ctx),
    buildIdentity(ctx),
    buildVaultStructure(),
    buildKeyFiles(ctx),
    buildConventions(ctx),
    buildCustomRules(ctx),
    buildBehavioralRules(ctx),
    buildProjectContext(ctx),
    buildBragReminder(ctx),
    buildOnboarding(ctx),
    buildProfileNudge(ctx),
  ]);
}
