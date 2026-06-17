import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import type {
  BrainkitGlobalConfig,
  BrainkitConfig,
  BragEntry,
  BragStats,
  Contact,
  HealthCheckResult,
} from "./types.js";
import { migrateConfig } from "./migrations.js";
import type { Migration } from "./migrations.js";
import { migrateGlobalConfig } from "./global-migration.js";

export type {
  BrainkitGlobalConfig,
  BrainkitConfig,
  BragEntry,
  BragStats,
  Contact,
  HealthCheckResult,
} from "./types.js";

export type { Migration } from "./migrations.js";

// ---------------------------------------------------------------------------
// Vault structure constants
// ---------------------------------------------------------------------------

export const PARA = {
  projects: "01_projects",
  areas: "02_areas",
  resources: "03_resources",
  archive: "04_archive",
} as const;

export const KEY_FILES = {
  bragfile: "02_areas/career/bragfile.md",
  contacts: "03_resources/contacts.md",
  config: "brainkit.toml",
} as const;

// ---------------------------------------------------------------------------
// Global config
// ---------------------------------------------------------------------------

export function getConfigDir(): string {
  const envOverride = process.env["BRAINKIT_CONFIG_DIR"];
  if (envOverride !== undefined && envOverride !== "") return envOverride;
  if (process.platform === "win32") {
    return path.join(process.env["APPDATA"] ?? path.join(os.homedir(), "AppData", "Roaming"), "brainkit");
  }
  return path.join(os.homedir(), ".config", "brainkit");
}

/**
 * Path to brainkit's isolated Copilot config dir. Passed to Copilot CLI via the
 * `COPILOT_HOME` env var so brainkit never touches the user's `~/.copilot/`.
 */
export function getCopilotConfigDir(): string {
  return path.join(getConfigDir(), "copilot");
}

function getGlobalConfigPath(): string {
  return path.join(getConfigDir(), "config.toml");
}

export function readGlobalConfig(): BrainkitGlobalConfig | null {
  const configPath = getGlobalConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = parseToml(raw) as Record<string, unknown>;
    return migrateGlobalConfig(parsed);
  } catch {
    return null;
  }
}

export function writeGlobalConfig(config: BrainkitGlobalConfig): void {
  const configPath = getGlobalConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, stringifyToml(config) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Tilde expansion
// ---------------------------------------------------------------------------

export function expandTilde(p: string): string {
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// ---------------------------------------------------------------------------
// Vault registry
// ---------------------------------------------------------------------------

export interface VaultEntry {
  name: string;
  path: string;
  resolvedPath: string;
  exists: boolean;
}

export function listVaults(): VaultEntry[] {
  try {
    const config = readGlobalConfig();
    if (config === null || !Array.isArray(config.vaults) || config.vaults.length === 0) {
      return [];
    }
    return config.vaults.map((v) => {
      const resolvedPath = path.resolve(expandTilde(v.path));
      return {
        name: v.name ?? path.basename(resolvedPath),
        path: v.path,
        resolvedPath,
        exists: fs.existsSync(resolvedPath),
      };
    });
  } catch {
    return [];
  }
}

export function validateRegistry(entries: VaultEntry[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, VaultEntry>();
  for (const entry of entries) {
    const existing = seen.get(entry.name);
    if (existing !== undefined) {
      errors.push(
        `Duplicate vault name "${entry.name}" from paths "${existing.path}" and "${entry.path}". Add an explicit name field to one of them.`,
      );
    } else {
      seen.set(entry.name, entry);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Vault discovery
// ---------------------------------------------------------------------------

export function discoverVaults(brainPath: string): string[] {
  const stat = fs.statSync(brainPath); // throws if path doesn't exist
  if (!stat.isDirectory()) {
    throw new Error(`Brain path is not a directory: ${brainPath}`);
  }

  const entries = fs.readdirSync(brainPath);
  const vaults: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const entryPath = path.join(brainPath, entry);
    try {
      const entryStat = fs.statSync(entryPath);
      if (!entryStat.isDirectory()) continue;
      const configPath = path.join(entryPath, "brainkit.toml");
      if (fs.existsSync(configPath)) {
        vaults.push(entry);
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return vaults.sort();
}

// ---------------------------------------------------------------------------
// Vault config (brainkit.toml)
// ---------------------------------------------------------------------------

export function readVaultConfig(vaultPath: string): {
  config: BrainkitConfig;
  pendingBreaking: Migration[];
} {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parseToml(raw) as Record<string, unknown>;

  const { config, applied, pendingBreaking } = migrateConfig(parsed);

  // Write back if non-breaking migrations were applied
  if (applied.length > 0) {
    const toml = stringifyToml(config);
    fs.writeFileSync(configPath, toml + "\n", "utf-8");
  }

  return {
    config: config as unknown as BrainkitConfig,
    pendingBreaking,
  };
}

/** Reads vault config, ignoring pending migrations. Use when you don't need migration info. */
export function readVaultConfigSimple(vaultPath: string): BrainkitConfig {
  return readVaultConfig(vaultPath).config;
}

export function writeVaultConfig(vaultPath: string, config: BrainkitConfig): void {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);
  const toml = stringifyToml(config);
  fs.writeFileSync(configPath, toml + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Vault file operations
// ---------------------------------------------------------------------------

export function readVaultFile(vaultPath: string, relativePath: string): string | null {
  const fullPath = path.resolve(vaultPath, relativePath);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export function writeVaultFile(vaultPath: string, relativePath: string, content: string): void {
  const fullPath = path.resolve(vaultPath, relativePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Bragfile operations
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getHalfYearLabel(date: Date): string {
  const year = date.getFullYear();
  const half = date.getMonth() < 6 ? "H1" : "H2";
  return `${half} ${year}`;
}

function getMonthLabel(date: Date): string {
  // getMonth() returns 0-11, always a valid index into MONTH_NAMES
  const name = MONTH_NAMES[date.getMonth()];
  if (name === undefined) {
    return "Unknown";
  }
  return name;
}

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateString(dateStr: string): Date {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function readBragfile(vaultPath: string): string | null {
  return readVaultFile(vaultPath, KEY_FILES.bragfile);
}

export function appendBragEntry(vaultPath: string, entry: BragEntry): string {
  const entryDate = entry.date !== undefined ? parseDateString(entry.date) : new Date();
  const dateStr = entry.date ?? formatDateString(entryDate);
  const halfYearLabel = getHalfYearLabel(entryDate);
  const monthLabel = getMonthLabel(entryDate);
  const formattedEntry = `- **${dateStr}**: ${entry.description}`;

  let content = readBragfile(vaultPath) ?? "";

  const halfYearHeading = `## ${halfYearLabel}`;
  const monthHeading = `### ${monthLabel}`;

  const halfYearIndex = content.indexOf(halfYearHeading);

  if (halfYearIndex === -1) {
    const section =
      (content.length > 0 && !content.endsWith("\n\n") ? (content.endsWith("\n") ? "\n" : "\n\n") : "") +
      `${halfYearHeading}\n\n${monthHeading}\n\n${formattedEntry}\n`;
    content += section;
  } else {
    const afterHalfYear = halfYearIndex + halfYearHeading.length;
    const nextH2Index = content.indexOf("\n## ", afterHalfYear);
    const halfYearEnd = nextH2Index === -1 ? content.length : nextH2Index;

    const halfYearSection = content.slice(halfYearIndex, halfYearEnd);
    const monthIndex = halfYearSection.indexOf(monthHeading);

    if (monthIndex === -1) {
      const insertPos = halfYearIndex + halfYearHeading.length;
      const monthSection = `\n\n${monthHeading}\n\n${formattedEntry}\n`;
      content = content.slice(0, insertPos) + monthSection + content.slice(insertPos);
    } else {
      const absoluteMonthIndex = halfYearIndex + monthIndex;
      const afterMonth = absoluteMonthIndex + monthHeading.length;

      const restAfterMonth = content.slice(afterMonth);
      const nextSectionMatch = restAfterMonth.search(/\n###? /);
      const monthEnd = nextSectionMatch === -1 ? content.length : afterMonth + nextSectionMatch;

      const beforeInsert = content.slice(0, monthEnd);
      const afterInsert = content.slice(monthEnd);
      const trailing = beforeInsert.endsWith("\n") ? "" : "\n";
      content = beforeInsert + trailing + formattedEntry + "\n" + afterInsert;
    }
  }

  writeVaultFile(vaultPath, KEY_FILES.bragfile, content);
  return formattedEntry;
}

export function getBragStats(vaultPath: string): BragStats {
  const content = readBragfile(vaultPath);
  if (content === null || content === "") {
    return { totalEntries: 0, lastEntryDate: null, entriesByMonth: {} };
  }

  const entryPattern = /^- \*\*(\d{4}-\d{2}-\d{2})\*\*:/gm;
  const entriesByMonth: Record<string, number> = {};
  let totalEntries = 0;
  let lastEntryDate: string | null = null;

  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(content)) !== null) {
    totalEntries++;
    const dateStr = match[1];
    if (dateStr === undefined) continue;
    const monthKey = dateStr.slice(0, 7);
    entriesByMonth[monthKey] = (entriesByMonth[monthKey] ?? 0) + 1;

    if (lastEntryDate === null || dateStr > lastEntryDate) {
      lastEntryDate = dateStr;
    }
  }

  return { totalEntries, lastEntryDate, entriesByMonth };
}

// ---------------------------------------------------------------------------
// Staleness helpers (pure)
// ---------------------------------------------------------------------------

export type StalenessCategory = "never" | "fresh" | "warning" | "stale";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Days since the given ISO date string. Returns null if input is null.
 * Floored to whole days.
 */
export function daysSinceLastEntry(lastEntryDate: string | null): number | null {
  if (lastEntryDate === null || lastEntryDate === "") return null;
  return Math.floor((Date.now() - new Date(lastEntryDate).getTime()) / MS_PER_DAY);
}

/**
 * Categorize staleness:
 * - "never": no entry ever (input is null)
 * - "fresh": ≤7 days
 * - "warning": 8-14 days
 * - "stale": >14 days
 * Pure function; consumers map category → their own colors.
 */
export function stalenessCategory(lastEntryDate: string | null): StalenessCategory {
  const days = daysSinceLastEntry(lastEntryDate);
  if (days === null) return "never";
  if (days <= 7) return "fresh";
  if (days <= 14) return "warning";
  return "stale";
}

// ---------------------------------------------------------------------------
// Contacts operations
// ---------------------------------------------------------------------------

export function readContacts(vaultPath: string): string | null {
  return readVaultFile(vaultPath, KEY_FILES.contacts);
}

export function parseContacts(content: string): Contact[] {
  const contacts: Contact[] = [];
  const sections = content.split(/^## /gm).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");
    const nameLine = lines[0]?.trim();
    if (nameLine === undefined || nameLine === "") continue;

    const contact: Contact = { name: nameLine };

    for (const line of lines.slice(1)) {
      const fieldMatch = line.match(/^- \*\*(.+?)\*\*:\s*(.+)/);
      if (fieldMatch === null) continue;

      const matchedKey = fieldMatch[1];
      const matchedValue = fieldMatch[2];
      if (matchedKey === undefined || matchedValue === undefined) continue;
      const key = matchedKey.toLowerCase().trim();
      const value = matchedValue.trim();

      switch (key) {
        case "alias":
          contact.alias = value;
          break;
        case "role":
          contact.role = value;
          break;
        case "team":
          contact.team = value;
          break;
        case "relation":
          contact.relation = value;
          break;
        case "connection":
          contact.connection = value;
          break;
        case "relevant for":
          contact.relevantFor = value;
          break;
      }
    }

    contacts.push(contact);
  }

  return contacts;
}

export function searchContacts(contacts: Contact[], query: string): Contact[] {
  const lowerQuery = query.toLowerCase();

  return contacts.filter((contact) => {
    const searchableFields = [
      contact.name,
      contact.alias,
      contact.role,
      contact.team,
      contact.relation,
      contact.connection,
      contact.relevantFor,
    ];

    return searchableFields.some((field) => field !== undefined && field.toLowerCase().includes(lowerQuery));
  });
}

export function addContact(vaultPath: string, contact: Contact): void {
  const lines: string[] = [`## ${contact.name}`, ""];

  if (contact.alias !== undefined) lines.push(`- **Alias**: ${contact.alias}`);
  if (contact.role !== undefined) lines.push(`- **Role**: ${contact.role}`);
  if (contact.team !== undefined) lines.push(`- **Team**: ${contact.team}`);
  if (contact.relation !== undefined) lines.push(`- **Relation**: ${contact.relation}`);
  if (contact.connection !== undefined) lines.push(`- **Connection**: ${contact.connection}`);
  if (contact.relevantFor !== undefined) lines.push(`- **Relevant For**: ${contact.relevantFor}`);

  lines.push("");

  let existing = readContacts(vaultPath) ?? "";
  if (existing.length > 0 && !existing.endsWith("\n")) {
    existing += "\n";
  }
  if (existing.length > 0 && !existing.endsWith("\n\n")) {
    existing += "\n";
  }

  const newContent = existing + lines.join("\n") + "\n";
  writeVaultFile(vaultPath, KEY_FILES.contacts, newContent);
}

// ---------------------------------------------------------------------------
// Vault freshness detection
// ---------------------------------------------------------------------------

/** Vault state for onboarding flow detection. */
export type VaultState = { kind: "configured" } | { kind: "fresh" } | { kind: "existing" };

/** Detects whether the vault is configured, fresh, or has existing content. */
export function detectVaultState(vaultPath: string): VaultState {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);

  if (fs.existsSync(configPath)) {
    return { kind: "configured" };
  }

  let mdFileCount = 0;
  let hasContentDirs = false;

  try {
    const entries = fs.readdirSync(vaultPath);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = path.resolve(vaultPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && entry.endsWith(".md")) {
        mdFileCount++;
      } else if (stat.isDirectory()) {
        const subEntries = fs.readdirSync(fullPath).filter((e: string) => !e.startsWith("."));
        if (subEntries.length > 0) hasContentDirs = true;
      }
    }
  } catch {
    return { kind: "fresh" };
  }

  if (mdFileCount >= 3 || hasContentDirs) {
    return { kind: "existing" };
  }

  return { kind: "fresh" };
}

export function isVaultFresh(vaultPath: string, config: BrainkitConfig): boolean {
  // A vault is "fresh" if all of these are true:
  // 1. Bragfile is empty or just has the heading (if feature enabled)
  // 2. Contacts file is empty or just has the heading (if feature enabled)
  // 3. No project directories exist in 01_projects/

  let bragEmpty = true;
  let contactsEmpty = true;
  let noProjects = true;

  if (config.features?.bragfile === true) {
    const content = readBragfile(vaultPath);
    // "empty" means null, empty string, or just "# Bragfile\n" (the template)
    bragEmpty = content === null || content.trim() === "" || content.trim() === "# Bragfile";
  }

  if (config.features?.contacts === true) {
    const content = readContacts(vaultPath);
    contactsEmpty = content === null || content.trim() === "" || content.trim() === "# Contacts";
  }

  try {
    const projectsDir = path.resolve(vaultPath, PARA.projects);
    const entries = fs.readdirSync(projectsDir);
    const dirs = entries.filter((e) => {
      if (e.startsWith(".")) return false;
      const stat = fs.statSync(path.join(projectsDir, e));
      return stat.isDirectory();
    });
    noProjects = dirs.length === 0;
  } catch {
    // Directory doesn't exist or isn't readable — treat as no projects
  }

  return bragEmpty && contactsEmpty && noProjects;
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

function isKebabCase(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

export function runHealthChecks(vaultPath: string, config: BrainkitConfig): HealthCheckResult[] {
  const results: HealthCheckResult[] = [];

  try {
    readVaultConfig(vaultPath);
    results.push({
      check: "Config parseable",
      status: "pass",
      message: "brainkit.toml parsed successfully",
    });
  } catch (err) {
    results.push({
      check: "Config parseable",
      status: "error",
      message: `Failed to parse brainkit.toml: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  for (const [key, dirName] of Object.entries(PARA)) {
    const dirPath = path.resolve(vaultPath, dirName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      results.push({
        check: `PARA directory: ${key}`,
        status: "pass",
        message: `${dirName}/ exists`,
      });
    } else {
      results.push({
        check: `PARA directory: ${key}`,
        status: "error",
        message: `${dirName}/ is missing`,
      });
    }
  }

  if (config.features?.bragfile === true) {
    const bragPath = path.resolve(vaultPath, KEY_FILES.bragfile);
    if (fs.existsSync(bragPath)) {
      results.push({
        check: "Bragfile exists",
        status: "pass",
        message: `${KEY_FILES.bragfile} found`,
      });
    } else {
      results.push({
        check: "Bragfile exists",
        status: "error",
        message: `${KEY_FILES.bragfile} is missing`,
      });
    }
  }

  if (config.features?.contacts === true) {
    const contactsPath = path.resolve(vaultPath, KEY_FILES.contacts);
    if (fs.existsSync(contactsPath)) {
      results.push({
        check: "Contacts file exists",
        status: "pass",
        message: `${KEY_FILES.contacts} found`,
      });
    } else {
      results.push({
        check: "Contacts file exists",
        status: "error",
        message: `${KEY_FILES.contacts} is missing`,
      });
    }
  }

  const nonKebabEntries: string[] = [];
  for (const dirName of Object.values(PARA)) {
    const dirPath = path.resolve(vaultPath, dirName);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      continue;
    }
    try {
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        const nameWithoutExt = entry.replace(/\.[^.]+$/, "");
        if (!isKebabCase(nameWithoutExt)) {
          nonKebabEntries.push(path.join(dirName, entry));
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  if (nonKebabEntries.length === 0) {
    results.push({
      check: "Naming conventions",
      status: "pass",
      message: "All checked entries use kebab-case",
    });
  } else {
    results.push({
      check: "Naming conventions",
      status: "warn",
      message: `Non-kebab-case entries found: ${nonKebabEntries.join(", ")}`,
    });
  }

  const allowedRootEntries = new Set([...Object.values(PARA), KEY_FILES.config, "README.md", "AGENTS.md"]);

  try {
    const rootEntries = fs.readdirSync(vaultPath);
    const orphaned = rootEntries.filter((entry) => !allowedRootEntries.has(entry) && !entry.startsWith("."));

    if (orphaned.length === 0) {
      results.push({
        check: "No orphaned root files",
        status: "pass",
        message: "Vault root is clean",
      });
    } else {
      results.push({
        check: "No orphaned root files",
        status: "warn",
        message: `Orphaned files in vault root: ${orphaned.join(", ")}`,
      });
    }
  } catch (err) {
    results.push({
      check: "No orphaned root files",
      status: "error",
      message: `Could not read vault root: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- GitHub repo privacy check ---
  try {
    execSync("git rev-parse --git-dir", { cwd: vaultPath, stdio: "pipe" });
    // It's a git repo — check for GitHub remote
    const remoteUrl = execSync("git remote get-url origin", { cwd: vaultPath, stdio: "pipe" }).toString().trim();

    if (remoteUrl.includes("github.com")) {
      // Extract owner/repo from URL
      const match = /github\.com[/:]([^/]+\/[^/.]+)/.exec(remoteUrl);
      if (match !== null) {
        const repo = match[1];
        if (repo !== undefined) {
          const ghOutput = execSync(`gh repo view ${repo} --json isPrivate`, { stdio: "pipe" }).toString().trim();
          const parsed = JSON.parse(ghOutput) as { isPrivate?: boolean };

          if (parsed.isPrivate === true) {
            results.push({
              check: "GitHub repo privacy",
              status: "pass",
              message: "Vault repo is private",
            });
          } else {
            results.push({
              check: "GitHub repo privacy",
              status: "error",
              message: `Vault repo ${repo} is PUBLIC. Your second brain is visible to everyone. Make it private: gh repo edit ${repo} --visibility private`,
            });
          }
        }
      }
    }
  } catch {
    // Not a git repo, no remote, or gh CLI not available — skip silently
  }

  return results;
}
