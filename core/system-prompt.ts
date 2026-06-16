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
  buildMultiVaultPreamble,
  buildMultiVaultIdentity,
  buildMultiVaultKeyFiles,
  buildMultiVaultCustomRules,
  buildConventionsToneNeutral,
  buildWriteRouting,
  buildMultiVaultProjectContext,
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

export function buildMultiVaultPrompt(
  vaults: Array<{ name: string; path: string; config: BrainkitConfig }>,
  options?: { cwd?: string; mode?: PromptMode },
): string {
  if (vaults.length > 5) {
    console.warn(
      `[brainkit] ${String(vaults.length)} vaults loaded. Prompt size grows linearly; consider using fewer vaults.`,
    );
  }

  const mode = options?.mode ?? "cli";

  // Per-vault identity blocks
  const identityBlocks = vaults.map((v) => buildMultiVaultIdentity(v));

  // Per-vault key files
  const keyFileBlocks = vaults
    .map((v) => buildMultiVaultKeyFiles(v))
    .filter((b): b is string => b !== null);

  // Per-vault custom rules
  const customRuleBlocks = vaults
    .map((v) => buildMultiVaultCustomRules(v))
    .filter((b): b is string => b !== null);

  // Per-vault brag reminders (capped at 2)
  const bragReminders: string[] = [];
  for (const v of vaults) {
    if (bragReminders.length >= 2) break;
    const ctx: SectionContext = { config: v.config, vaultPath: v.path, mode };
    const reminder = buildBragReminder(ctx);
    if (reminder) bragReminders.push(reminder.replace("## Reminder", `### Reminder — \`${v.name}\``));
  }
  // Aggregate remaining stale vaults beyond the cap
  if (vaults.length > 2) {
    const remainingStale: string[] = [];
    for (let i = 2; i < vaults.length; i++) {
      const v = vaults[i]!;
      const ctx: SectionContext = { config: v.config, vaultPath: v.path, mode };
      if (buildBragReminder(ctx)) remainingStale.push(v.name);
    }
    if (remainingStale.length > 0) {
      bragReminders.push(`Also stale: ${remainingStale.map((n) => `\`${n}\``).join(", ")}.`);
    }
  }

  // Per-vault onboarding/profile nudge (cap at 1 fresh-vault nudge)
  const nudges: string[] = [];
  const freshVaults: string[] = [];
  for (const v of vaults) {
    const ctx: SectionContext = { config: v.config, vaultPath: v.path, mode };
    if (buildOnboarding(ctx)) freshVaults.push(v.name);
    const nudge = buildProfileNudge(ctx);
    if (nudge) nudges.push(nudge.replace("## Profile Incomplete", `### Profile Incomplete — \`${v.name}\``));
  }
  if (freshVaults.length === 1) {
    nudges.unshift(
      `## Fresh Vault Detected\n\nVault \`${freshVaults[0]}\` was just set up and has no content yet. Guide the user through their first entries.`,
    );
  } else if (freshVaults.length > 1) {
    nudges.unshift(
      `## Fresh Vaults Detected\n\nThese vaults are fresh: ${freshVaults.map((n) => `\`${n}\``).join(", ")}. Guide the user through their first entries.`,
    );
  }

  return joinSections([
    BRAINKIT_PROMPT_SENTINEL,
    buildMultiVaultPreamble(vaults),
    ...identityBlocks,
    ...keyFileBlocks,
    buildVaultStructure(),
    buildConventionsToneNeutral(),
    ...customRuleBlocks,
    buildBehavioralRules({ config: vaults[0]!.config, vaultPath: vaults[0]!.path, mode }),
    buildWriteRouting(),
    buildMultiVaultProjectContext(vaults, options?.cwd),
    ...bragReminders,
    ...nudges,
  ]);
}
