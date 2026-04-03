import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSystemPrompt, detectProjectContext } from "../system-prompt.js";
import type { BrainkitConfig } from "../vault.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<BrainkitConfig>): BrainkitConfig {
  return {
    brainkit: { version: "0.1.0" },
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["TypeScript", "APIs"],
      tone: "direct",
      scope: "professional",
      ...overrides?.user,
    },
    features: {
      bragfile: true,
      contacts: true,
      "meeting-notes": true,
      "self-review": false,
      "vault-health": true,
      ...overrides?.features,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectProjectContext
// ---------------------------------------------------------------------------

describe("detectProjectContext", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    rmSync(vaultDir, { recursive: true, force: true });
  });

  it("returns matching project when cwd basename matches a dir in 01_projects/", () => {
    mkdirSync(join(vaultDir, "01_projects", "my-app"), { recursive: true });

    const result = detectProjectContext(vaultDir, "/some/path/my-app");

    expect(result).toEqual({
      name: "my-app",
      readmePath: "01_projects/my-app/README.md",
    });
  });

  it("returns null when no match", () => {
    mkdirSync(join(vaultDir, "01_projects", "my-app"), { recursive: true });

    const result = detectProjectContext(vaultDir, "/some/path/other-app");

    expect(result).toBeNull();
  });

  it("returns null when 01_projects/ doesn't exist", () => {
    const result = detectProjectContext(vaultDir, "/some/path/my-app");

    expect(result).toBeNull();
  });

  it("matches only exact basename, not partial", () => {
    mkdirSync(join(vaultDir, "01_projects", "my-app"), { recursive: true });

    // "my-app-v2" contains "my-app" but is not an exact match
    const result = detectProjectContext(vaultDir, "/some/path/my-app-v2");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

describe("buildSystemPrompt", () => {
  const vaultPath = "/fake/vault";

  it("includes user name and role", () => {
    const config = makeConfig();
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("Test User");
    expect(prompt).toContain("Engineer");
  });

  it("includes expertise list", () => {
    const config = makeConfig();
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("TypeScript, APIs");
  });

  it("includes PARA structure description", () => {
    const config = makeConfig();
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("PARA Method");
    expect(prompt).toContain("01_projects/");
    expect(prompt).toContain("02_areas/");
    expect(prompt).toContain("03_resources/");
    expect(prompt).toContain("04_archive/");
  });

  it("includes bragfile section when enabled", () => {
    const config = makeConfig({
      features: { bragfile: true, contacts: false, "meeting-notes": true, "self-review": false, "vault-health": true },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("Bragfile");
    expect(prompt).toContain("brain_add_brag");
  });

  it("excludes bragfile section when disabled", () => {
    const config = makeConfig({
      features: { bragfile: false, contacts: true, "meeting-notes": true, "self-review": false, "vault-health": true },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).not.toContain("### Bragfile");
    expect(prompt).not.toContain("brain_add_brag");
  });

  it("includes contacts section when enabled", () => {
    const config = makeConfig({
      features: { bragfile: false, contacts: true, "meeting-notes": true, "self-review": false, "vault-health": true },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("Contacts");
    expect(prompt).toContain("brain_query_contacts");
  });

  it("excludes contacts section when disabled", () => {
    const config = makeConfig({
      features: { bragfile: true, contacts: false, "meeting-notes": true, "self-review": false, "vault-health": true },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).not.toContain("### Contacts");
    expect(prompt).not.toContain("brain_query_contacts");
  });

  it("includes custom rules when present", () => {
    const config = makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        expertise: ["TypeScript", "APIs"],
        tone: "direct",
        scope: "professional",
        rules: ["Always use bullet points", "Keep entries short"],
      },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("## Custom Rules");
    expect(prompt).toContain("Always use bullet points");
    expect(prompt).toContain("Keep entries short");
  });

  it("excludes custom rules section when rules array is empty", () => {
    const config = makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        expertise: ["TypeScript", "APIs"],
        tone: "direct",
        scope: "professional",
        rules: [],
      },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).not.toContain("## Custom Rules");
  });

  it("includes user context when provided", () => {
    const config = makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        expertise: ["TypeScript", "APIs"],
        tone: "direct",
        scope: "professional",
        context: "Currently working on a migration project.",
      },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("Currently working on a migration project.");
  });

  it("excludes user context when undefined", () => {
    const config = makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        expertise: ["TypeScript", "APIs"],
        tone: "direct",
        scope: "professional",
        // context is undefined by default
      },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    // The identity section should end with the scope line; no extra context paragraph
    const identitySection = prompt.split("## Vault Structure")[0] ?? "";
    expect(identitySection).not.toContain("\n\n\n");
  });

  it("excludes user context when empty string", () => {
    const config = makeConfig({
      user: {
        name: "Test User",
        role: "Engineer",
        expertise: ["TypeScript", "APIs"],
        tone: "direct",
        scope: "professional",
        context: "",
      },
    });
    const prompt = buildSystemPrompt(config, vaultPath);

    // Should behave same as undefined — no extra blank paragraph after scope line
    const identitySection = prompt.split("## Vault Structure")[0] ?? "";
    // The identity section should end with "professional vault." followed by section separator
    expect(identitySection.trim()).toMatch(/professional vault\.$/);
  });

  it("includes behavioral rules section", () => {
    const config = makeConfig();
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).toContain("## How to Work With This Vault");
    expect(prompt).toContain("brain_* tools");
    expect(prompt).toContain("Never delete vault content");
  });

  describe("project context (needs temp dir)", () => {
    let vaultDir: string;

    beforeEach(() => {
      vaultDir = mkdtempSync(join(tmpdir(), "brainkit-prompt-"));
    });

    afterEach(() => {
      rmSync(vaultDir, { recursive: true, force: true });
    });

    it("includes project context when cwd matches", () => {
      mkdirSync(join(vaultDir, "01_projects", "my-app"), { recursive: true });

      const config = makeConfig();
      const prompt = buildSystemPrompt(config, vaultDir, "/work/my-app");

      expect(prompt).toContain("## Current Project Context");
      expect(prompt).toContain("my-app");
      expect(prompt).toContain("01_projects/my-app/README.md");
    });

    it("excludes project context when cwd doesn't match", () => {
      mkdirSync(join(vaultDir, "01_projects", "my-app"), { recursive: true });

      const config = makeConfig();
      const prompt = buildSystemPrompt(config, vaultDir, "/work/other-app");

      expect(prompt).not.toContain("## Current Project Context");
    });
  });

  it("excludes project context when cwd is undefined", () => {
    const config = makeConfig();
    const prompt = buildSystemPrompt(config, vaultPath);

    expect(prompt).not.toContain("## Current Project Context");
  });

  describe("bragfile staleness reminder", () => {
    let staleDir: string;

    beforeEach(() => {
      staleDir = mkdtempSync(join(tmpdir(), "brainkit-stale-"));
      mkdirSync(join(staleDir, "01_projects"), { recursive: true });
      mkdirSync(join(staleDir, "02_areas", "career"), { recursive: true });
      mkdirSync(join(staleDir, "03_resources"), { recursive: true });
      mkdirSync(join(staleDir, "04_archive"), { recursive: true });
    });

    afterEach(() => {
      rmSync(staleDir, { recursive: true, force: true });
    });

    it("includes reminder when bragfile is stale (>14 days)", () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 20);
      const dateStr = oldDate.toISOString().slice(0, 10);
      writeFileSync(
        join(staleDir, "02_areas", "career", "bragfile.md"),
        `# Bragfile\n\n## H1 2026\n\n### January\n\n- **${dateStr}**: Old entry\n`,
        "utf-8",
      );

      const config = makeConfig();
      const prompt = buildSystemPrompt(config, staleDir);

      expect(prompt).toContain("## Reminder");
      expect(prompt).toContain("hasn't been updated in");
    });

    it("excludes reminder when bragfile is recent", () => {
      const recentDate = new Date();
      const dateStr = recentDate.toISOString().slice(0, 10);
      writeFileSync(
        join(staleDir, "02_areas", "career", "bragfile.md"),
        `# Bragfile\n\n## H1 2026\n\n### January\n\n- **${dateStr}**: Recent entry\n`,
        "utf-8",
      );

      const config = makeConfig();
      const prompt = buildSystemPrompt(config, staleDir);

      expect(prompt).not.toContain("## Reminder");
    });

    it("excludes reminder when bragfile feature is disabled", () => {
      const config = makeConfig({ features: { ...makeConfig().features, bragfile: false } });
      const prompt = buildSystemPrompt(config, staleDir);

      expect(prompt).not.toContain("## Reminder");
    });
  });
});
