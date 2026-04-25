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
  };

  return joinSections([
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
