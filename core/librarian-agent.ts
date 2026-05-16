import type { BrainkitConfig } from "./types.js";
import {
  type SectionContext,
  joinSections,
  buildPreamble,
  buildVaultStructure,
  buildKeyFiles,
} from "./prompt-sections.js";

// ---------------------------------------------------------------------------
// YAML frontmatter
// ---------------------------------------------------------------------------

function buildFrontmatter(vaultPath: string): string {
  return [
    "---",
    "description: Vault search specialist. Finds and summarizes relevant vault content.",
    "mode: subagent",
    "hidden: true",
    "permission:",
    "  edit: deny",
    "  bash:",
    '    "*": deny',
    '    "cat *": allow',
    '    "grep *": allow',
    '    "find *": allow',
    '    "ls *": allow',
    '    "head *": allow',
    '    "tail *": allow',
    '    "wc *": allow',
    "  task: deny",
    "  external_directory:",
    '    "*": deny',
    `    "${vaultPath}/**": allow`,
    "---",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Librarian role section
// ---------------------------------------------------------------------------

function librarianRole(vaultPath: string): string {
  return [
    "## Role",
    "",
    "You are Librarian — brainkit's vault search specialist. Your job is to find relevant information in the user's vault and return a concise, useful summary.",
    "",
    "## Vault",
    "",
    `Path: \`${vaultPath}\``,
    "",
    "## Vault contents",
    "",
    "Use your read and search tools (`ls`, `find`, `grep`, `cat`) to discover vault contents dynamically. The vault is a git-backed repository — explore it at runtime rather than relying on a static snapshot.",
    "",
    "## Instructions",
    "",
    "1. Read the search query carefully. Understand what the user (via the primary agent) is looking for.",
    "2. Use your read and search tools to find relevant files and content in the vault.",
    "3. Return a **summary** of what you found — not raw file contents. Include:",
    "   - Which files contained relevant information",
    "   - Key details, quotes, or data points that answer the query",
    "   - How confident you are in the results (did you find exact matches or partial?)",
    "4. If you find nothing relevant, say so clearly. Don't fabricate results.",
    "",
    "## Constraints",
    "",
    "- You are read-only. You cannot modify any files.",
    "- You cannot delegate to other agents.",
    `- Scope your search to the vault at \`${vaultPath}\`. Do not search outside it.`,
    "- Be concise. The primary agent will use your summary to respond to the user — don't include unnecessary context.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildLibrarianAgentFile(config: BrainkitConfig, vaultPath: string): string {
  const ctx: SectionContext = { config, vaultPath, mode: "cli" };
  const frontmatter = buildFrontmatter(vaultPath);
  const body = joinSections([librarianRole(vaultPath), buildPreamble(ctx), buildVaultStructure(), buildKeyFiles(ctx)]);
  return frontmatter + "\n" + body;
}
