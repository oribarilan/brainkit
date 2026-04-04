import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { stripFrontmatter, getTargetDirs, formatDirList, updateGitignore, installSkillsToDir } from "../install.js";
import type { BrainkitConfig } from "../../extensions/vault.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(agents?: BrainkitConfig["agents"]): BrainkitConfig {
  return {
    brainkit: { version: "1.0.0" },
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["testing"],
      tone: "direct",
      scope: "professional",
    },
    features: { bragfile: true, contacts: true },
    agents,
  };
}

// ---------------------------------------------------------------------------
// stripFrontmatter (pure)
// ---------------------------------------------------------------------------

describe("stripFrontmatter", () => {
  it("strips YAML frontmatter from markdown", () => {
    const input = `---
description: Some skill description
---

# Skill Title

Body content here.
`;
    const result = stripFrontmatter(input);
    expect(result).toBe(`# Skill Title

Body content here.
`);
  });

  it("returns content unchanged if no frontmatter", () => {
    const input = `# Just a Heading

Some content.
`;
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(stripFrontmatter("")).toBe("");
  });

  it("strips frontmatter with multiple fields", () => {
    const input = `---
name: test
description: multi-line
  value here
tags: [a, b, c]
---

Content after.
`;
    const result = stripFrontmatter(input);
    expect(result).toBe("Content after.\n");
  });

  it("does not strip incomplete frontmatter (no closing ---)", () => {
    const input = `---
description: unclosed
# Heading
`;
    expect(stripFrontmatter(input)).toBe(input);
  });

  it("does not strip frontmatter that doesn't start at line 1", () => {
    const input = `Some text
---
description: not real frontmatter
---
More text
`;
    expect(stripFrontmatter(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// getTargetDirs (pure)
// ---------------------------------------------------------------------------

describe("getTargetDirs", () => {
  it("returns default dir when no providers configured", () => {
    const config = makeConfig();
    expect(getTargetDirs(config)).toEqual([".agents/skills/brainkit"]);
  });

  it("returns default dir when agents section is undefined", () => {
    const config = makeConfig(undefined);
    expect(getTargetDirs(config)).toEqual([".agents/skills/brainkit"]);
  });

  it("returns default dir when providers is empty array", () => {
    const config = makeConfig({ providers: [] });
    expect(getTargetDirs(config)).toEqual([".agents/skills/brainkit"]);
  });

  it("returns .agents dir for copilot", () => {
    const config = makeConfig({ providers: ["copilot"] });
    expect(getTargetDirs(config)).toEqual([".agents/skills/brainkit"]);
  });

  it("returns .claude dir for claude-code", () => {
    const config = makeConfig({ providers: ["claude-code"] });
    expect(getTargetDirs(config)).toEqual([".claude/skills/brainkit"]);
  });

  it("deduplicates when multiple providers map to same dir", () => {
    const config = makeConfig({ providers: ["copilot", "opencode", "codex"] });
    const dirs = getTargetDirs(config);
    expect(dirs).toEqual([".agents/skills/brainkit"]);
  });

  it("returns both dirs for copilot + claude-code", () => {
    const config = makeConfig({ providers: ["copilot", "claude-code"] });
    const dirs = getTargetDirs(config);
    expect(dirs).toHaveLength(2);
    expect(dirs).toContain(".agents/skills/brainkit");
    expect(dirs).toContain(".claude/skills/brainkit");
  });

  it("ignores unknown providers and falls back to default", () => {
    const config = makeConfig({ providers: ["unknown-agent"] });
    expect(getTargetDirs(config)).toEqual([".agents/skills/brainkit"]);
  });

  it("ignores unknown providers but keeps known ones", () => {
    const config = makeConfig({ providers: ["unknown-agent", "claude-code"] });
    expect(getTargetDirs(config)).toEqual([".claude/skills/brainkit"]);
  });
});

// ---------------------------------------------------------------------------
// formatDirList (pure)
// ---------------------------------------------------------------------------

describe("formatDirList", () => {
  it("formats single directory", () => {
    const result = formatDirList([".agents/skills/brainkit"]);
    expect(result).toBe(".agents/skills/");
  });

  it("formats multiple directories", () => {
    const result = formatDirList([".agents/skills/brainkit", ".claude/skills/brainkit"]);
    expect(result).toBe(".agents/skills/ and .claude/skills/");
  });

  it("deduplicates parent dirs", () => {
    // Two dirs with the same parent (shouldn't happen in practice but tests the Set behavior)
    const result = formatDirList([".agents/skills/brainkit", ".agents/skills/other"]);
    expect(result).toBe(".agents/skills/");
  });
});

// ---------------------------------------------------------------------------
// updateGitignore (filesystem)
// ---------------------------------------------------------------------------

describe("updateGitignore", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates .gitignore if it doesn't exist", () => {
    updateGitignore(tempDir, [".agents/skills/brainkit"]);
    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(content).toContain(".agents/skills/brainkit/");
    expect(content).toContain("# brainkit CLI");
  });

  it("appends entries with header comment", () => {
    writeFileSync(join(tempDir, ".gitignore"), "node_modules/\n", "utf-8");
    updateGitignore(tempDir, [".agents/skills/brainkit"]);

    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain("# brainkit CLI");
    expect(content).toContain(".agents/skills/brainkit/");
  });

  it("skips entries that already exist", () => {
    writeFileSync(join(tempDir, ".gitignore"), ".agents/skills/brainkit/\n", "utf-8");
    updateGitignore(tempDir, [".agents/skills/brainkit"]);

    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    // Should only appear once
    const count = (content.match(/\.agents\/skills\/brainkit\//g) ?? []).length;
    expect(count).toBe(1);
  });

  it("doesn't duplicate header on re-runs", () => {
    writeFileSync(
      join(tempDir, ".gitignore"),
      "# brainkit CLI — generated skill files\n.agents/skills/brainkit/\n",
      "utf-8",
    );
    updateGitignore(tempDir, [".claude/skills/brainkit"]);

    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    const headerCount = (content.match(/# brainkit CLI/g) ?? []).length;
    expect(headerCount).toBe(1);
    expect(content).toContain(".claude/skills/brainkit/");
  });

  it("handles file without trailing newline", () => {
    writeFileSync(join(tempDir, ".gitignore"), "node_modules/", "utf-8");
    updateGitignore(tempDir, [".agents/skills/brainkit"]);

    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    // Should have a newline between existing content and new entries
    expect(content).toContain("node_modules/\n");
    expect(content).toContain(".agents/skills/brainkit/");
  });

  it("adds multiple dirs at once", () => {
    updateGitignore(tempDir, [".agents/skills/brainkit", ".claude/skills/brainkit"]);

    const content = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(content).toContain(".agents/skills/brainkit/");
    expect(content).toContain(".claude/skills/brainkit/");
  });
});

// ---------------------------------------------------------------------------
// installSkillsToDir (filesystem)
// ---------------------------------------------------------------------------

describe("installSkillsToDir", () => {
  let tempDir: string;
  let skillsSourceDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainkit-test-"));
    skillsSourceDir = join(tempDir, "skills-source");

    // Create mock skills source directory structure
    for (const skill of ["para", "bragfile", "contacts", "meeting-notes", "maintenance", "onboarding"]) {
      mkdirSync(join(skillsSourceDir, skill), { recursive: true });
      writeFileSync(
        join(skillsSourceDir, skill, "SKILL.md"),
        `---
description: ${skill} skill description
---

# ${skill}

Content for ${skill}.
`,
        "utf-8",
      );
    }
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates target directory structure", () => {
    const targetDir = ".agents/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    const targetPath = join(tempDir, targetDir);
    expect(existsSync(targetPath)).toBe(true);
    expect(existsSync(join(targetPath, "references"))).toBe(true);
    expect(existsSync(join(targetPath, "SKILL.md"))).toBe(true);
    expect(existsSync(join(targetPath, ".brainkit-version"))).toBe(true);
  });

  it("writes root SKILL.md with proper content", () => {
    const targetDir = ".agents/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    const content = readFileSync(join(tempDir, targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("name: brainkit");
    expect(content).toContain("# brainkit");
    expect(content).toContain("PARA method");
    expect(content).toContain("[Bragfile](references/bragfile.md)");
  });

  it("copies reference skills with frontmatter stripped", () => {
    const targetDir = ".agents/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    const paraRef = readFileSync(join(tempDir, targetDir, "references", "para.md"), "utf-8");
    // Should not contain frontmatter
    expect(paraRef).not.toContain("---");
    expect(paraRef).not.toContain("description:");
    // Should contain the body
    expect(paraRef).toContain("# para");
    expect(paraRef).toContain("Content for para.");
  });

  it("creates all reference skill files", () => {
    const targetDir = ".agents/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    const refsPath = join(tempDir, targetDir, "references");
    for (const skill of ["para", "bragfile", "contacts", "meeting-notes", "maintenance", "onboarding"]) {
      expect(existsSync(join(refsPath, `${skill}.md`))).toBe(true);
    }
  });

  it("writes correct version marker", () => {
    const targetDir = ".agents/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    const versionContent = readFileSync(join(tempDir, targetDir, ".brainkit-version"), "utf-8");
    // Should be a semver-like version string
    expect(versionContent).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("skips missing source skill files without error", () => {
    // Remove one skill from source
    rmSync(join(skillsSourceDir, "para"), { recursive: true, force: true });

    const targetDir = ".agents/skills/brainkit";
    // Should not throw
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    // The missing skill should not create a file
    expect(existsSync(join(tempDir, targetDir, "references", "para.md"))).toBe(false);
    // Other skills should still be installed
    expect(existsSync(join(tempDir, targetDir, "references", "bragfile.md"))).toBe(true);
  });

  it("works with .claude target directory", () => {
    const targetDir = ".claude/skills/brainkit";
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    expect(existsSync(join(tempDir, targetDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(tempDir, targetDir, "references", "para.md"))).toBe(true);
  });

  it("overwrites existing files on re-install", () => {
    const targetDir = ".agents/skills/brainkit";

    // First install
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    // Modify a file
    writeFileSync(join(tempDir, targetDir, "SKILL.md"), "modified content", "utf-8");

    // Re-install
    installSkillsToDir(tempDir, targetDir, skillsSourceDir);

    // Should be overwritten with original
    const content = readFileSync(join(tempDir, targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("name: brainkit");
    expect(content).not.toBe("modified content");
  });
});
