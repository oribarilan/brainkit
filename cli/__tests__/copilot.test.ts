import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { updateGitignore, generateCopilotSettings, installCopilotHooks } from "../copilot.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-copilot-test-"));
}

describe("updateGitignore", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates .gitignore if it does not exist", () => {
    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    expect(content).toContain(".agents/skills/brainkit/");
    expect(content).toContain(".github/hooks/");
    expect(content).toContain(".github/copilot/");
  });

  it("appends to existing .gitignore", () => {
    fs.writeFileSync(path.join(vaultDir, ".gitignore"), "node_modules/\n", "utf-8");

    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".agents/skills/brainkit/");
  });

  it("does not duplicate entries on re-run", () => {
    updateGitignore(vaultDir);
    updateGitignore(vaultDir);

    const content = fs.readFileSync(path.join(vaultDir, ".gitignore"), "utf-8");
    const matches = content.match(/\.agents\/skills\/brainkit\//g);
    expect(matches).toHaveLength(1);
  });
});

describe("generateCopilotSettings", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates settings.json with companyAnnouncements", () => {
    generateCopilotSettings(vaultDir, "/path/to/copilot-status.js");

    const settingsPath = path.join(vaultDir, ".github", "copilot", "settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    expect(settings["companyAnnouncements"]).toBeDefined();
    expect(Array.isArray(settings["companyAnnouncements"])).toBe(true);
  });

  it("includes statusLine with script path", () => {
    generateCopilotSettings(vaultDir, "/path/to/copilot-status.js");

    const settingsPath = path.join(vaultDir, ".github", "copilot", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    const statusLine = settings["statusLine"] as Record<string, unknown>;
    expect(statusLine["command"]).toContain("/path/to/copilot-status.js");
  });
});

describe("installCopilotHooks", () => {
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  it("creates hooks.json with agentStop and sessionEnd hooks", () => {
    installCopilotHooks(vaultDir);

    const hooksPath = path.join(vaultDir, ".github", "hooks", "hooks.json");
    expect(fs.existsSync(hooksPath)).toBe(true);

    const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as { hooks: { event: string }[] };
    const events = hooks.hooks.map((h) => h.event);
    expect(events).toContain("agentStop");
    expect(events).toContain("sessionEnd");
  });

  it("creates auto-commit.sh script", () => {
    installCopilotHooks(vaultDir);

    const scriptPath = path.join(vaultDir, ".github", "hooks", "scripts", "auto-commit.sh");
    expect(fs.existsSync(scriptPath)).toBe(true);

    const stat = fs.statSync(scriptPath);
    // Check executable bit (owner execute)
    expect(stat.mode & 0o100).toBeTruthy();
  });
});
