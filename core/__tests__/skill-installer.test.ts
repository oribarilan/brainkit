import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installSkills, type BuildSkillContentArgs } from "../skill-installer.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-per-dir-test-"));
}

function writeSkill(dir: string, name: string, body: string): void {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\ndescription: ${name}\n---\n\n${body}\n`);
}

function createSourceSkills(dir: string): void {
  writeSkill(dir, "brainkit", "# Brainkit root\n\nRoot body.");
  writeSkill(dir, "para", "# PARA\n\nPara body.");
  writeSkill(dir, "bragfile", "# Bragfile\n\nBrag body.");
  writeSkill(dir, "contacts", "# Contacts\n\nContacts body.");
  writeSkill(dir, "meeting-notes", "# Meeting notes\n\nMeeting body.");
  writeSkill(dir, "maintenance", "# Maintenance\n\nMaintenance body.");
  writeSkill(dir, "onboarding", "# Onboarding\n\nOnboarding body.");
}

function buildSkillContent(args: BuildSkillContentArgs): string {
  const fm = `---\nname: ${args.name}\ndisable-model-invocation: ${args.isRoot ? "false" : "true"}\n---`;
  // Strip incoming frontmatter so test can assert the new one is the only one.
  const body = args.sourceContent.replace(/^---[\s\S]*?---\n*/, "");
  return `${fm}\n\n${body}`;
}

describe("installSkills (per-dir layout)", () => {
  let sourceDir: string;
  let targetParent: string;
  let targetDir: string;

  beforeEach(() => {
    sourceDir = makeTempDir();
    targetParent = makeTempDir();
    targetDir = path.join(targetParent, "plugin", "skills");
    createSourceSkills(sourceDir);
  });

  afterEach(() => {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(targetParent, { recursive: true, force: true });
  });

  it("writes one SKILL.md per skill in its own directory", () => {
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent,
    });

    for (const name of [
      "brainkit",
      "para",
      "bragfile",
      "contacts",
      "meeting-notes",
      "maintenance",
      "onboarding",
    ]) {
      expect(fs.existsSync(path.join(targetDir, name, "SKILL.md"))).toBe(true);
    }
  });

  it("invokes buildSkillContent for each skill with correct args", () => {
    const spy = vi.fn(buildSkillContent);

    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent: spy,
    });

    expect(spy).toHaveBeenCalledTimes(7);

    const rootCall = spy.mock.calls.find((c) => c[0].name === "brainkit");
    expect(rootCall).toBeDefined();
    expect(rootCall?.[0].isRoot).toBe(true);
    expect(rootCall?.[0].sourceContent).toContain("Root body.");

    const paraCall = spy.mock.calls.find((c) => c[0].name === "para");
    expect(paraCall).toBeDefined();
    expect(paraCall?.[0].isRoot).toBe(false);
    expect(paraCall?.[0].sourceContent).toContain("Para body.");
  });

  it("writes the content returned by buildSkillContent verbatim", () => {
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent,
    });

    const root = fs.readFileSync(path.join(targetDir, "brainkit", "SKILL.md"), "utf-8");
    expect(root).toContain("name: brainkit");
    expect(root).toContain("disable-model-invocation: false");
    expect(root).toContain("Root body.");

    const para = fs.readFileSync(path.join(targetDir, "para", "SKILL.md"), "utf-8");
    expect(para).toContain("name: para");
    expect(para).toContain("disable-model-invocation: true");
    expect(para).toContain("Para body.");
  });

  it("does not create a `references/` directory", () => {
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent,
    });

    expect(fs.existsSync(path.join(targetDir, "references"))).toBe(false);
  });

  it("writes the version marker", () => {
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.3.1",
      layout: "per-dir",
      buildSkillContent,
    });

    const marker = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(marker).toBe("0.3.1");
  });

  it("respects a custom versionFileName", () => {
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.3.1",
      layout: "per-dir",
      versionFileName: ".per-dir-brainkit-version",
      buildSkillContent,
    });

    expect(fs.existsSync(path.join(targetDir, ".per-dir-brainkit-version"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, ".brainkit-version"))).toBe(false);
  });

  it("skips installation when version matches and reinstalls when it changes", () => {
    const first = installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent,
    });
    expect(first.installed).toBe(true);

    const spy = vi.fn(buildSkillContent);
    const second = installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent: spy,
    });
    expect(second.installed).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    const third = installSkills({
      skillsSourceDir: sourceDir,
      targetDir,
      version: "0.2.0",
      layout: "per-dir",
      buildSkillContent,
    });
    expect(third.installed).toBe(true);
    const marker = fs.readFileSync(path.join(targetDir, ".brainkit-version"), "utf-8").trim();
    expect(marker).toBe("0.2.0");
  });

  it("uses the caller-supplied targetDir verbatim (no hardcoded path)", () => {
    const weirdTarget = path.join(targetParent, "some", "deeply", "nested", "custom", "dir");
    installSkills({
      skillsSourceDir: sourceDir,
      targetDir: weirdTarget,
      version: "0.1.0",
      layout: "per-dir",
      buildSkillContent,
    });

    expect(fs.existsSync(path.join(weirdTarget, "brainkit", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(weirdTarget, ".brainkit-version"))).toBe(true);
  });
});
