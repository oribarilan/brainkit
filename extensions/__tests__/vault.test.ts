import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";

import {
  PARA,
  KEY_FILES,
  parseContacts,
  searchContacts,
  appendBragEntry,
  getBragStats,
  addContact,
  runHealthChecks,
  readVaultFile,
  writeVaultFile,
  isVaultFresh,
  type Contact,
  type BrainkitConfig,
} from "../vault.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMAL_CONFIG_TOML = `
[brainkit]
version = "1.0.0"

[user]
name = "Test User"
role = "Engineer"
expertise = ["testing"]
tone = "professional"
scope = "professional"

[features]
bragfile = true
contacts = true
`.trim();

function makeConfig(overrides?: Partial<BrainkitConfig["features"]>): BrainkitConfig {
  return {
    brainkit: { version: "1.0.0" },
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["testing"],
      tone: "professional",
      scope: "professional",
    },
    features: {
      bragfile: true,
      contacts: true,
      ...overrides,
    },
  };
}

/** Create PARA directories and brainkit.toml in tempDir */
function setupHealthyVault(dir: string): void {
  for (const dirName of Object.values(PARA)) {
    mkdirSync(join(dir, dirName), { recursive: true });
  }
  writeFileSync(join(dir, KEY_FILES.config), MINIMAL_CONFIG_TOML, "utf-8");
  // Create bragfile
  mkdirSync(join(dir, "02_areas", "career"), { recursive: true });
  writeFileSync(join(dir, KEY_FILES.bragfile), "# Bragfile\n", "utf-8");
  // Create contacts file
  writeFileSync(join(dir, KEY_FILES.contacts), "# Contacts\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("vault constants", () => {
  it("PARA has all four categories", () => {
    expect(PARA.projects).toBe("01_projects");
    expect(PARA.areas).toBe("02_areas");
    expect(PARA.resources).toBe("03_resources");
    expect(PARA.archive).toBe("04_archive");
  });

  it("KEY_FILES has correct paths", () => {
    expect(KEY_FILES.bragfile).toBe("02_areas/career/bragfile.md");
    expect(KEY_FILES.contacts).toBe("03_resources/contacts.md");
    expect(KEY_FILES.config).toBe("brainkit.toml");
  });
});

// ---------------------------------------------------------------------------
// parseContacts (pure)
// ---------------------------------------------------------------------------

describe("parseContacts", () => {
  it("parses single contact with all fields", () => {
    const content = `## Alice Smith

- **Alias**: Ali
- **Role**: Engineer
- **Team**: Platform
- **Relation**: Colleague
- **Connection**: Slack
- **Relevant For**: Backend architecture
`;
    const contacts = parseContacts(content);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toEqual({
      name: "Alice Smith",
      alias: "Ali",
      role: "Engineer",
      team: "Platform",
      relation: "Colleague",
      connection: "Slack",
      relevantFor: "Backend architecture",
    });
  });

  it("parses multiple contacts", () => {
    const content = `## Alice Smith

- **Role**: Engineer

## Bob Jones

- **Role**: Designer
`;
    const contacts = parseContacts(content);
    expect(contacts).toHaveLength(2);
    expect(contacts[0]?.name).toBe("Alice Smith");
    expect(contacts[1]?.name).toBe("Bob Jones");
  });

  it("handles contact with name only (no fields)", () => {
    const content = `## Just A Name
`;
    const contacts = parseContacts(content);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toEqual({ name: "Just A Name" });
  });

  it("treats content before first ## heading as a section (split behavior)", () => {
    // parseContacts splits on `## ` — content before first `## ` becomes
    // its own section with the first line as the "name".  Contacts files
    // should always use `## ` headings.
    const content = `# Contacts

Some preamble text.

## Alice Smith

- **Role**: Engineer
`;
    const contacts = parseContacts(content);
    // The preamble produces a spurious entry with name "# Contacts"
    expect(contacts).toHaveLength(2);
    // The real contact is still parsed correctly
    expect(contacts[1]?.name).toBe("Alice Smith");
    expect(contacts[1]?.role).toBe("Engineer");
  });

  it("returns empty array for empty string", () => {
    expect(parseContacts("")).toEqual([]);
  });

  it("handles malformed field lines gracefully", () => {
    const content = `## Test Contact

- **Role**: Engineer
- This is not a field line
- **Team**: Platform
- ****: empty key
- just random text
`;
    const contacts = parseContacts(content);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.role).toBe("Engineer");
    expect(contacts[0]?.team).toBe("Platform");
  });

  it("handles field keys case-insensitively", () => {
    const content = `## Test Contact

- **ROLE**: Senior Engineer
- **Team**: Backend
`;
    const contacts = parseContacts(content);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.role).toBe("Senior Engineer");
    expect(contacts[0]?.team).toBe("Backend");
  });
});

// ---------------------------------------------------------------------------
// searchContacts (pure)
// ---------------------------------------------------------------------------

describe("searchContacts", () => {
  const contacts: Contact[] = [
    { name: "Alice Smith", role: "Engineer", team: "Platform", alias: "Ali" },
    { name: "Bob Jones", role: "Designer", team: "Frontend" },
    { name: "Carol White", role: "PM", relation: "External contractor" },
  ];

  it("finds contact by name (case insensitive)", () => {
    const results = searchContacts(contacts, "alice");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Alice Smith");
  });

  it("finds contact by role", () => {
    const results = searchContacts(contacts, "designer");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Bob Jones");
  });

  it("finds contact by alias", () => {
    const results = searchContacts(contacts, "ali");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Alice Smith");
  });

  it("finds contact by team", () => {
    const results = searchContacts(contacts, "platform");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Alice Smith");
  });

  it("finds contact by relation", () => {
    const results = searchContacts(contacts, "contractor");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Carol White");
  });

  it("returns empty array when no match", () => {
    const results = searchContacts(contacts, "zzzzz");
    expect(results).toEqual([]);
  });

  it("returns all contacts for empty query", () => {
    const results = searchContacts(contacts, "");
    expect(results).toHaveLength(3);
  });

  it("returns multiple matches when query matches several contacts", () => {
    const results = searchContacts(contacts, "e");
    // "Alice Smith" has "Engineer", "Bob Jones" has "Designer"/"Frontend",
    // "Carol White" has "White", "External"
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// appendBragEntry (needs temp dir)
// ---------------------------------------------------------------------------

describe("appendBragEntry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
    // Create directory structure for bragfile
    mkdirSync(join(tempDir, "02_areas", "career"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates bragfile from scratch with correct structure", () => {
    const result = appendBragEntry(tempDir, {
      description: "First accomplishment",
      date: "2025-03-15",
    });

    expect(result).toBe("- **2025-03-15**: First accomplishment");

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("## H1 2025");
    expect(content).toContain("### March");
    expect(content).toContain("- **2025-03-15**: First accomplishment");
  });

  it("appends to existing month section", () => {
    // Create initial entry
    appendBragEntry(tempDir, {
      description: "First entry",
      date: "2025-03-10",
    });

    // Add second entry to same month
    appendBragEntry(tempDir, {
      description: "Second entry",
      date: "2025-03-20",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("- **2025-03-10**: First entry");
    expect(content).toContain("- **2025-03-20**: Second entry");
    // Should only have one March heading
    const marchCount = (content.match(/### March/g) || []).length;
    expect(marchCount).toBe(1);
  });

  it("creates new month section under existing half-year", () => {
    appendBragEntry(tempDir, {
      description: "March entry",
      date: "2025-03-15",
    });

    appendBragEntry(tempDir, {
      description: "April entry",
      date: "2025-04-10",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("### March");
    expect(content).toContain("### April");
    // Should only have one H1 2025 heading
    const h1Count = (content.match(/## H1 2025/g) || []).length;
    expect(h1Count).toBe(1);
  });

  it("creates new half-year section", () => {
    appendBragEntry(tempDir, {
      description: "H1 entry",
      date: "2025-03-15",
    });

    appendBragEntry(tempDir, {
      description: "H2 entry",
      date: "2025-07-10",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("## H1 2025");
    expect(content).toContain("## H2 2025");
  });

  it("uses today's date when none provided", () => {
    const result = appendBragEntry(tempDir, {
      description: "No date entry",
    });

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const expectedDate = `${y}-${m}-${d}`;

    expect(result).toContain(expectedDate);
  });

  it("uses provided date correctly", () => {
    const result = appendBragEntry(tempDir, {
      description: "Dated entry",
      date: "2024-12-25",
    });

    expect(result).toBe("- **2024-12-25**: Dated entry");
    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("## H2 2024");
    expect(content).toContain("### December");
  });

  it("H1 vs H2 half-year assignment (January=H1, July=H2)", () => {
    appendBragEntry(tempDir, {
      description: "January entry",
      date: "2025-01-15",
    });

    const content1 = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content1).toContain("## H1 2025");

    appendBragEntry(tempDir, {
      description: "July entry",
      date: "2025-07-15",
    });

    const content2 = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content2).toContain("## H2 2025");
  });

  it("appends to existing bragfile with content", () => {
    writeFileSync(join(tempDir, KEY_FILES.bragfile), "# Bragfile\n", "utf-8");

    appendBragEntry(tempDir, {
      description: "New entry",
      date: "2025-06-01",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("# Bragfile");
    expect(content).toContain("- **2025-06-01**: New entry");
  });

  it("June is H1, not H2", () => {
    appendBragEntry(tempDir, {
      description: "June entry",
      date: "2025-06-15",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.bragfile), "utf-8");
    expect(content).toContain("## H1 2025");
    expect(content).toContain("### June");
  });
});

// ---------------------------------------------------------------------------
// getBragStats (needs temp dir)
// ---------------------------------------------------------------------------

describe("getBragStats", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
    mkdirSync(join(tempDir, "02_areas", "career"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns zeros for empty bragfile", () => {
    writeFileSync(join(tempDir, KEY_FILES.bragfile), "", "utf-8");
    const stats = getBragStats(tempDir);
    expect(stats.totalEntries).toBe(0);
    expect(stats.lastEntryDate).toBeNull();
    expect(stats.entriesByMonth).toEqual({});
  });

  it("returns zeros when bragfile does not exist", () => {
    const stats = getBragStats(tempDir);
    expect(stats.totalEntries).toBe(0);
    expect(stats.lastEntryDate).toBeNull();
    expect(stats.entriesByMonth).toEqual({});
  });

  it("counts entries correctly", () => {
    appendBragEntry(tempDir, { description: "Entry 1", date: "2025-03-10" });
    appendBragEntry(tempDir, { description: "Entry 2", date: "2025-03-20" });
    appendBragEntry(tempDir, { description: "Entry 3", date: "2025-04-05" });

    const stats = getBragStats(tempDir);
    expect(stats.totalEntries).toBe(3);
  });

  it("finds last entry date", () => {
    appendBragEntry(tempDir, { description: "Early", date: "2025-01-01" });
    appendBragEntry(tempDir, { description: "Late", date: "2025-06-15" });
    appendBragEntry(tempDir, { description: "Mid", date: "2025-03-10" });

    const stats = getBragStats(tempDir);
    expect(stats.lastEntryDate).toBe("2025-06-15");
  });

  it("breaks down entries by month", () => {
    appendBragEntry(tempDir, { description: "Entry 1", date: "2025-03-10" });
    appendBragEntry(tempDir, { description: "Entry 2", date: "2025-03-20" });
    appendBragEntry(tempDir, { description: "Entry 3", date: "2025-04-05" });

    const stats = getBragStats(tempDir);
    expect(stats.entriesByMonth["2025-03"]).toBe(2);
    expect(stats.entriesByMonth["2025-04"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// addContact (needs temp dir)
// ---------------------------------------------------------------------------

describe("addContact", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
    mkdirSync(join(tempDir, "03_resources"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates contacts file if missing", () => {
    addContact(tempDir, { name: "Alice Smith", role: "Engineer" });

    const content = readFileSync(join(tempDir, KEY_FILES.contacts), "utf-8");
    expect(content).toContain("## Alice Smith");
    expect(content).toContain("- **Role**: Engineer");
  });

  it("appends to existing contacts file", () => {
    writeFileSync(join(tempDir, KEY_FILES.contacts), "# Contacts\n\n## Bob Jones\n\n- **Role**: PM\n", "utf-8");

    addContact(tempDir, { name: "Alice Smith", role: "Engineer" });

    const content = readFileSync(join(tempDir, KEY_FILES.contacts), "utf-8");
    expect(content).toContain("## Bob Jones");
    expect(content).toContain("## Alice Smith");
  });

  it("includes all provided fields", () => {
    addContact(tempDir, {
      name: "Full Contact",
      alias: "FC",
      role: "Engineer",
      team: "Platform",
      relation: "Colleague",
      connection: "Slack",
      relevantFor: "Backend",
    });

    const content = readFileSync(join(tempDir, KEY_FILES.contacts), "utf-8");
    expect(content).toContain("- **Alias**: FC");
    expect(content).toContain("- **Role**: Engineer");
    expect(content).toContain("- **Team**: Platform");
    expect(content).toContain("- **Relation**: Colleague");
    expect(content).toContain("- **Connection**: Slack");
    expect(content).toContain("- **Relevant For**: Backend");
  });

  it("omits undefined optional fields", () => {
    addContact(tempDir, { name: "Minimal Contact", role: "Engineer" });

    const content = readFileSync(join(tempDir, KEY_FILES.contacts), "utf-8");
    expect(content).toContain("## Minimal Contact");
    expect(content).toContain("- **Role**: Engineer");
    expect(content).not.toContain("- **Alias**:");
    expect(content).not.toContain("- **Team**:");
    expect(content).not.toContain("- **Relation**:");
    expect(content).not.toContain("- **Connection**:");
    expect(content).not.toContain("- **Relevant For**:");
  });
});

// ---------------------------------------------------------------------------
// readVaultFile / writeVaultFile (needs temp dir)
// ---------------------------------------------------------------------------

describe("readVaultFile / writeVaultFile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-existent file", () => {
    expect(readVaultFile(tempDir, "does-not-exist.md")).toBeNull();
  });

  it("writes and reads a file round-trip", () => {
    writeVaultFile(tempDir, "test.md", "Hello world");
    expect(readVaultFile(tempDir, "test.md")).toBe("Hello world");
  });

  it("creates nested directories when writing", () => {
    writeVaultFile(tempDir, "a/b/c/deep.md", "deep content");
    expect(existsSync(join(tempDir, "a", "b", "c", "deep.md"))).toBe(true);
    expect(readVaultFile(tempDir, "a/b/c/deep.md")).toBe("deep content");
  });
});

// ---------------------------------------------------------------------------
// runHealthChecks (needs temp dir)
// ---------------------------------------------------------------------------

describe("runHealthChecks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("all pass for healthy vault", () => {
    setupHealthyVault(tempDir);
    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const errors = results.filter((r) => r.status === "error");
    expect(errors).toHaveLength(0);
    // Check all PARA dirs pass
    for (const key of Object.keys(PARA)) {
      const paraResult = results.find((r) => r.check === `PARA directory: ${key}`);
      expect(paraResult?.status).toBe("pass");
    }
  });

  it("reports missing PARA directories", () => {
    // Only create config, no PARA dirs
    writeFileSync(join(tempDir, KEY_FILES.config), MINIMAL_CONFIG_TOML, "utf-8");
    // Create bragfile and contacts to avoid those errors
    mkdirSync(join(tempDir, "02_areas", "career"), { recursive: true });
    writeFileSync(join(tempDir, KEY_FILES.bragfile), "# Bragfile\n", "utf-8");
    mkdirSync(join(tempDir, "03_resources"), { recursive: true });
    writeFileSync(join(tempDir, KEY_FILES.contacts), "# Contacts\n", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    // 01_projects and 04_archive are missing
    const projectsResult = results.find((r) => r.check === "PARA directory: projects");
    expect(projectsResult?.status).toBe("error");

    const archiveResult = results.find((r) => r.check === "PARA directory: archive");
    expect(archiveResult?.status).toBe("error");
  });

  it("reports missing bragfile when enabled", () => {
    setupHealthyVault(tempDir);
    // Remove bragfile
    rmSync(join(tempDir, KEY_FILES.bragfile));

    const config = makeConfig({ bragfile: true });
    const results = runHealthChecks(tempDir, config);

    const bragResult = results.find((r) => r.check === "Bragfile exists");
    expect(bragResult?.status).toBe("error");
    expect(bragResult?.message).toContain("missing");
  });

  it("skips bragfile check when disabled", () => {
    setupHealthyVault(tempDir);
    const config = makeConfig({ bragfile: false });
    const results = runHealthChecks(tempDir, config);

    const bragResult = results.find((r) => r.check === "Bragfile exists");
    expect(bragResult).toBeUndefined();
  });

  it("reports non-kebab-case names as warnings", () => {
    setupHealthyVault(tempDir);
    // Create a non-kebab-case file
    writeFileSync(join(tempDir, "01_projects", "MyProject.md"), "content", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const namingResult = results.find((r) => r.check === "Naming conventions");
    expect(namingResult?.status).toBe("warn");
    expect(namingResult?.message).toContain("MyProject.md");
  });

  it("passes naming check when all names are kebab-case", () => {
    setupHealthyVault(tempDir);
    writeFileSync(join(tempDir, "01_projects", "my-project.md"), "content", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const namingResult = results.find((r) => r.check === "Naming conventions");
    expect(namingResult?.status).toBe("pass");
  });

  it("reports orphaned root files as warnings", () => {
    setupHealthyVault(tempDir);
    writeFileSync(join(tempDir, "random-file.txt"), "orphan", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const orphanResult = results.find((r) => r.check === "No orphaned root files");
    expect(orphanResult?.status).toBe("warn");
    expect(orphanResult?.message).toContain("random-file.txt");
  });

  it("passes orphan check for clean vault root", () => {
    setupHealthyVault(tempDir);
    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const orphanResult = results.find((r) => r.check === "No orphaned root files");
    expect(orphanResult?.status).toBe("pass");
  });

  it("ignores dotfiles in orphan check", () => {
    setupHealthyVault(tempDir);
    writeFileSync(join(tempDir, ".gitignore"), "node_modules", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const orphanResult = results.find((r) => r.check === "No orphaned root files");
    expect(orphanResult?.status).toBe("pass");
  });

  it("allows README.md in vault root without warning", () => {
    setupHealthyVault(tempDir);
    writeFileSync(join(tempDir, "README.md"), "# Vault", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const orphanResult = results.find((r) => r.check === "No orphaned root files");
    expect(orphanResult?.status).toBe("pass");
  });

  it("reports missing contacts file when contacts enabled", () => {
    setupHealthyVault(tempDir);
    // Remove contacts file
    rmSync(join(tempDir, KEY_FILES.contacts));

    const config = makeConfig({ contacts: true });
    const results = runHealthChecks(tempDir, config);

    const contactsResult = results.find((r) => r.check === "Contacts file exists");
    expect(contactsResult?.status).toBe("error");
  });

  it("skips contacts check when disabled", () => {
    setupHealthyVault(tempDir);
    const config = makeConfig({ contacts: false });
    const results = runHealthChecks(tempDir, config);

    const contactsResult = results.find((r) => r.check === "Contacts file exists");
    expect(contactsResult).toBeUndefined();
  });

  it("checks config parseability", () => {
    setupHealthyVault(tempDir);
    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const configResult = results.find((r) => r.check === "Config parseable");
    expect(configResult?.status).toBe("pass");
  });

  it("reports unparseable config as error", () => {
    setupHealthyVault(tempDir);
    // Corrupt the config
    writeFileSync(join(tempDir, KEY_FILES.config), "{{invalid toml", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const configResult = results.find((r) => r.check === "Config parseable");
    expect(configResult?.status).toBe("error");
  });

  it("ignores dotfiles in naming convention check", () => {
    setupHealthyVault(tempDir);
    writeFileSync(join(tempDir, "01_projects", ".hidden"), "hidden", "utf-8");

    const config = makeConfig();
    const results = runHealthChecks(tempDir, config);

    const namingResult = results.find((r) => r.check === "Naming conventions");
    expect(namingResult?.status).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// isVaultFresh
// ---------------------------------------------------------------------------

describe("isVaultFresh", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
    setupHealthyVault(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true for a freshly created vault", () => {
    const config = makeConfig();
    expect(isVaultFresh(tempDir, config)).toBe(true);
  });

  it("returns false when bragfile has entries", () => {
    appendBragEntry(tempDir, { description: "Shipped something" });
    const config = makeConfig();
    expect(isVaultFresh(tempDir, config)).toBe(false);
  });

  it("returns false when contacts has entries", () => {
    addContact(tempDir, { name: "Alice", role: "Engineer" });
    const config = makeConfig();
    expect(isVaultFresh(tempDir, config)).toBe(false);
  });

  it("returns false when projects directory has subdirectories", () => {
    mkdirSync(join(tempDir, PARA.projects, "my-project"), { recursive: true });
    const config = makeConfig();
    expect(isVaultFresh(tempDir, config)).toBe(false);
  });

  it("returns true when bragfile feature is disabled and contacts are empty", () => {
    const config = makeConfig({ bragfile: false });
    expect(isVaultFresh(tempDir, config)).toBe(true);
  });

  it("returns true when contacts feature is disabled and bragfile is empty", () => {
    const config = makeConfig({ contacts: false });
    expect(isVaultFresh(tempDir, config)).toBe(true);
  });

  it("ignores hidden directories in projects", () => {
    mkdirSync(join(tempDir, PARA.projects, ".hidden"), { recursive: true });
    const config = makeConfig();
    expect(isVaultFresh(tempDir, config)).toBe(true);
  });
});
