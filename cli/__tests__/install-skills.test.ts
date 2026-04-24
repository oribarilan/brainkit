import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installSkills } from "../install-skills.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
}

function createSourceSkills(dir: string): void {
  // Root skill
  const brainkitDir = path.join(dir, "brainkit");
  fs.mkdirSync(brainkitDir, { recursive: true });
  fs.writeFileSync(
    path.join(brainkitDir, "SKILL.md"),
    "---\ndescription: Core brainkit conventions\n---\n\n# Skill: brainkit\n\nSome content here.\n",
  );

  // Sub-skill: para
  const paraDir = path.join(dir, "para");
  fs.mkdirSync(paraDir, { recursive: true });
  fs.writeFileSync(
    path.join(paraDir, "SKILL.md"),
    "---\ndescription: PARA method\n---\n\n# Skill: PARA method\n\nPARA content.\n",
  );

  // Sub-skill: bragfile
  const bragDir = path.join(dir, "bragfile");
  fs.mkdirSync(bragDir, { recursive: true });
  fs.writeFileSync(
    path.join(bragDir, "SKILL.md"),
    "---\ndescription: Bragfile format\n---\n\n# Bragfile\n\nBragfile content.\n",
  );
}

describe("installSkills", () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir();
    targetDir = path.join(makeTempDir(), ".agents", "skills", "brainkit");
    createSourceSkills(sourceDir);
  });

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(path.resolve(targetDir, "../../.."), { recursive: true, force: true });
  });

  it("creates the target directory structure", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    expect(fs.existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "references"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, ".brainkit-version"))).toBe(true);
  });

  it("adds Agent Skills frontmatter to root SKILL.md", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const content = fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("name: brainkit");
    expect(content).toContain("description:");
    expect(content).toContain("Personal second brain vault");
  });

  it("adds reference links to root SKILL.md", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const content = fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf-8");
    expect(content).toContain("## Reference skills");
    expect(content).toContain("references/para.md");
    expect(content).toContain("references/bragfile.md");
  });

  it("strips frontmatter from sub-skills", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const paraContent = fs.readFileSync(path.join(targetDir, "references", "para.md"), "utf-8");
    expect(paraContent).not.toContain("---");
    expect(paraContent).toContain("PARA content.");
  });

  it("writes version marker", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const version = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(version).toBe("0.1.0");
  });

  it("skips installation when version matches", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    const result = installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });

    expect(result.installed).toBe(false);
  });

  it("reinstalls when version differs", () => {
    installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.1.0" });
    const result = installSkills({ skillsSourceDir: sourceDir, targetDir, version: "0.2.0" });

    expect(result.installed).toBe(true);
    const version = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(version).toBe("0.2.0");
  });
});
