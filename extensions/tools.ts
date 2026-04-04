import * as fs from "node:fs";
import * as path from "node:path";

import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  PARA,
  KEY_FILES,
  appendBragEntry,
  readContacts,
  parseContacts,
  searchContacts,
  addContact,
  readVaultFile,
  writeVaultFile,
  readVaultConfig,
  runHealthChecks,
  writeGlobalConfig,
} from "./vault.js";

import type { BrainkitConfig } from "./vault.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      results.push(...getAllMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }

  return results;
}

export function isPathWithinVault(vaultPath: string, relativePath: string): boolean {
  const resolved = path.resolve(vaultPath, relativePath);
  const normalizedVault = path.resolve(vaultPath);
  return resolved.startsWith(normalizedVault + path.sep) || resolved === normalizedVault;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTools(
  pi: ExtensionAPI,
  getVaultPath: () => string | null,
  getConfig: () => BrainkitConfig | null,
  reloadVault: () => void,
): void {
  // ── 1. brain_add_brag ──────────────────────────────────────────────
  pi.registerTool({
    name: "brain_add_brag",
    label: "Add Brag",
    description: "Add an accomplishment to your bragfile",
    parameters: Type.Object({
      description: Type.String({ description: "What you accomplished" }),
      date: Type.Optional(Type.String({ description: "Date YYYY-MM-DD" })),
      project: Type.Optional(Type.String({ description: "Related project" })),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      const cfg = getConfig();
      if (cfg !== null && !cfg.features.bragfile) {
        return {
          content: [{ type: "text", text: "Bragfile feature is disabled. Enable it in brainkit.toml." }],
          details: {},
        };
      }

      let description = params.description;
      if (params.project !== undefined) {
        description = `**${params.project}**: ${description}`;
      }

      const entry = appendBragEntry(vaultPath, {
        description,
        date: params.date,
      });

      return {
        content: [{ type: "text", text: entry }],
        details: { path: "02_areas/career/bragfile.md" },
      };
    },
    renderCall(args, theme, _context) {
      const desc = args.description;
      const truncated = desc.length > 60 ? desc.slice(0, 57) + "..." : desc;
      return new Text(theme.fg("toolTitle", theme.bold("add-brag ")) + theme.fg("dim", `"${truncated}"`), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", text), 0, 0);
    },
  });

  // ── 2. brain_query_contacts ────────────────────────────────────────
  pi.registerTool({
    name: "brain_query_contacts",
    label: "Query Contacts",
    description: "Search your contacts by name, role, team, or how you met them",
    parameters: Type.Object({
      query: Type.String({ description: "Search query for contacts" }),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      const cfg = getConfig();
      if (cfg !== null && !cfg.features.contacts) {
        return {
          content: [{ type: "text", text: "Contacts feature is disabled. Enable it in brainkit.toml." }],
          details: {},
        };
      }

      const content = readContacts(vaultPath);
      if (content === null) {
        return {
          content: [{ type: "text", text: "No contacts file found. Add contacts first with brain_add_contact." }],
          details: {},
        };
      }

      const contacts = parseContacts(content);
      const matches = searchContacts(contacts, params.query);

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No contacts found matching "${params.query}".` }],
          details: {},
        };
      }

      const formatted = matches.map((c) => {
        const parts = [c.name];
        if (c.role !== undefined) parts.push(`Role: ${c.role}`);
        if (c.team !== undefined) parts.push(`Team: ${c.team}`);
        if (c.relation !== undefined) parts.push(`Relation: ${c.relation}`);
        return parts.join(" | ");
      });

      return {
        content: [{ type: "text", text: formatted.join("\n") }],
        details: { matchCount: matches.length },
      };
    },
    renderCall(args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("query-contacts ")) + theme.fg("dim", `"${args.query}"`), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const lines = text.split("\n");
      const parts: string[] = [];

      for (const line of lines) {
        const segments = line.split(" | ");
        const firstSegment = segments[0];
        if (segments.length > 1 && firstSegment !== undefined) {
          parts.push(theme.fg("accent", firstSegment) + " " + theme.fg("muted", segments.slice(1).join(" | ")));
        } else {
          parts.push(theme.fg("muted", line));
        }
      }

      return new Text(parts.join("\n"), 0, 0);
    },
  });

  // ── 3. brain_add_contact ───────────────────────────────────────────
  pi.registerTool({
    name: "brain_add_contact",
    label: "Add Contact",
    description: "Add a new contact to your contacts index",
    parameters: Type.Object({
      name: Type.String({ description: "Contact name" }),
      role: Type.String({ description: "Contact role/title" }),
      team: Type.Optional(Type.String({ description: "Team name" })),
      relation: Type.Optional(Type.String({ description: "How you know them" })),
      connection: Type.Optional(Type.String({ description: "Connection details" })),
      relevantFor: Type.Optional(Type.String({ description: "What they are relevant for" })),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      const cfg = getConfig();
      if (cfg !== null && !cfg.features.contacts) {
        return {
          content: [{ type: "text", text: "Contacts feature is disabled. Enable it in brainkit.toml." }],
          details: {},
        };
      }

      addContact(vaultPath, {
        name: params.name,
        role: params.role,
        team: params.team,
        relation: params.relation,
        connection: params.connection,
        relevantFor: params.relevantFor,
      });

      return {
        content: [{ type: "text", text: `Added contact: ${params.name}` }],
        details: { name: params.name },
      };
    },
    renderCall(args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("add-contact ")) + theme.fg("dim", `"${args.name}"`), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", text), 0, 0);
    },
  });

  // ── 4. brain_search ────────────────────────────────────────────────
  pi.registerTool({
    name: "brain_search",
    label: "Brain Search",
    description: "Search across your entire second brain vault",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      scope: Type.Optional(
        StringEnum(["all", "projects", "areas", "resources", "archive"] as const, {
          description: "PARA scope to search",
        }),
      ),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      const scope = params.scope ?? "all";
      let searchDir: string;

      if (scope === "all") {
        searchDir = vaultPath;
      } else {
        searchDir = path.resolve(vaultPath, PARA[scope]);
      }

      const files = getAllMarkdownFiles(searchDir);
      const lowerQuery = params.query.toLowerCase();
      const results: { relativePath: string; context: string }[] = [];

      for (const filePath of files) {
        if (results.length >= 10) break;

        let content: string;
        try {
          content = fs.readFileSync(filePath, "utf-8");
        } catch {
          continue;
        }

        if (!content.toLowerCase().includes(lowerQuery)) continue;

        const lines = content.split("\n");
        const contextLines: string[] = [];
        let matchFound = false;

        for (let i = 0; i < lines.length; i++) {
          const currentLine = lines[i];
          if (currentLine !== undefined && currentLine.toLowerCase().includes(lowerQuery)) {
            if (!matchFound) {
              matchFound = true;
              const prevLine = lines[i - 1];
              if (i > 0 && prevLine !== undefined) contextLines.push(prevLine);
              contextLines.push(currentLine);
              const nextLine = lines[i + 1];
              if (i < lines.length - 1 && nextLine !== undefined) contextLines.push(nextLine);
            }
          }
        }

        const relativePath = path.relative(vaultPath, filePath);
        results.push({
          relativePath,
          context: contextLines.join("\n").trim(),
        });
      }

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for "${params.query}" in ${scope}.` }],
          details: {},
        };
      }

      const formatted = results.map((r) => `📄 ${r.relativePath}\n${r.context}`);

      return {
        content: [{ type: "text", text: formatted.join("\n\n") }],
        details: { resultCount: results.length, scope },
      };
    },
    renderCall(args, theme, _context) {
      const scopeLabel = args.scope && args.scope !== "all" ? ` [${args.scope}]` : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("brain-search ")) + theme.fg("dim", `"${args.query}"${scopeLabel}`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const lines = text.split("\n");
      const parts: string[] = [];

      for (const line of lines) {
        if (line.startsWith("📄 ")) {
          parts.push(theme.fg("accent", line));
        } else {
          parts.push(theme.fg("muted", line));
        }
      }

      return new Text(parts.join("\n"), 0, 0);
    },
  });

  // ── 5. brain_read ──────────────────────────────────────────────────
  pi.registerTool({
    name: "brain_read",
    label: "Brain Read",
    description: "Read a file from your second brain vault",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path within the vault" }),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      if (!isPathWithinVault(vaultPath, params.path)) {
        return {
          content: [{ type: "text", text: "Error: Path must be within the vault directory." }],
          details: {},
        };
      }

      const content = readVaultFile(vaultPath, params.path);
      if (content === null) {
        return {
          content: [{ type: "text", text: `Error: File not found: ${params.path}` }],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: content }],
        details: { path: params.path },
      };
    },
    renderCall(args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("read ")) + theme.fg("accent", `vault://${args.path}`), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const lineCount = text.split("\n").length;
      return new Text(
        theme.fg("success", "✓ ") +
          theme.fg(
            "muted",
            `Read ${lineCount} lines from ${(result.details as Record<string, string> | undefined)?.["path"] ?? "file"}`,
          ),
        0,
        0,
      );
    },
  });

  // ── 6. brain_write ─────────────────────────────────────────────────
  pi.registerTool({
    name: "brain_write",
    label: "Brain Write",
    description: "Write or update a file in your second brain vault",
    parameters: Type.Object({
      path: Type.String({ description: "Relative path within the vault" }),
      content: Type.String({ description: "File content to write" }),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Please run /setup first." }],
          details: {},
        };
      }

      if (!isPathWithinVault(vaultPath, params.path)) {
        return {
          content: [{ type: "text", text: "Error: Path must be within the vault directory." }],
          details: {},
        };
      }

      const normalizedPath = path.normalize(params.path);
      const isArchivePath = normalizedPath.startsWith(PARA.archive + path.sep) || normalizedPath === PARA.archive;
      if (isArchivePath) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Writing to the archive directory is not allowed. Use the appropriate PARA directory instead.",
            },
          ],
          details: {},
        };
      }

      writeVaultFile(vaultPath, params.path, params.content);

      return {
        content: [{ type: "text", text: `Written: ${params.path}` }],
        details: { path: params.path },
      };
    },
    renderCall(args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("write ")) + theme.fg("accent", `vault://${args.path}`), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", text), 0, 0);
    },
  });

  // ── 7. brain_setup_vault ───────────────────────────────────────────
  pi.registerTool({
    name: "brain_setup_vault",
    label: "Setup Vault",
    description:
      "Set the vault path for brainkit. Call this during initial setup to tell brainkit where your vault lives.",
    parameters: Type.Object({
      vaultPath: Type.String({ description: "Absolute path to the vault directory" }),
    }),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const vaultPath = params.vaultPath.trim();
      if (!path.isAbsolute(vaultPath)) {
        return {
          content: [{ type: "text", text: "Error: Vault path must be absolute." }],
          details: {},
        };
      }

      // Create vault directory if it doesn't exist
      fs.mkdirSync(vaultPath, { recursive: true });

      // Write global config
      writeGlobalConfig({ vaultPath });
      reloadVault(); // Refresh in-memory state so subsequent tools work

      return {
        content: [
          {
            type: "text",
            text: `Vault path set to: ${vaultPath}. Now create brainkit.toml using brain_write, then run brain_doctor to set up the structure.`,
          },
        ],
        details: { vaultPath },
      };
    },
    renderCall(args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("setup-vault ")) + theme.fg("accent", args.vaultPath), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", text), 0, 0);
    },
  });

  // ── 8. brain_doctor ────────────────────────────────────────────────
  pi.registerTool({
    name: "brain_doctor",
    label: "Doctor",
    description:
      "Check vault health and fix issues. Creates missing PARA directories and key files, then runs health checks.",
    parameters: Type.Object({}),
    // eslint-disable-next-line @typescript-eslint/require-await
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const vaultPath = getVaultPath();
      if (vaultPath === null) {
        return {
          content: [{ type: "text", text: "Error: Vault path not configured. Run setup first." }],
          details: {},
        };
      }

      // Read config
      let config;
      try {
        config = readVaultConfig(vaultPath);
      } catch {
        return {
          content: [
            { type: "text", text: "Error: Could not read brainkit.toml. Make sure it exists in the vault root." },
          ],
          details: {},
        };
      }

      // Fix phase: create missing structure
      const fixes: string[] = [];

      for (const [, dirName] of Object.entries(PARA)) {
        const dirPath = path.resolve(vaultPath, dirName);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          fixes.push(`Created ${dirName}/`);
        }
      }

      if (config.features.bragfile) {
        const bragPath = path.resolve(vaultPath, KEY_FILES.bragfile);
        if (!fs.existsSync(bragPath)) {
          const dir = path.dirname(bragPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(bragPath, "# Bragfile\n", "utf-8");
          fixes.push(`Created ${KEY_FILES.bragfile}`);
        }
      }

      if (config.features.contacts) {
        const contactsPath = path.resolve(vaultPath, KEY_FILES.contacts);
        if (!fs.existsSync(contactsPath)) {
          const dir = path.dirname(contactsPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(contactsPath, "# Contacts\n", "utf-8");
          fixes.push(`Created ${KEY_FILES.contacts}`);
        }
      }

      // Check phase
      const results = runHealthChecks(vaultPath, config);

      // Format output
      const lines: string[] = [];

      if (fixes.length > 0) {
        lines.push("Fixed:");
        for (const fix of fixes) {
          lines.push(`  + ${fix}`);
        }
        lines.push("");
      }

      const passCount = results.filter((r) => r.status === "pass").length;
      const warnCount = results.filter((r) => r.status === "warn").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      lines.push(`Health: ${passCount} passed, ${warnCount} warnings, ${errorCount} errors`);
      lines.push("");

      for (const result of results) {
        const icon = result.status === "pass" ? "✓" : result.status === "warn" ? "⚠" : "✗";
        lines.push(`${icon} ${result.check}: ${result.message}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { fixes, results, passCount, warnCount, errorCount },
      };
    },
    renderCall(_args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("doctor")), 0, 0);
    },
    renderResult(result, _options, theme, _context) {
      const details = result.details as
        | { fixes?: string[]; passCount?: number; warnCount?: number; errorCount?: number }
        | undefined;
      if (!details) {
        const text = result.content[0]?.type === "text" ? result.content[0].text : "";
        return new Text(theme.fg("muted", text), 0, 0);
      }

      const parts: string[] = [];

      if (details.fixes && details.fixes.length > 0) {
        parts.push(theme.fg("accent", `Fixed ${details.fixes.length} issue(s)`));
      }

      parts.push(
        theme.fg("success", `${details.passCount ?? 0}✓`) +
          " " +
          ((details.warnCount ?? 0) > 0 ? theme.fg("warning", `${details.warnCount}⚠`) + " " : "") +
          ((details.errorCount ?? 0) > 0 ? theme.fg("error", `${details.errorCount}✗`) : ""),
      );

      return new Text(parts.join(" · "), 0, 0);
    },
  });
}
