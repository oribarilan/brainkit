import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrainkitGlobalConfig {
  vaultPath: string;
  lastSeenVersion?: string;
}

export interface BrainkitConfig {
  brainkit: { version: string };
  user: {
    name: string;
    role: string;
    expertise: string[];
    tone: string;
    scope: "professional" | "personal" | "both";
    context?: string;
    rules?: string[];
  };
  features: {
    bragfile: boolean;
    contacts: boolean;
    "meeting-notes": boolean;
    "self-review": boolean;
    "vault-health": boolean;
  };
  agents?: { providers?: string[] };
}

export interface BragEntry {
  description: string;
  date?: string;
}

export interface BragStats {
  totalEntries: number;
  lastEntryDate: string | null;
  entriesByMonth: Record<string, number>;
}

export interface Contact {
  name: string;
  alias?: string;
  role?: string;
  team?: string;
  relation?: string;
  connection?: string;
  relevantFor?: string;
}

export interface HealthCheckResult {
  check: string;
  status: "pass" | "warn" | "error";
  message: string;
}

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

function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "brainkit", "config.json");
}

export function readGlobalConfig(): BrainkitGlobalConfig | null {
  const configPath = getGlobalConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as BrainkitGlobalConfig;
  } catch {
    return null;
  }
}

export function writeGlobalConfig(config: BrainkitGlobalConfig): void {
  const configPath = getGlobalConfigPath();
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Vault config (brainkit.toml)
// ---------------------------------------------------------------------------

export function readVaultConfig(vaultPath: string): BrainkitConfig {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parseToml(raw);
  return parsed as unknown as BrainkitConfig;
}

export function writeVaultConfig(vaultPath: string, config: BrainkitConfig): void {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);
  const toml = stringifyToml(config as unknown as Record<string, unknown>);
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

  if (config.features.bragfile) {
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

  if (config.features.contacts) {
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

  const allowedRootEntries = new Set([...Object.values(PARA), KEY_FILES.config, "README.md"]);

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

  return results;
}
