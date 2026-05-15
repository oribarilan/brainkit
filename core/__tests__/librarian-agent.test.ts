import { describe, it, expect } from "vitest";
import type { BrainkitConfig } from "../types.js";
import { buildLibrarianAgentFile } from "../librarian-agent.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<BrainkitConfig>): BrainkitConfig {
  return {
    version: 1,
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["TypeScript"],
      tone: "direct",
      ...overrides?.user,
    },
    features: {
      bragfile: false,
      contacts: false,
      ...overrides?.features,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// YAML frontmatter
// ---------------------------------------------------------------------------

describe("buildLibrarianAgentFile — frontmatter", () => {
  const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");

  it("starts and ends with YAML frontmatter delimiters", () => {
    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---\n/);
  });

  it("contains mode: subagent", () => {
    expect(result).toContain("mode: subagent");
  });

  it("contains hidden: true", () => {
    expect(result).toContain("hidden: true");
  });

  it("contains edit: deny", () => {
    expect(result).toContain("edit: deny");
  });

  it("contains task: deny", () => {
    expect(result).toContain("task: deny");
  });

  it("scopes external_directory to the vault path", () => {
    const output = buildLibrarianAgentFile(makeConfig(), "/home/user/brain");
    expect(output).toContain('"/home/user/brain/**": allow');
  });

  it("denies all other external directories", () => {
    expect(result).toContain('"*": deny');
  });

  it("allows read-only bash commands", () => {
    for (const cmd of ["cat", "grep", "find", "ls", "head", "tail", "wc"]) {
      expect(result).toContain(`"${cmd} *": allow`);
    }
  });

  it("denies all other bash commands", () => {
    // The bash section should have a default deny before the allows
    const bashSection = result.slice(result.indexOf("bash:"), result.indexOf("task:"));
    expect(bashSection).toContain('"*": deny');
  });

  it("includes a description", () => {
    expect(result).toContain("description:");
  });
});

// ---------------------------------------------------------------------------
// Prompt body
// ---------------------------------------------------------------------------

describe("buildLibrarianAgentFile — prompt body", () => {
  it("includes Librarian role text", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("Librarian");
    expect(result).toContain("search");
  });

  it("includes the vault path in the prompt body", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/home/user/brain");
    // vault path appears in prompt body (beyond frontmatter)
    const body = result.slice(result.indexOf("---\n", 4) + 4);
    expect(body).toContain("/home/user/brain");
  });

  it("includes PARA structure", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).toContain("PARA");
    expect(result).toContain("01_projects");
    expect(result).toContain("02_areas");
    expect(result).toContain("03_resources");
    expect(result).toContain("04_archive");
  });

  it("includes key files when features are enabled", () => {
    const config = makeConfig({ features: { bragfile: true, contacts: true } });
    const result = buildLibrarianAgentFile(config, "/fake/vault");
    expect(result).toContain("bragfile.md");
    expect(result).toContain("contacts.md");
  });

  it("omits key files when features are disabled", () => {
    const config = makeConfig({ features: { bragfile: false, contacts: false } });
    const result = buildLibrarianAgentFile(config, "/fake/vault");
    expect(result).not.toContain("bragfile.md");
    expect(result).not.toContain("contacts.md");
  });

  it("does NOT include identity section", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).not.toContain("Second Brain —");
  });

  it("does NOT include conventions section", () => {
    const result = buildLibrarianAgentFile(makeConfig(), "/fake/vault");
    expect(result).not.toContain("## Conventions");
  });
});
