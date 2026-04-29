import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mocks (declared before importing the module under test)
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => {
  return {
    mockSpawnHarness: vi.fn(() => ({ on: vi.fn() })),
    mockExecFileSync: vi.fn(),
    mockInstallSkillsCore: vi.fn(),
    mockLog: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      message: vi.fn(),
    },
    state: { configDir: "", packageRoot: "" },
  };
});

const mockSpawnHarness = hoisted.mockSpawnHarness;
const mockExecFileSync = hoisted.mockExecFileSync;
const mockInstallSkillsCore = hoisted.mockInstallSkillsCore;
const mockLog = hoisted.mockLog;

vi.mock("../spawn.js", () => ({
  spawnHarness: hoisted.mockSpawnHarness,
}));

vi.mock("node:child_process", () => ({
  execFileSync: hoisted.mockExecFileSync,
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  log: hoisted.mockLog,
  outro: vi.fn(),
  intro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../../core/index.js", () => ({
  readGlobalConfig: vi.fn(() => ({ version: 1, brain_path: "/unused-in-tests" })),
  readVaultConfigSimple: vi.fn(() => ({ version: 1, user: { name: "Test" }, features: {} })),
  buildSystemPrompt: vi.fn(() => "# Test brainkit prompt\n<!-- brainkit:generated -->\n"),
  buildOnboardingPrompt: vi.fn(() => "# Onboarding prompt"),
  getConfigDir: vi.fn(() => hoisted.state.configDir),
  installSkillsCore: hoisted.mockInstallSkillsCore,
}));

vi.mock("../package-root.js", () => ({
  findPackageRoot: vi.fn(() => hoisted.state.packageRoot),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  launchClaude,
  checkClaudeVersion,
  buildClaudeSkillContent,
  generateClaudeSettings,
  writeClaudeSystemPrompt,
  writeClaudeTheme,
  ensureClaudeOnboardingWorkspace,
  cleanupClaudeOnboardingWorkspace,
  stagePluginIfNeeded,
  MIN_CLAUDE_VERSION,
} from "../claude.js";
import { readGlobalConfig } from "../../core/index.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-claude-${prefix}-`));
}

function stageFreshVault(vaultPath: string): void {
  fs.writeFileSync(path.join(vaultPath, "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\n', "utf-8");
}

/**
 * Build a fake `<pkgRoot>/claude/` template tree at `pkgRoot/claude/`. Mirrors
 * the real package layout (.claude-plugin/, hooks/, scripts/, skills/doctor/).
 * Also creates fake `pkgRoot/skills/` source so the skill installer mock has
 * a real source dir to point at.
 */
function stagePackageRoot(pkgRoot: string): void {
  const claudeDir = path.join(pkgRoot, "claude");
  fs.mkdirSync(path.join(claudeDir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, ".claude-plugin", "plugin.json"), '{"name":"brainkit"}', "utf-8");
  fs.mkdirSync(path.join(claudeDir, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "hooks", "hooks.json"), "{}", "utf-8");
  fs.mkdirSync(path.join(claudeDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "scripts", "statusline.mjs"), "#!/usr/bin/env node\n", "utf-8");
  fs.writeFileSync(path.join(claudeDir, "scripts", "auto-commit.mjs"), "#!/usr/bin/env node\n", "utf-8");
  fs.mkdirSync(path.join(claudeDir, "skills", "doctor"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "skills", "doctor", "SKILL.md"),
    "---\nname: doctor\ndescription: Run health checks.\ndisable-model-invocation: true\n---\n\n# Doctor\n",
    "utf-8",
  );
  fs.mkdirSync(path.join(pkgRoot, "skills", "brainkit"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgRoot, "skills", "brainkit", "SKILL.md"),
    "---\ndescription: Core brainkit skill\n---\n\n# Brainkit\n",
    "utf-8",
  );
}

interface MockRestorable {
  mockRestore: () => void;
}
let exitSpy: MockRestorable | null = null;

beforeEach(() => {
  hoisted.state.configDir = makeTempDir("config");
  hoisted.state.packageRoot = makeTempDir("pkgroot");
  stagePackageRoot(hoisted.state.packageRoot);
  vi.clearAllMocks();

  // Real-fs writes in the skill installer mock so post-launch existence
  // checks reflect what would actually exist on disk.
  mockInstallSkillsCore.mockImplementation(({ targetDir }: { targetDir: string }) => {
    fs.mkdirSync(path.join(targetDir, "brainkit"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, "brainkit", "SKILL.md"), "---\nname: brainkit\n---\n", "utf-8");
    return { installed: true, version: "test" };
  });

  // Default: claude --version returns the floor version. Tests that need
  // different behavior override locally.
  mockExecFileSync.mockImplementation((cmd: string) => {
    if (cmd === "claude") return Buffer.from(`${MIN_CLAUDE_VERSION} (Claude Code)\n`);
    return Buffer.from("");
  });
  mockSpawnHarness.mockImplementation(() => ({ on: vi.fn() }));
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${String(code)})`);
  });
});

afterEach(() => {
  fs.rmSync(hoisted.state.configDir, { recursive: true, force: true });
  fs.rmSync(hoisted.state.packageRoot, { recursive: true, force: true });
  if (exitSpy !== null) exitSpy.mockRestore();
  exitSpy = null;
});

const mockConfigDir = (): string => hoisted.state.configDir;
const mockClaudeDir = (): string => path.join(hoisted.state.configDir, "claude");
const mockStagingDir = (): string => path.join(mockClaudeDir(), "plugin");

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("buildClaudeSkillContent", () => {
  it("emits Claude-native frontmatter for sub-skills (disable-model-invocation: true)", () => {
    const out = buildClaudeSkillContent({
      name: "para",
      sourceContent: "---\ndescription: PARA method\n---\n\n# Skill: PARA\n",
      isRoot: false,
    });
    expect(out).toContain(`name: "para"`);
    expect(out).toContain(`description: "PARA method"`);
    expect(out).toContain("disable-model-invocation: true");
    expect(out).toContain("# Skill: PARA");
    expect(out).not.toContain("---\ndescription: PARA method"); // source frontmatter stripped
  });

  it("root skill gets disable-model-invocation: false", () => {
    const out = buildClaudeSkillContent({
      name: "brainkit",
      sourceContent: "---\ndescription: Core brainkit skill\n---\n\n# Brainkit\n",
      isRoot: true,
    });
    expect(out).toContain("disable-model-invocation: false");
  });

  it("supports YAML folded (`description: >`) source frontmatter", () => {
    const out = buildClaudeSkillContent({
      name: "x",
      sourceContent: "---\ndescription: >\n  multi line\n  description here\n---\n\n# Body\n",
      isRoot: false,
    });
    expect(out).toContain(`description: "multi line description here"`);
  });

  it("falls back to a synthetic description when source has none", () => {
    const out = buildClaudeSkillContent({ name: "weird", sourceContent: "no frontmatter\n", isRoot: false });
    expect(out).toContain(`description: "Brainkit weird skill"`);
  });

  it("YAML-escapes descriptions containing unsafe chars (`:`, `#`, leading `>`)", () => {
    // A description with `:`, `#`, and a leading `>` would break naive raw
    // interpolation: `description: foo: bar # baz` is parsed by YAML as
    // `description: foo` with a stray mapping after — Claude would silently
    // drop the skill. JSON-stringify produces a valid quoted YAML scalar.
    const unsafe = "foo: bar # baz";
    const out = buildClaudeSkillContent({
      name: "weird-name",
      sourceContent: `---\ndescription: ${unsafe}\n---\n\n# Body\n`,
      isRoot: false,
    });
    // Round-trip via the same regex extractor: the description line must be
    // a valid double-quoted YAML scalar containing exactly the original text.
    const descLine = out.split("\n").find((l) => l.startsWith("description:"));
    expect(descLine).toBeDefined();
    expect(descLine).toMatch(/^description: ".*"$/);
    // The actual quoted value (between the double quotes) must JSON-parse
    // back to the original unsafe input.
    const quoted = (descLine ?? "").slice("description: ".length);
    expect(JSON.parse(quoted)).toBe(unsafe);
  });

  it("YAML-escapes descriptions containing embedded double quotes", () => {
    const unsafe = `she said "hi"`;
    const out = buildClaudeSkillContent({
      name: "x",
      sourceContent: `---\ndescription: ${unsafe}\n---\n\n# Body\n`,
      isRoot: false,
    });
    const descLine = out.split("\n").find((l) => l.startsWith("description:"));
    const quoted = (descLine ?? "").slice("description: ".length);
    expect(JSON.parse(quoted)).toBe(unsafe);
  });
});

describe("checkClaudeVersion", () => {
  it("warns when claude --version is below MIN_CLAUDE_VERSION", () => {
    mockExecFileSync.mockImplementationOnce(() => Buffer.from("1.0.0 (Claude Code)\n"));
    checkClaudeVersion();
    expect(mockLog.warn).toHaveBeenCalled();
    const msg = mockLog.warn.mock.calls[0]?.[0] as string;
    expect(msg).toContain(MIN_CLAUDE_VERSION);
    expect(msg).toContain("1.0.0");
  });

  it("does not warn at the floor version", () => {
    mockExecFileSync.mockImplementationOnce(() => Buffer.from(`${MIN_CLAUDE_VERSION} (Claude Code)\n`));
    checkClaudeVersion();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("does not warn for newer versions (real-world output)", () => {
    mockExecFileSync.mockImplementationOnce(() => Buffer.from("2.1.122 (Claude Code)\n"));
    checkClaudeVersion();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("silent when claude binary missing", () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });
    checkClaudeVersion();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("silent when version output is unparseable", () => {
    mockExecFileSync.mockImplementationOnce(() => Buffer.from("garbage with no version\n"));
    checkClaudeVersion();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Settings / theme / system prompt writers
// ---------------------------------------------------------------------------

describe("generateClaudeSettings", () => {
  it("writes settings.json with verified-schema shape", () => {
    fs.mkdirSync(mockClaudeDir(), { recursive: true });
    generateClaudeSettings(mockClaudeDir(), "/abs/path/statusline.mjs");

    const settings = JSON.parse(fs.readFileSync(path.join(mockClaudeDir(), "settings.json"), "utf-8")) as {
      theme: string;
      statusLine: { type: string; command: string };
      companyAnnouncements: string[];
      enabledPlugins: Record<string, boolean>;
    };
    expect(settings.theme).toBe("brainkit");
    expect(settings.statusLine.type).toBe("command");
    expect(settings.statusLine.command).toContain("/abs/path/statusline.mjs");
    // Per smoke test Q4, only entry 0 ever shows — keep it to one.
    expect(settings.companyAnnouncements.length).toBe(1);
    expect(settings.companyAnnouncements[0]).toMatch(/.+/);
    // Per smoke test Q2, plugin keys are bare names (no @source suffix).
    expect(settings.enabledPlugins).toEqual({ brainkit: true });
  });

  it("normalizes Windows backslashes in statusline command", () => {
    fs.mkdirSync(mockClaudeDir(), { recursive: true });
    generateClaudeSettings(mockClaudeDir(), "C:\\Users\\Test\\plugin\\scripts\\statusline.mjs");
    const settings = JSON.parse(fs.readFileSync(path.join(mockClaudeDir(), "settings.json"), "utf-8")) as {
      statusLine: { command: string };
    };
    expect(settings.statusLine.command).not.toContain("\\");
    expect(settings.statusLine.command).toContain("C:/Users/Test/plugin/scripts/statusline.mjs");
  });
});

describe("writeClaudeTheme", () => {
  it("writes themes/brainkit.json with the brand schema", () => {
    writeClaudeTheme(mockClaudeDir());
    const theme = JSON.parse(fs.readFileSync(path.join(mockClaudeDir(), "themes", "brainkit.json"), "utf-8")) as {
      name: string;
      base: string;
      overrides: { claude: string };
    };
    expect(theme.name).toBe("brainkit");
    expect(theme.base).toBe("dark");
    // Smoke test Q3: `claude` token is the only one that paints.
    expect(theme.overrides.claude).toBe("#E8A0BF");
  });
});

describe("writeClaudeSystemPrompt", () => {
  it("writes system-prompt.txt with buildSystemPrompt output", () => {
    writeClaudeSystemPrompt(
      mockClaudeDir(),
      { version: 1, user: { name: "Test", role: "engineer" }, features: {} },
      "/some/vault",
    );
    const txt = fs.readFileSync(path.join(mockClaudeDir(), "system-prompt.txt"), "utf-8");
    expect(txt).toContain("Test brainkit prompt");
    expect(txt).toContain("brainkit:generated");
  });
});

// ---------------------------------------------------------------------------
// Plugin staging
// ---------------------------------------------------------------------------

describe("stagePluginIfNeeded", () => {
  it("copies <pkgRoot>/claude/ into staging on first run and returns true", () => {
    const result = stagePluginIfNeeded(hoisted.state.packageRoot, mockStagingDir(), "1.0.0");
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(mockStagingDir(), ".claude-plugin", "plugin.json"))).toBe(true);
    expect(fs.existsSync(path.join(mockStagingDir(), "scripts", "statusline.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(mockStagingDir(), "skills", "doctor", "SKILL.md"))).toBe(true);
  });

  it("fast-path skip when version marker matches", () => {
    fs.mkdirSync(mockStagingDir(), { recursive: true });
    fs.writeFileSync(path.join(mockStagingDir(), ".brainkit-version"), "1.2.3\n", "utf-8");
    const result = stagePluginIfNeeded(hoisted.state.packageRoot, mockStagingDir(), "1.2.3");
    expect(result).toBe(false);
    // Fresh staging would have copied plugin.json — it didn't, so this proves no copy ran.
    expect(fs.existsSync(path.join(mockStagingDir(), ".claude-plugin", "plugin.json"))).toBe(false);
  });

  it("re-stages when version marker differs", () => {
    fs.mkdirSync(mockStagingDir(), { recursive: true });
    fs.writeFileSync(path.join(mockStagingDir(), ".brainkit-version"), "1.0.0\n", "utf-8");
    fs.writeFileSync(path.join(mockStagingDir(), "stale-file"), "old", "utf-8");
    const result = stagePluginIfNeeded(hoisted.state.packageRoot, mockStagingDir(), "2.0.0");
    expect(result).toBe(true);
    // Stale files removed by the wipe-before-copy step.
    expect(fs.existsSync(path.join(mockStagingDir(), "stale-file"))).toBe(false);
    expect(fs.existsSync(path.join(mockStagingDir(), ".claude-plugin", "plugin.json"))).toBe(true);
  });

  it("syncs the staged plugin.json's version field with brainkit's package version", () => {
    stagePluginIfNeeded(hoisted.state.packageRoot, mockStagingDir(), "9.9.9");
    const manifestRaw = fs.readFileSync(path.join(mockStagingDir(), ".claude-plugin", "plugin.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw) as { name?: string; version?: string };
    expect(manifest.name).toBe("brainkit");
    expect(manifest.version).toBe("9.9.9");
  });
});

// ---------------------------------------------------------------------------
// Onboarding workspace
// ---------------------------------------------------------------------------

describe("ensureClaudeOnboardingWorkspace / cleanupClaudeOnboardingWorkspace", () => {
  it("creates onboarding dir with CLAUDE.md (not AGENTS.md)", () => {
    const dir = ensureClaudeOnboardingWorkspace(mockConfigDir());
    expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(true);
    // No AGENTS.md (that's Copilot's filename — separate harness).
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(false);
  });

  it("cleanup removes the onboarding dir", () => {
    const dir = ensureClaudeOnboardingWorkspace(mockConfigDir());
    cleanupClaudeOnboardingWorkspace(mockConfigDir());
    expect(fs.existsSync(dir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// launchClaude — end-to-end
// ---------------------------------------------------------------------------

describe("launchClaude — main path", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("populates ~/.config/brainkit/claude/ with theme, settings, system-prompt, and staged plugin", () => {
    launchClaude([], vault);

    expect(fs.existsSync(path.join(mockClaudeDir(), "settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(mockClaudeDir(), "system-prompt.txt"))).toBe(true);
    expect(fs.existsSync(path.join(mockClaudeDir(), "themes", "brainkit.json"))).toBe(true);
    // Plugin staged from <pkgRoot>/claude/.
    expect(fs.existsSync(path.join(mockStagingDir(), ".claude-plugin", "plugin.json"))).toBe(true);
    // Hand-authored doctor skill survived the cp step.
    expect(fs.existsSync(path.join(mockStagingDir(), "skills", "doctor", "SKILL.md"))).toBe(true);
    // Generated skills installed alongside.
    expect(fs.existsSync(path.join(mockStagingDir(), "skills", "brainkit", "SKILL.md"))).toBe(true);
    // Version marker present after fresh stage.
    expect(fs.existsSync(path.join(mockStagingDir(), ".brainkit-version"))).toBe(true);
  });

  it("spawns claude with correct args and env", () => {
    launchClaude(["--model", "sonnet"], vault);
    expect(mockSpawnHarness).toHaveBeenCalledTimes(1);
    const callArgs = mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; env: NodeJS.ProcessEnv },
    ];
    expect(callArgs[0]).toBe("claude");
    expect(callArgs[1]).toContain("--plugin-dir");
    expect(callArgs[1]).toContain(mockStagingDir());
    expect(callArgs[1]).toContain("--append-system-prompt-file");
    expect(callArgs[1]).toContain(path.join(mockClaudeDir(), "system-prompt.txt"));
    // User args forwarded verbatim, after brainkit's flags.
    expect(callArgs[1]).toContain("--model");
    expect(callArgs[1]).toContain("sonnet");
    // No --add-dir per smoke test (cwd is the vault — redundant).
    expect(callArgs[1]).not.toContain("--add-dir");

    expect(callArgs[2].cwd).toBe(vault);
    expect(callArgs[2].env["CLAUDE_CONFIG_DIR"]).toBe(mockClaudeDir());
    expect(callArgs[2].env["BRAINKIT_VAULT_PATH"]).toBe(vault);
    expect(callArgs[2].env["BRAINKIT_PACKAGE_ROOT"]).toBe(hoisted.state.packageRoot);
  });

  it("calls installSkillsCore with per-dir layout pointed at staging", () => {
    launchClaude([], vault);
    expect(mockInstallSkillsCore).toHaveBeenCalledTimes(1);
    const opts = mockInstallSkillsCore.mock.calls[0]?.[0] as {
      layout: string;
      targetDir: string;
      skillsSourceDir: string;
      buildSkillContent: unknown;
    };
    expect(opts.layout).toBe("per-dir");
    expect(opts.targetDir).toBe(path.join(mockStagingDir(), "skills"));
    expect(opts.skillsSourceDir).toBe(path.join(hoisted.state.packageRoot, "skills"));
    expect(typeof opts.buildSkillContent).toBe("function");
  });

  it("never reads or writes ~/.claude/ (isolation)", () => {
    const fakeHome = makeTempDir("fake-home");
    const originalHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;
    try {
      launchClaude([], vault);
      expect(fs.existsSync(path.join(fakeHome, ".claude"))).toBe(false);
    } finally {
      if (originalHome !== undefined) process.env["HOME"] = originalHome;
      else delete process.env["HOME"];
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("never writes to <pkgRoot>/claude/ (read-only template invariant)", () => {
    const pkgClaudeBefore = fs.readdirSync(path.join(hoisted.state.packageRoot, "claude")).sort();
    launchClaude([], vault);
    const pkgClaudeAfter = fs.readdirSync(path.join(hoisted.state.packageRoot, "claude")).sort();
    expect(pkgClaudeAfter).toEqual(pkgClaudeBefore);
  });

  it("cleans up onboarding workspace from a previous first run", () => {
    // Simulate a leftover onboarding workspace.
    fs.mkdirSync(path.join(mockConfigDir(), "onboarding"), { recursive: true });
    fs.writeFileSync(path.join(mockConfigDir(), "onboarding", "CLAUDE.md"), "stale\n", "utf-8");

    launchClaude([], vault);

    expect(fs.existsSync(path.join(mockConfigDir(), "onboarding"))).toBe(false);
  });

  it("warns when claude version is below the floor but continues", () => {
    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === "claude") return Buffer.from("1.0.0 (Claude Code)\n");
      return Buffer.from("");
    });
    launchClaude([], vault);
    expect(mockLog.warn).toHaveBeenCalled();
    expect(mockSpawnHarness).toHaveBeenCalled();
  });
});

describe("launchClaude — onboarding path", () => {
  beforeEach(() => {
    mockReadGlobalConfig.mockReturnValue(null);
  });

  it("no vault configured → spawns claude in onboarding dir with kickoff prompt and skip-permissions", () => {
    launchClaude(["--some-user-arg"]);

    expect(mockSpawnHarness).toHaveBeenCalledTimes(1);
    const callArgs = mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; env?: NodeJS.ProcessEnv },
    ];
    expect(callArgs[0]).toBe("claude");
    // Onboarding skips the plugin entirely — Claude reads CLAUDE.md from cwd.
    expect(callArgs[1]).not.toContain("--plugin-dir");
    expect(callArgs[1]).not.toContain("--append-system-prompt-file");
    // User args still passed through.
    expect(callArgs[1]).toContain("--some-user-arg");
    // --dangerously-skip-permissions removes the per-write permission wall so
    // the agent can create config.toml + vault dirs without interrupting the
    // user (mirrors OpenCode's permission: 'allow' during onboarding).
    expect(callArgs[1]).toContain("--dangerously-skip-permissions");
    // Positional kickoff prompt auto-submits the first user message so the
    // agent immediately starts the brainkit setup conversation rather than
    // waiting for the user to type something (mirrors OpenCode's --prompt
    // and Copilot's -i in their onboarding paths).
    expect(callArgs[1]).toContain("Let's set up my first brainkit vault!");
    // The kickoff prompt is the LAST argument (positional, per `claude --help`).
    expect(callArgs[1][callArgs[1].length - 1]).toBe("Let's set up my first brainkit vault!");
    expect(callArgs[2].cwd).toBe(path.join(mockConfigDir(), "onboarding"));
    // No CLAUDE_CONFIG_DIR in onboarding — uses Claude defaults so users can authenticate.
    expect(callArgs[2].env?.["CLAUDE_CONFIG_DIR"]).toBeUndefined();

    // CLAUDE.md created with the onboarding prompt.
    expect(fs.existsSync(path.join(mockConfigDir(), "onboarding", "CLAUDE.md"))).toBe(true);
    // No version check or staging in onboarding.
    expect(mockInstallSkillsCore).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(mockClaudeDir(), "settings.json"))).toBe(false);
  });
});
