import * as fs from "node:fs";
import * as path from "node:path";

import { isVaultFresh, getBragStats } from "./vault.js";
import type { BrainkitConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptMode = "cli";

export type SectionContext = {
  config: BrainkitConfig;
  vaultPath: string;
  mode: PromptMode;
  cwd?: string;
  isGit?: boolean;
};

// ---------------------------------------------------------------------------
// Project context detection (moved from system-prompt.ts)
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
// Utility
// ---------------------------------------------------------------------------

export function joinSections(sections: (string | null | undefined)[]): string {
  return sections.filter(Boolean).join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

export function buildPreamble(ctx: SectionContext): string {
  const locationLine =
    ctx.isGit === true
      ? `The vault is backed by git and lives at \`${ctx.vaultPath}\`.`
      : `The vault lives at \`${ctx.vaultPath}\`.`;
  return [
    "## Brainkit",
    "",
    "Brainkit is a personal second brain — a structured markdown vault organized with the PARA method.",
    "It captures projects, areas of responsibility, resources, and archives in a consistent, searchable format.",
    locationLine,
  ].join("\n");
}

export function buildIdentity(ctx: SectionContext): string {
  const { user } = ctx.config;
  const expertise = user.expertise ?? [];

  let identity = `## Second Brain — ${user.name}\n\n`;
  identity += `You have access to ${user.name}'s personal second brain vault at \`${ctx.vaultPath}\`.\n`;
  identity += `${user.name} is a ${user.role}`;
  if (expertise.length > 0) {
    identity += ` with expertise in ${expertise.join(", ")}`;
  }
  identity += `.`;

  if (user.work?.description !== undefined && user.work.description !== "") {
    identity += `\n\n**Work context:** ${user.work.description}`;
  }

  if (user.personal?.description !== undefined && user.personal.description !== "") {
    identity += `\n\n**Personal context:** ${user.personal.description}`;
  }

  if (user.customization?.context !== undefined && user.customization.context !== "") {
    identity += `\n\n${user.customization.context}`;
  }

  return identity;
}

export function buildVaultStructure(): string {
  return [
    "## Vault Structure (PARA Method)",
    "",
    "The vault follows the PARA method:",
    "- `01_projects/` — Active, short-term efforts with a goal and deadline",
    "- `02_areas/` — Ongoing responsibilities maintained over time",
    "- `03_resources/` — Topics of interest or useful reference material",
    "- `04_archive/` — Inactive items from the above three categories",
  ].join("\n");
}

export function buildKeyFiles(ctx: SectionContext): string | null {
  const keyFilesSections: string[] = [];

  if (ctx.config.features?.bragfile === true) {
    keyFilesSections.push(
      [
        "### Bragfile — `02_areas/career/bragfile.md`",
        "Add entries to `02_areas/career/bragfile.md` in the format `- **YYYY-MM-DD**: description`. Organize by half-year (H1/H2) and month.",
      ].join("\n"),
    );
  }

  if (ctx.config.features?.contacts === true) {
    keyFilesSections.push(
      [
        "### Contacts — `03_resources/contacts.md`",
        "Add people to `03_resources/contacts.md` using H2 headings for names and bold field labels.",
      ].join("\n"),
    );
  }

  if (keyFilesSections.length === 0) return null;
  return "## Key Files\n\n" + keyFilesSections.join("\n\n");
}

export function buildConventions(ctx: SectionContext): string {
  const tone = ctx.config.user.tone ?? "direct";
  return [
    "## Conventions",
    "",
    "- Directory names: lowercase with hyphens (e.g., `my-project/`)",
    "- File names: lowercase with hyphens (e.g., `meeting-notes.md`)",
    "- `README.md` is the entry point for every directory",
    "- Meeting notes: `YYYY-MM-DD-topic.md`",
    "- Use **bold** for key names, decisions, action items, people",
    `- ${tone} tone. Write like the vault owner would.`,
    '- Use first person ("I", "my") — this is a personal vault',
  ].join("\n");
}

export function buildCustomRules(ctx: SectionContext): string | null {
  const customRules = ctx.config.user.customization?.rules;
  if (!customRules || customRules.length === 0) return null;
  const rulesLines = customRules.map((rule: string) => `- ${rule}`);
  return "## Custom Rules\n\n" + rulesLines.join("\n");
}

export function buildBehavioralRules(_ctx: SectionContext): string {
  return [
    "## How to Work With This Vault",
    "",
    "- Keep information where you'll search for it, not where you found it. When you capture something (meeting notes, a conversation, a link), extract the useful parts to where they belong and archive the original.",
    "- Use your built-in file editing to manage vault files. Follow the conventions and formats described in the installed skills.",
    "- Search the vault before answering — don't guess.",
    "- Preserve existing structure and formatting when editing.",
    "- Cite which file information came from when summarizing.",
    "- Do not modify files in the archive directory unless explicitly asked.",
    "- Never delete vault content — archive instead.",
    "",
    "### Before editing",
    "",
    "Before you write, edit, create, move, or delete anything in the vault, say one short natural-language line stating what you're about to change and where — name the concrete project, contact, area, or file. This lets the user catch a wrong-target action before it happens.",
    "",
    "- Applies to vault-modifying actions only. Read-only operations (search, read, list) stay silent — don't narrate them.",
    "- One announcement per user-visible change, not one per tool call. Batched edits get a single line up front.",
    "- During first-run onboarding, one upfront line covers the whole setup (e.g. \"I'll set up your PARA directories and a starter README\") — don't announce each file.",
    "- Phrase it naturally; don't restate the tool call. Examples:",
    '  - "Updating project _Acme Redesign_ with the new Q3 deadline"',
    '  - "Adding John Doe as a new contact"',
    '  - "Logging today\'s standup notes under _Team Sync_"',
  ].join("\n");
}

export function buildProjectContext(ctx: SectionContext): string | null {
  if (ctx.cwd === undefined || ctx.cwd === "") return null;
  const project = detectProjectContext(ctx.vaultPath, ctx.cwd);
  if (!project) return null;
  return [
    "## Current Project Context",
    "",
    `You are currently working in a directory that matches the vault project \`${project.name}\`.`,
    `The project README is at \`${project.readmePath}\`.`,
  ].join("\n");
}

export function buildBragReminder(ctx: SectionContext): string | null {
  if (ctx.config.features?.bragfile !== true) return null;
  try {
    const stats = getBragStats(ctx.vaultPath);
    if (stats.lastEntryDate === null) return null;
    const last = new Date(stats.lastEntryDate + "T00:00:00");
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince < 14) return null;
    return [
      "## Reminder",
      "",
      `Your bragfile hasn't been updated in ${String(daysSince)} days (last entry: ${stats.lastEntryDate}).`,
      "If anything noteworthy happened recently, gently suggest capturing it.",
      "Don't be pushy — mention it once, naturally.",
    ].join("\n");
  } catch {
    return null;
  }
}

export function buildOnboarding(ctx: SectionContext): string | null {
  const onboardingComplete = ctx.config.user.customization?.onboarding_complete === true;
  if (onboardingComplete) return null;
  try {
    if (!isVaultFresh(ctx.vaultPath, ctx.config)) return null;
    return [
      "## Fresh Vault Detected",
      "",
      "This vault was just set up and has no content yet.",
      "Guide the user through their first entries using the onboarding skill.",
      "Be conversational and welcoming, not a checklist.",
    ].join("\n");
  } catch {
    return null;
  }
}

export function buildProfileNudge(ctx: SectionContext): string | null {
  const onboardingComplete = ctx.config.user.customization?.onboarding_complete === true;
  if (onboardingComplete) return null;

  const { user } = ctx.config;
  const expertise = user.expertise ?? [];
  const missing: string[] = [];
  if (expertise.length === 0) missing.push("expertise");
  if (user.work?.description === undefined || user.work.description === "") missing.push("work context");
  if (user.personal?.description === undefined || user.personal.description === "") {
    missing.push("personal context");
  }

  if (missing.length === 0) return null;
  return [
    "## Profile Incomplete",
    "",
    `The following fields are empty in brainkit.toml: ${missing.join(", ")}.`,
    "If it comes up naturally in conversation, offer to fill them in.",
    "Don't lead with this — wait for a relevant moment.",
    "Once the user is satisfied with their profile, set `onboarding_complete = true` under `[user.customization]` in brainkit.toml.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Multi-vault section builders
// ---------------------------------------------------------------------------

export function buildMultiVaultPreamble(
  vaults: Array<{ name: string; path: string }>,
): string {
  const table = vaults.map((v) => `| \`${v.name}\` | \`${v.path}\` |`).join("\n");
  return [
    "## Brainkit — All Vaults",
    "",
    "You have access to multiple brainkit vaults, each a personal second brain organized with the PARA method.",
    "",
    "| Vault | Path |",
    "|-------|------|",
    table,
  ].join("\n");
}

export function buildMultiVaultIdentity(
  vault: { name: string; path: string; config: BrainkitConfig },
): string {
  const { user } = vault.config;
  const expertise = user.expertise ?? [];
  const tone = user.tone ?? "direct";

  let identity = `## Vault: ${vault.name}\n\n`;
  identity += `Tone for this vault: ${tone}.\n\n`;
  identity += `You have access to ${user.name}'s personal second brain vault at \`${vault.path}\`.\n`;
  identity += `${user.name} is a ${user.role}`;
  if (expertise.length > 0) {
    identity += ` with expertise in ${expertise.join(", ")}`;
  }
  identity += `.`;

  if (user.work?.description !== undefined && user.work.description !== "") {
    identity += `\n\n**Work context:** ${user.work.description}`;
  }
  if (user.personal?.description !== undefined && user.personal.description !== "") {
    identity += `\n\n**Personal context:** ${user.personal.description}`;
  }
  if (user.customization?.context !== undefined && user.customization.context !== "") {
    identity += `\n\n${user.customization.context}`;
  }

  return identity;
}

export function buildMultiVaultKeyFiles(
  vault: { name: string; path: string; config: BrainkitConfig },
): string | null {
  const ctx: SectionContext = {
    config: vault.config,
    vaultPath: vault.path,
    mode: "cli",
  };
  const keyFiles = buildKeyFiles(ctx);
  if (keyFiles === null) return null;
  return keyFiles.replace("## Key Files", `### Key Files — \`${vault.name}\``);
}

export function buildMultiVaultCustomRules(
  vault: { name: string; path: string; config: BrainkitConfig },
): string | null {
  const ctx: SectionContext = {
    config: vault.config,
    vaultPath: vault.path,
    mode: "cli",
  };
  const rules = buildCustomRules(ctx);
  if (rules === null) return null;
  return rules.replace("## Custom Rules", `### Custom Rules — \`${vault.name}\``);
}

export function buildConventionsToneNeutral(): string {
  return [
    "## Conventions",
    "",
    "- Directory names: lowercase with hyphens (e.g., `my-project/`)",
    "- File names: lowercase with hyphens (e.g., `meeting-notes.md`)",
    "- `README.md` is the entry point for every directory",
    "- Meeting notes: `YYYY-MM-DD-topic.md`",
    "- Use **bold** for key names, decisions, action items, people",
    "- Use the tone of the vault you are writing into.",
    '- Use first person ("I", "my") — this is a personal vault',
  ].join("\n");
}

export function buildWriteRouting(): string {
  return [
    "## Write Routing",
    "",
    "When writing to the vault, choose the appropriate vault based on the content's context.",
    "Use the tone of the vault you are writing into.",
    "If the correct vault is ambiguous, ask the user which vault to use before writing.",
  ].join("\n");
}

export function buildMultiVaultProjectContext(
  vaults: Array<{ name: string; path: string }>,
  cwd?: string,
): string | null {
  if (cwd === undefined || cwd === "") return null;
  const cwdBasename = path.basename(cwd);
  const matches: Array<{ vaultName: string; readmePath: string }> = [];

  for (const vault of vaults) {
    const projectsDir = path.resolve(vault.path, "01_projects");
    try {
      const entries = fs.readdirSync(projectsDir);
      if (entries.includes(cwdBasename)) {
        matches.push({
          vaultName: vault.name,
          readmePath: path.join(vault.path, "01_projects", cwdBasename, "README.md"),
        });
      }
    } catch {
      // 01_projects doesn't exist in this vault
    }
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) {
    const m = matches[0];
    if (m === undefined) return null;
    return [
      "## Current Project Context",
      "",
      `You are working in a directory that matches the project \`${cwdBasename}\` in vault \`${m.vaultName}\`.`,
      `The project README is at \`${m.readmePath}\`.`,
    ].join("\n");
  }

  const lines = matches.map((m) => `- \`${m.vaultName}\`: \`${m.readmePath}\``);
  return [
    "## Current Project Context",
    "",
    `You are working in a directory that matches the project \`${cwdBasename}\` in multiple vaults:`,
    ...lines,
    "",
    "Check which vault's project is relevant before making changes.",
  ].join("\n");
}
