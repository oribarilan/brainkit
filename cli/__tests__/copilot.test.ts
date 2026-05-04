import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mocks (declared before importing the module under test)
// ---------------------------------------------------------------------------

// vi.mock is hoisted; use vi.hoisted to declare shared mock state.
const hoisted = vi.hoisted(() => {
  return {
    mockSpawnHarness: vi.fn(() => ({ on: vi.fn() })),
    mockExecFileSync: vi.fn(),
    mockInstallSkills: vi.fn(),
    mockLog: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
      message: vi.fn(),
    },
    state: { configDir: "", copilotHome: "" },
  };
});

const mockSpawnHarness = hoisted.mockSpawnHarness;
const mockExecFileSync = hoisted.mockExecFileSync;
const mockInstallSkills = hoisted.mockInstallSkills;
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
  getCopilotConfigDir: vi.fn(() => hoisted.state.copilotHome),
}));

vi.mock("../install-skills.js", () => ({
  installSkills: hoisted.mockInstallSkills,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  launchCopilot,
  migrateLegacyVaultFiles,
  stripBrainkitGitignoreBlock,
  hasConfigDirArg,
  compareVersions,
  generateCopilotSettings,
  installCopilotHooks,
  ensureOnboardingWorkspace,
  cleanupOnboardingWorkspace,
  vaultHasLegacyBrainkitFiles,
  writeIfChanged,
  mergeCopilotSettings,
} from "../copilot.js";
import { readGlobalConfig } from "../../core/index.js";

const mockReadGlobalConfig = vi.mocked(readGlobalConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-${prefix}-`));
}

function listAllFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

function stageFreshVault(vaultPath: string): void {
  fs.writeFileSync(path.join(vaultPath, "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\n', "utf-8");
  fs.mkdirSync(path.join(vaultPath, "01_projects"), { recursive: true });
}

function stageLegacyVault(vaultPath: string, opts: { agentsMd?: string; gitignore?: string } = {}): void {
  stageFreshVault(vaultPath);
  // Stage a `.git/` dir so the migration's git-repo precondition passes.
  // The migration aborts on a non-git vault when there's anything to delete
  // (recovery via `git restore` would be impossible without git).
  fs.mkdirSync(path.join(vaultPath, ".git"), { recursive: true });
  // AGENTS.md (default = legacy preamble brainkit content).
  fs.writeFileSync(
    path.join(vaultPath, "AGENTS.md"),
    opts.agentsMd ?? "## Brainkit\n\nBrainkit is a personal second brain — generated\n",
    "utf-8",
  );
  // .agents/skills/brainkit/
  const skillsDir = path.join(vaultPath, ".agents", "skills", "brainkit");
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(path.join(skillsDir, ".brainkit-version"), "0.1.0\n", "utf-8");
  fs.writeFileSync(path.join(skillsDir, "SKILL.md"), "old content\n", "utf-8");
  // .github/hooks/
  const hooksDir = path.join(vaultPath, ".github", "hooks", "scripts");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(path.join(vaultPath, ".github", "hooks", "hooks.json"), JSON.stringify({ hooks: [] }), "utf-8");
  fs.writeFileSync(path.join(hooksDir, "auto-commit.js"), "// old\n", "utf-8");
  // .github/copilot/
  const copilotDir = path.join(vaultPath, ".github", "copilot");
  fs.mkdirSync(copilotDir, { recursive: true });
  fs.writeFileSync(path.join(copilotDir, "settings.json"), "{}", "utf-8");
  // .gitignore
  fs.writeFileSync(
    path.join(vaultPath, ".gitignore"),
    opts.gitignore ??
      "node_modules/\n\n# brainkit — generated files\n.agents/skills/brainkit/\n.github/hooks/\n.github/copilot/\n\n.DS_Store\n",
    "utf-8",
  );
}

interface MockRestorable {
  mockRestore: () => void;
}
let exitSpy: MockRestorable | null = null;

beforeEach(() => {
  hoisted.state.configDir = makeTempDir("test-config");
  hoisted.state.copilotHome = path.join(hoisted.state.configDir, "copilot");
  vi.clearAllMocks();
  // installSkills factory: real fs writes so downstream existence checks work.
  mockInstallSkills.mockImplementation(({ targetDir }: { targetDir: string }) => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, ".brainkit-version"), "test\n", "utf-8");
    fs.writeFileSync(path.join(targetDir, "SKILL.md"), "skill content\n", "utf-8");
    return { installed: true, version: "test" };
  });
  // Default: copilot --version returns the verified-good version; git rev-parse
  // reports "true" so vaultIsGitRepo() passes for staged vaults. Tests that need
  // different behavior override this mock locally.
  mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
    if (cmd === "copilot") return Buffer.from(`GitHub Copilot CLI 1.0.37.\n`);
    if (cmd === "git" && args?.[0] === "rev-parse") return Buffer.from("true\n");
    return Buffer.from("");
  });
  // spawnHarness default impl restored.
  mockSpawnHarness.mockImplementation(() => ({ on: vi.fn() }));
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${String(code)})`);
  });
});

afterEach(() => {
  fs.rmSync(hoisted.state.configDir, { recursive: true, force: true });
  if (exitSpy !== null) exitSpy.mockRestore();
  exitSpy = null;
});

// Convenience accessors for tests that reference these.
const mockConfigDir = (): string => hoisted.state.configDir;
const mockCopilotHome = (): string => hoisted.state.copilotHome;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("hasConfigDirArg", () => {
  it("detects --config-dir <value>", () => {
    expect(hasConfigDirArg(["--config-dir", "/x"])).toBe(true);
  });
  it("detects --config-dir=<value>", () => {
    expect(hasConfigDirArg(["--config-dir=/x"])).toBe(true);
  });
  it("returns false when absent", () => {
    expect(hasConfigDirArg(["-p", "hello"])).toBe(false);
  });
});

describe("compareVersions", () => {
  it("compares major/minor/patch numerically", () => {
    expect(compareVersions("1.0.37", "1.0.37")).toBe(0);
    expect(compareVersions("1.0.36", "1.0.37")).toBe(-1);
    expect(compareVersions("1.0.38", "1.0.37")).toBe(1);
    expect(compareVersions("0.9.99", "1.0.0")).toBe(-1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });
  it("returns 0 for unparseable input", () => {
    expect(compareVersions("garbage", "garbage")).toBe(0);
  });
});

describe("stripBrainkitGitignoreBlock", () => {
  const fourLines = [
    "# brainkit — generated files",
    ".agents/skills/brainkit/",
    ".github/hooks/",
    ".github/copilot/",
  ].join("\n");

  it("strips contiguous block surrounded by user content", () => {
    const input = `node_modules/\n\n${fourLines}\n\n.DS_Store\n`;
    const result = stripBrainkitGitignoreBlock(input);
    expect(result).not.toBeNull();
    expect(result).not.toContain("brainkit");
    expect(result).toContain("node_modules/");
    expect(result).toContain(".DS_Store");
  });

  it("returns null when block is split / non-contiguous", () => {
    const input = `# brainkit — generated files\n.agents/skills/brainkit/\n# my own comment\n.github/hooks/\n.github/copilot/\n`;
    expect(stripBrainkitGitignoreBlock(input)).toBeNull();
  });

  it("handles CRLF line endings", () => {
    const input = `node_modules/\r\nfoo\r\n${fourLines.replace(/\n/g, "\r\n")}\r\nbar\r\n`;
    const result = stripBrainkitGitignoreBlock(input);
    expect(result).not.toBeNull();
    expect(result).not.toContain("brainkit");
    expect(result).toContain("\r\n"); // preserves CRLF
    expect(result).toContain("node_modules/");
    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });
});

// ---------------------------------------------------------------------------
// migrateLegacyVaultFiles — direct unit tests
// ---------------------------------------------------------------------------

describe("migrateLegacyVaultFiles", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("clean vault → no-op, returns empty array", () => {
    stageFreshVault(vault);
    const before = listAllFiles(vault);
    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).toEqual([]);
    expect(listAllFiles(vault)).toEqual(before);
  });

  it("legacy vault → removes brainkit-namespaced paths + AGENTS.md + gitignore block", () => {
    stageLegacyVault(vault);
    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).toContain(".agents/skills/brainkit/");
    expect(removed).toContain(".github/hooks/");
    expect(removed).toContain(".github/copilot/");
    expect(removed).toContain("AGENTS.md");
    expect(removed).toContain(".gitignore (brainkit block)");

    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);

    const gi = fs.readFileSync(path.join(vault, ".gitignore"), "utf-8");
    expect(gi).not.toContain("brainkit");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain(".DS_Store");
  });

  it("AGENTS.md content gate: preserves non-brainkit AGENTS.md (load-bearing safety)", () => {
    stageLegacyVault(vault, { agentsMd: "# My project rules\n\nUse TypeScript strict.\n" });
    const removed = migrateLegacyVaultFiles(vault);

    // AGENTS.md preserved untouched.
    const agents = fs.readFileSync(path.join(vault, "AGENTS.md"), "utf-8");
    expect(agents).toContain("My project rules");
    expect(removed).not.toContain("AGENTS.md");

    // Brainkit-namespaced paths still cleaned.
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);
    expect(removed).toContain(".agents/skills/brainkit/");
  });

  it("AGENTS.md content gate: sentinel match → removed", () => {
    stageLegacyVault(vault, {
      agentsMd: "<!-- brainkit:generated -->\n\n# Anything here\n",
    });
    migrateLegacyVaultFiles(vault);
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(false);
  });

  it(".gitignore split / interleaved → preserved untouched, brainkit dirs still cleaned", () => {
    stageLegacyVault(vault, {
      gitignore:
        "# brainkit — generated files\n.agents/skills/brainkit/\n# my own comment\n.github/hooks/\n.github/copilot/\n",
    });
    const removed = migrateLegacyVaultFiles(vault);
    const gi = fs.readFileSync(path.join(vault, ".gitignore"), "utf-8");
    expect(gi).toContain("# my own comment");
    expect(gi).toContain("brainkit"); // unchanged
    expect(removed).not.toContain(".gitignore (brainkit block)");
    expect(removed).toContain(".agents/skills/brainkit/");
  });

  it("preserves user-owned .github/workflows when cleaning .github/", () => {
    stageLegacyVault(vault);
    const wfDir = path.join(vault, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "ci.yml"), "name: CI\n", "utf-8");

    migrateLegacyVaultFiles(vault);

    expect(fs.existsSync(path.join(vault, ".github", "hooks"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github", "copilot"))).toBe(false);
    expect(fs.existsSync(wfDir)).toBe(true); // user content untouched
    expect(fs.readFileSync(path.join(wfDir, "ci.yml"), "utf-8")).toContain("CI");
  });
});

// ---------------------------------------------------------------------------
// generateCopilotSettings + installCopilotHooks
// ---------------------------------------------------------------------------

describe("generateCopilotSettings", () => {
  it("writes inline event-keyed hooks (verified schema)", () => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");

    const settings = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      companyAnnouncements: string[];
      statusLine: { command: string };
      hooks: {
        agentStop: { command: string; description: string }[];
        sessionEnd: { command: string; description: string }[];
      };
    };
    expect(settings.companyAnnouncements.length).toBeGreaterThan(0);
    expect(settings.statusLine.command).toContain("/abs/status.js");
    expect(settings.hooks.agentStop[0]?.command).toContain("/abs/auto-commit.js");
    expect(settings.hooks.sessionEnd[0]?.command).toContain("/abs/auto-commit.js");
    expect(settings.hooks.agentStop[0]?.description).toMatch(/^brainkit:/);
    expect(settings.hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
  });
});

describe("generateCopilotSettings — merge with existing settings.json", () => {
  beforeEach(() => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
  });

  it("preserves user-added top-level keys (e.g. mcpServers) across regeneration", () => {
    fs.writeFileSync(
      path.join(mockCopilotHome(), "settings.json"),
      JSON.stringify({ mcpServers: { foo: { command: "bar" } }, theme: "dark" }),
      "utf-8",
    );
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      mcpServers: unknown;
      theme: string;
      companyAnnouncements: string[];
      statusLine: { command: string };
    };
    expect(after.mcpServers).toEqual({ foo: { command: "bar" } });
    expect(after.theme).toBe("dark");
    expect(after.companyAnnouncements.length).toBeGreaterThan(0);
    expect(after.statusLine.command).toContain("/abs/status.js");
  });

  it("preserves user-added hook entries while refreshing brainkit hook entries", () => {
    fs.writeFileSync(
      path.join(mockCopilotHome(), "settings.json"),
      JSON.stringify({
        hooks: {
          agentStop: [{ command: "user.sh", description: "my hook" }],
          sessionStart: [{ command: "start.sh", description: "user start" }],
        },
      }),
      "utf-8",
    );
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      hooks: {
        agentStop: { command: string; description: string }[];
        sessionEnd: { command: string; description: string }[];
        sessionStart: { command: string; description: string }[];
      };
    };
    expect(after.hooks.agentStop).toHaveLength(2);
    expect(after.hooks.agentStop[0]).toEqual({ command: "user.sh", description: "my hook" });
    expect(after.hooks.agentStop[1]?.description).toMatch(/^brainkit:/);
    expect(after.hooks.sessionEnd).toHaveLength(1);
    expect(after.hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
    expect(after.hooks.sessionStart).toEqual([{ command: "start.sh", description: "user start" }]);
  });

  it("idempotent: running generateCopilotSettings twice does not duplicate brainkit hook entries", () => {
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const firstContent = fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8");
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const secondContent = fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8");
    expect(secondContent).toBe(firstContent);
  });

  it("malformed existing settings.json → logs warning, overwrites with brainkit content, does not throw", () => {
    fs.writeFileSync(path.join(mockCopilotHome(), "settings.json"), "{not valid json", "utf-8");
    expect(() => {
      generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    }).not.toThrow();
    expect(mockLog.warn).toHaveBeenCalled();
    const warnMsg = mockLog.warn.mock.calls[0]?.[0] as string;
    expect(warnMsg).toContain(path.join(mockCopilotHome(), "settings.json"));
    expect(warnMsg).toContain("is not valid JSON");

    const after = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      companyAnnouncements: string[];
    };
    expect(after.companyAnnouncements.length).toBeGreaterThan(0);
  });

  it("skips file write when content is unchanged (idempotent at I/O level)", () => {
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const settingsPath = path.join(mockCopilotHome(), "settings.json");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    try {
      generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
      const writtenPaths = writeSpy.mock.calls.map((call) => String(call[0]));
      expect(writtenPaths).not.toContain(settingsPath);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("non-serializable user-added value (e.g. BigInt) → warns, falls back to brainkit-only content, does not throw", () => {
    // Pre-populate settings.json with valid JSON, then mutate in-memory so the
    // merge produces a non-serializable result. We do this by writing a normal
    // file, calling generateCopilotSettings to produce the merged content, then
    // simulating Copilot/the user injecting a BigInt by stubbing JSON.stringify
    // to throw the first time it's called.
    generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
    const settingsPath = path.join(mockCopilotHome(), "settings.json");
    // Inject a value that JSON.stringify cannot handle into the existing file.
    // BigInts can't appear in a JSON file directly, so simulate via stringify spy.
    const stringifySpy = vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw new TypeError("Do not know how to serialize a BigInt");
    });
    try {
      expect(() => {
        generateCopilotSettings(mockCopilotHome(), "/abs/status.js", "/abs/auto-commit.js");
      }).not.toThrow();
      expect(mockLog.warn).toHaveBeenCalled();
      const warnMsg = mockLog.warn.mock.calls.at(-1)?.[0] as string;
      expect(warnMsg).toContain("non-serializable");
    } finally {
      stringifySpy.mockRestore();
    }
    // File still readable and contains brainkit content.
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { companyAnnouncements: string[] };
    expect(after.companyAnnouncements.length).toBeGreaterThan(0);
  });
});

describe("installCopilotHooks", () => {
  it("writes auto-commit.js and returns its absolute path", () => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
    const scriptPath = installCopilotHooks(mockCopilotHome());
    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(path.isAbsolute(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, "utf-8");
    expect(content).toContain("git add -A");
    expect(content).toContain("brainkit: auto-save");
  });
});

describe("writeIfChanged", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTempDir("write-if-changed");
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes when file does not exist", () => {
    const target = path.join(tmp, "f.txt");
    const wrote = writeIfChanged(target, "hello");
    expect(wrote).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("hello");
  });

  it("skips write when content is byte-identical", () => {
    const target = path.join(tmp, "f.txt");
    fs.writeFileSync(target, "hello", "utf-8");
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    try {
      const wrote = writeIfChanged(target, "hello");
      expect(wrote).toBe(false);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("writes when content differs", () => {
    const target = path.join(tmp, "f.txt");
    fs.writeFileSync(target, "hello", "utf-8");
    const wrote = writeIfChanged(target, "world");
    expect(wrote).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("world");
  });
});

// ---------------------------------------------------------------------------
// Onboarding (regression: still works, no migration / version check / config-dir reject)
// ---------------------------------------------------------------------------

describe("ensureOnboardingWorkspace / cleanupOnboardingWorkspace", () => {
  it("creates and removes onboarding dir", () => {
    const dir = ensureOnboardingWorkspace(mockConfigDir());
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(true);
    cleanupOnboardingWorkspace(mockConfigDir());
    expect(fs.existsSync(dir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// launchCopilot — end-to-end isolation tests
// ---------------------------------------------------------------------------

describe("launchCopilot — isolation", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("vault stays clean during launch on a fresh vault (no legacy artifacts)", () => {
    const before = listAllFiles(vault);
    launchCopilot([], vault);
    const after = listAllFiles(vault);
    expect(after).toEqual(before);
    // Migration ran (no-op) and wrote the marker.
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(true);
  });

  it("never reads or writes ~/.copilot/", () => {
    const fakeHome = makeTempDir("fake-home");
    const originalHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;
    try {
      launchCopilot([], vault);
      expect(fs.existsSync(path.join(fakeHome, ".copilot"))).toBe(false);
    } finally {
      if (originalHome !== undefined) process.env["HOME"] = originalHome;
      else delete process.env["HOME"];
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("spawns copilot with COPILOT_HOME and BRAINKIT_VAULT_PATH env", () => {
    launchCopilot(["-p", "hi"], vault);
    expect(mockSpawnHarness).toHaveBeenCalledTimes(1);
    const callArgs = mockSpawnHarness.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }];
    const opts = callArgs[2];
    expect(opts.env["COPILOT_HOME"]).toBe(mockCopilotHome());
    expect(opts.env["BRAINKIT_VAULT_PATH"]).toBe(vault);
  });

  it("second launch on unchanged state skips writes for instructions and auto-commit script", () => {
    // First launch: populates everything.
    launchCopilot([], vault);
    const instrPath = path.join(mockCopilotHome(), "copilot-instructions.md");
    const hookPath = path.join(mockCopilotHome(), "hooks", "scripts", "auto-commit.js");

    // Second launch: spy on fs.writeFileSync and assert these two paths are not written.
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    try {
      launchCopilot([], vault);
      const writtenPaths = writeSpy.mock.calls.map((call) => String(call[0]));
      expect(writtenPaths).not.toContain(instrPath);
      expect(writtenPaths).not.toContain(hookPath);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("launchCopilot preserves user-added settings.json keys across launches (regression: MCP servers)", () => {
    // First launch: populate everything fresh.
    launchCopilot([], vault);

    // Simulate Copilot CLI runtime adding an MCP server to the file.
    const settingsPath = path.join(mockCopilotHome(), "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    settings["mcpServers"] = { myserver: { command: "node", args: ["/path/server.js"] } };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");

    // Second launch: brainkit must NOT clobber mcpServers.
    launchCopilot([], vault);
    const after = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    expect(after["mcpServers"]).toEqual({ myserver: { command: "node", args: ["/path/server.js"] } });
    expect(after["companyAnnouncements"]).toBeDefined();
  });
});

describe("launchCopilot — migration end-to-end", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("legacy vault: first launch migrates + populates COPILOT_HOME; second launch is silent", () => {
    stageLegacyVault(vault);

    // First launch — migration runs.
    launchCopilot([], vault);

    // Vault cleaned.
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);

    // COPILOT_HOME populated.
    expect(fs.existsSync(path.join(mockCopilotHome(), "copilot-instructions.md"))).toBe(true);
    expect(fs.existsSync(path.join(mockCopilotHome(), "settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(mockCopilotHome(), "skills", "brainkit", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(mockCopilotHome(), "hooks", "scripts", "auto-commit.js"))).toBe(true);
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(true);

    // Notice was printed (mentions removed files + recovery hint).
    expect(mockLog.info).toHaveBeenCalled();
    const noticeCall = mockLog.info.mock.calls[0]?.[0] as string;
    expect(noticeCall).toContain("git restore");

    // Second launch — silent.
    mockLog.info.mockClear();
    launchCopilot([], vault);
    expect(mockLog.info).not.toHaveBeenCalled();
  });

  it("marker present → migration skipped even if legacy files appear later", () => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
    fs.writeFileSync(path.join(mockCopilotHome(), ".migration-v1"), "2026-04-28T00:00:00Z\n", "utf-8");
    stageLegacyVault(vault);

    launchCopilot([], vault);

    // Legacy files still in vault — migration was skipped.
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(vault, ".agents", "skills", "brainkit"))).toBe(true);
  });

  it("AGENTS.md content gate via launchCopilot: non-brainkit AGENTS.md preserved", () => {
    stageLegacyVault(vault, { agentsMd: "# My project rules\n\nUse TypeScript strict.\n" });
    launchCopilot([], vault);

    const agents = fs.readFileSync(path.join(vault, "AGENTS.md"), "utf-8");
    expect(agents).toContain("My project rules");
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
  });
});

describe("launchCopilot — --config-dir rejection", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it.each([
    ["space form", ["--config-dir", "/some/path"]],
    ["equals form", ["--config-dir=/some/path"]],
  ])("rejects --config-dir (%s) with non-zero exit", (_label, args) => {
    expect(() => {
      launchCopilot(args, vault);
    }).toThrow(/process\.exit\(1\)/);
    expect(mockLog.error).toHaveBeenCalled();
    // Aborted before any setup.
    expect(mockSpawnHarness).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
  });
});

describe("launchCopilot — version warning", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("warns when copilot --version is below MIN_COPILOT_VERSION but continues launch", () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "copilot") return Buffer.from("GitHub Copilot CLI 1.0.20.\n");
      if (cmd === "git" && args?.[0] === "rev-parse") return Buffer.from("true\n");
      return Buffer.from("");
    });
    launchCopilot([], vault);
    expect(mockLog.warn).toHaveBeenCalled();
    const msg = mockLog.warn.mock.calls[0]?.[0] as string;
    expect(msg).toContain("1.0.37");
    expect(msg).toContain("1.0.20");
    expect(mockSpawnHarness).toHaveBeenCalled(); // continued
  });

  it("does not warn at the floor version", () => {
    // Default mock already returns 1.0.37 + git true; just call.
    launchCopilot([], vault);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("skips silently when copilot --version errors", () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "copilot") throw new Error("not found");
      if (cmd === "git" && args?.[0] === "rev-parse") return Buffer.from("true\n");
      return Buffer.from("");
    });
    launchCopilot([], vault);
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockSpawnHarness).toHaveBeenCalled();
  });
});

describe("launchCopilot — atomicity", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault");
  });
  afterEach(() => {
    // Restore perms so cleanup works.
    try {
      fs.chmodSync(path.join(vault, ".github"), 0o755);
      fs.chmodSync(path.join(vault, ".github", "hooks"), 0o755);
    } catch {
      // ignore
    }
    fs.rmSync(vault, { recursive: true, force: true });
  });

  // Skip on Windows: chmod-based unwritability doesn't behave the same way.
  it.skipIf(process.platform === "win32")("partial migration failure → marker NOT written, launch aborts", () => {
    stageLegacyVault(vault);

    // Make .github/ non-writable so rmSync of .github/hooks fails with EACCES.
    // .agents/skills/brainkit/ deletion runs first and succeeds; .github/hooks/
    // is the second deletion and will throw — verifying atomicity.
    fs.chmodSync(path.join(vault, ".github"), 0o555);

    expect(() => {
      launchCopilot([], vault);
    }).toThrow();
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
    expect(mockLog.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// P0-1: Symlink safety in migration
// ---------------------------------------------------------------------------

describe("migrateLegacyVaultFiles — symlink safety (P0-1)", () => {
  let vault: string;
  let outsideTarget: string;
  beforeEach(() => {
    vault = makeTempDir("vault-symlink");
    outsideTarget = makeTempDir("outside-target");
    // Plant a sentinel file inside the symlink target so we can verify it
    // survives the migration.
    fs.writeFileSync(path.join(outsideTarget, "user-precious.txt"), "DO NOT DELETE\n", "utf-8");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(outsideTarget, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "brainkit-namespaced dir is a symlink → unlink the link, never traverse into target",
    () => {
      stageFreshVault(vault);
      // Create the brainkit-namespaced path as a symlink to a directory full of
      // user-precious content outside the vault.
      fs.mkdirSync(path.join(vault, ".agents", "skills"), { recursive: true });
      fs.symlinkSync(outsideTarget, path.join(vault, ".agents", "skills", "brainkit"));

      const removed = migrateLegacyVaultFiles(vault);

      expect(removed).toContain(".agents/skills/brainkit/");
      // Symlink itself is gone.
      expect(fs.existsSync(path.join(vault, ".agents", "skills", "brainkit"))).toBe(false);
      // Target dir + its contents must survive.
      expect(fs.existsSync(outsideTarget)).toBe(true);
      expect(fs.readFileSync(path.join(outsideTarget, "user-precious.txt"), "utf-8")).toContain("DO NOT DELETE");
    },
  );

  it.skipIf(process.platform === "win32")(
    "AGENTS.md is a symlink to brainkit-generated file → unlink the link only",
    () => {
      stageFreshVault(vault);
      // Plant a brainkit-generated file outside the vault.
      const externalAgents = path.join(outsideTarget, "AGENTS.md");
      fs.writeFileSync(externalAgents, "<!-- brainkit:generated -->\n# generated\n", "utf-8");
      // Symlink the vault's AGENTS.md at the external file.
      fs.symlinkSync(externalAgents, path.join(vault, "AGENTS.md"));

      const removed = migrateLegacyVaultFiles(vault);

      expect(removed).toContain("AGENTS.md");
      // Vault symlink gone.
      expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(false);
      // External target file still exists (the link was removed, not the target).
      expect(fs.existsSync(externalAgents)).toBe(true);
      expect(fs.readFileSync(externalAgents, "utf-8")).toContain("brainkit:generated");
    },
  );
});

// ---------------------------------------------------------------------------
// P0-2: AGENTS.md content gate — anchored preamble (no false positives)
// ---------------------------------------------------------------------------

describe("AGENTS.md content gate — anchored preamble (P0-2)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-anchor");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("preamble appearing late in a long doc is NOT treated as brainkit-generated", () => {
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
    // 600 bytes of user content followed by a quoted preamble — should NOT trip the gate.
    const padding = "# My agent rules\n\n" + "User-authored content. ".repeat(30);
    const agents = padding + "\n\nFor reference: Brainkit is a personal second brain — but I'm not using it here.\n";
    fs.writeFileSync(path.join(vault, "AGENTS.md"), agents, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).not.toContain("AGENTS.md");
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
  });

  it("preamble in first 400 bytes IS treated as brainkit-generated (legacy match)", () => {
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
    const agents = "## Brainkit\n\nBrainkit is a personal second brain — long file follows...\n" + "x".repeat(2000);
    fs.writeFileSync(path.join(vault, "AGENTS.md"), agents, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).toContain("AGENTS.md");
  });

  it("sentinel match works regardless of position in file (not anchored)", () => {
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
    // Sentinel buried 1000 bytes deep — sentinel gate is unanchored, should still match.
    const agents = "x".repeat(1000) + "\n<!-- brainkit:generated -->\n";
    fs.writeFileSync(path.join(vault, "AGENTS.md"), agents, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).toContain("AGENTS.md");
  });
});

// ---------------------------------------------------------------------------
// P0-3: Ordering invariant — $COPILOT_HOME populated before vault deletion
// ---------------------------------------------------------------------------

describe("launchCopilot — ordering invariant (P0-3)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-order");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("if installSkills throws, vault is NOT modified (population happens before migration)", () => {
    stageLegacyVault(vault);
    const filesBefore = listAllFiles(vault).filter((f) => !f.startsWith(".git/"));

    mockInstallSkills.mockImplementationOnce(() => {
      throw new Error("simulated installSkills failure");
    });

    expect(() => {
      launchCopilot([], vault);
    }).toThrow(/simulated installSkills failure/);

    const filesAfter = listAllFiles(vault).filter((f) => !f.startsWith(".git/"));
    expect(filesAfter).toEqual(filesBefore); // vault untouched
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P0-4: Refuse to migrate non-git vaults with legacy files
// ---------------------------------------------------------------------------

describe("launchCopilot — non-git vault safety (P0-4)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-nogit");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("legacy files present + no git repo → aborts with error, vault untouched", () => {
    stageLegacyVault(vault);
    // Remove the .git dir that stageLegacyVault creates (cosmetic — gate is `git rev-parse`).
    fs.rmSync(path.join(vault, ".git"), { recursive: true, force: true });
    // Override mock so `git rev-parse` reports vault is NOT inside a work tree.
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "copilot") return Buffer.from("GitHub Copilot CLI 1.0.37.\n");
      if (cmd === "git" && args?.[0] === "rev-parse") {
        const err = new Error("not a git repository") as NodeJS.ErrnoException;
        throw err;
      }
      return Buffer.from("");
    });
    const filesBefore = listAllFiles(vault);

    expect(() => {
      launchCopilot([], vault);
    }).toThrow(/process\.exit\(1\)/);
    expect(mockLog.error).toHaveBeenCalled();
    const errMsg = mockLog.error.mock.calls[0]?.[0] as string;
    expect(errMsg).toContain("not a git repository");
    expect(errMsg).toContain("git init");

    expect(listAllFiles(vault)).toEqual(filesBefore);
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
  });

  it("clean vault + no git repo → migration runs (no-op), marker written, no abort", () => {
    stageFreshVault(vault);
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "copilot") return Buffer.from("GitHub Copilot CLI 1.0.37.\n");
      if (cmd === "git" && args?.[0] === "rev-parse") throw new Error("not a git repository");
      return Buffer.from("");
    });
    launchCopilot([], vault);
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(true);
  });

  it("legacy files present + vault is in monorepo (git rev-parse returns true) → migration proceeds", () => {
    stageLegacyVault(vault);
    fs.rmSync(path.join(vault, ".git"), { recursive: true, force: true });
    // Default mock returns "true" for git rev-parse → P1-B fix lets monorepo
    // vaults migrate even without `.git/` directly inside vault.
    launchCopilot([], vault);
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test gap fills (from explorer's coverage map)
// ---------------------------------------------------------------------------

describe("launchCopilot — onboarding path (gap fill)", () => {
  beforeEach(() => {
    // Override default: simulate no vault configured.
    mockReadGlobalConfig.mockReturnValue(null);
  });

  it("no vault configured → spawns copilot in onboarding workspace, skips migration / version check / config-dir reject", () => {
    launchCopilot(["--config-dir", "/should/not/be/rejected/here"]);

    // Spawn happened with onboarding cwd + onboarding args, NOT --config-dir rejection.
    expect(mockSpawnHarness).toHaveBeenCalledTimes(1);
    expect(mockLog.error).not.toHaveBeenCalled();
    const callArgs = mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; env?: NodeJS.ProcessEnv },
    ];
    expect(callArgs[0]).toBe("copilot");
    // Onboarding spawn args include the seed prompt + user args.
    expect(callArgs[1]).toContain("Let's set up my first brainkit vault!");
    expect(callArgs[1]).toContain("-i");
    expect(callArgs[1]).toContain("--allow-all");
    // Regression guard: `-i <prompt>` must be adjacent and `--allow-all` must
    // come before `-i`. Otherwise Copilot treats `--allow-all` as the prompt
    // value and the real prompt as a stray positional ("too many arguments").
    const iIdx = callArgs[1].indexOf("-i");
    expect(callArgs[1][iIdx + 1]).toBe("Let's set up my first brainkit vault!");
    expect(callArgs[1].indexOf("--allow-all")).toBeLessThan(iIdx);
    // cwd is the onboarding dir under config dir.
    expect(callArgs[2].cwd).toBe(path.join(mockConfigDir(), "onboarding"));
    // No COPILOT_HOME in onboarding — uses Copilot's defaults.
    expect(callArgs[2].env?.["COPILOT_HOME"]).toBeUndefined();
    // Migration marker NOT created (migration didn't run).
    expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
    // Onboarding dir + AGENTS.md created.
    expect(fs.existsSync(path.join(mockConfigDir(), "onboarding", "AGENTS.md"))).toBe(true);
  });
});

describe("launchCopilot — spawn args fidelity (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-spawnfid");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("forwards user args verbatim and sets cwd to vaultPath", () => {
    const userArgs = ["-p", "hello world", "--allow-tool", "shell"];
    launchCopilot(userArgs, vault);
    const call = mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { cwd: string; stdio: string; env: NodeJS.ProcessEnv },
    ];
    expect(call[0]).toBe("copilot");
    expect(call[1]).toEqual(userArgs);
    expect(call[2].cwd).toBe(vault);
    expect(call[2].stdio).toBe("inherit");
  });

  it("empty args array still spawns correctly", () => {
    launchCopilot([], vault);
    const call = mockSpawnHarness.mock.calls[0] as unknown as [string, string[], { cwd: string }];
    expect(call[1]).toEqual([]);
    expect(call[2].cwd).toBe(vault);
  });
});

describe("installSkills invocation contract (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-skills");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("installSkills called with targetDir = $COPILOT_HOME/skills/brainkit and skillsSourceDir under package root", () => {
    launchCopilot([], vault);
    expect(mockInstallSkills).toHaveBeenCalledTimes(1);
    const opts = mockInstallSkills.mock.calls[0]?.[0] as {
      targetDir: string;
      skillsSourceDir: string;
      version: string;
    };
    expect(opts.targetDir).toBe(path.join(mockCopilotHome(), "skills", "brainkit"));
    expect(opts.skillsSourceDir.endsWith(path.join("", "skills"))).toBe(true);
    expect(typeof opts.version).toBe("string");
    expect(opts.version.length).toBeGreaterThan(0);
  });
});

describe("generateCopilotSettings — Windows path normalization (gap fill)", () => {
  it("backslashes in script paths are converted to forward slashes in command strings", () => {
    fs.mkdirSync(mockCopilotHome(), { recursive: true });
    const winStatusPath = "C:\\Users\\Test\\dist\\cli\\copilot-status.js";
    const winHookPath = "C:\\Users\\Test\\copilot\\hooks\\scripts\\auto-commit.js";
    generateCopilotSettings(mockCopilotHome(), winStatusPath, winHookPath);

    const settings = JSON.parse(fs.readFileSync(path.join(mockCopilotHome(), "settings.json"), "utf-8")) as {
      statusLine: { command: string };
      hooks: { agentStop: { command: string }[]; sessionEnd: { command: string }[] };
    };
    expect(settings.statusLine.command).not.toContain("\\");
    expect(settings.statusLine.command).toContain("C:/Users/Test/dist/cli/copilot-status.js");
    expect(settings.hooks.agentStop[0]?.command).not.toContain("\\");
    expect(settings.hooks.sessionEnd[0]?.command).toContain("/");
  });
});

describe("stripBrainkitGitignoreBlock — edge cases (gap fill)", () => {
  const fourLines = [
    "# brainkit — generated files",
    ".agents/skills/brainkit/",
    ".github/hooks/",
    ".github/copilot/",
  ].join("\n");

  it("file is exactly the four-line block + trailing newline → result is empty string", () => {
    const result = stripBrainkitGitignoreBlock(fourLines + "\n");
    expect(result).toBe("");
  });

  it("file is the four-line block at end-of-file with no trailing blank → no real line consumed", () => {
    const input = `node_modules/\n${fourLines}`;
    const result = stripBrainkitGitignoreBlock(input);
    expect(result).not.toBeNull();
    expect(result).toContain("node_modules/");
    expect(result).not.toContain("brainkit");
  });

  it("empty file → returns null (no block to strip)", () => {
    expect(stripBrainkitGitignoreBlock("")).toBeNull();
  });
});

describe("migrateLegacyVaultFiles — partial failure stage 1 (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-stage1");
  });
  afterEach(() => {
    try {
      fs.chmodSync(path.join(vault, ".agents"), 0o755);
      fs.chmodSync(path.join(vault, ".agents", "skills"), 0o755);
    } catch {
      // ignore
    }
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "stage 1 (.agents/skills/brainkit) failure → throws, marker NOT written, .github paths NOT touched",
    () => {
      stageLegacyVault(vault);
      // Make .agents/skills non-writable so removing brainkit/ subdir fails.
      fs.chmodSync(path.join(vault, ".agents", "skills"), 0o555);

      expect(() => {
        launchCopilot([], vault);
      }).toThrow();
      // Marker not written.
      expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
      // .github paths still present (we threw on stage 1, never reached stage 2/3).
      expect(fs.existsSync(path.join(vault, ".github", "hooks"))).toBe(true);
      expect(fs.existsSync(path.join(vault, ".github", "copilot"))).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// Round 2 gap fills
// ---------------------------------------------------------------------------

describe("migrateLegacyVaultFiles — symlink safety on .github/hooks and .github/copilot (gap fill)", () => {
  let vault: string;
  let outsideTarget: string;
  beforeEach(() => {
    vault = makeTempDir("vault-symlink-other");
    outsideTarget = makeTempDir("outside-target-other");
    fs.writeFileSync(path.join(outsideTarget, "user-precious.txt"), "DO NOT DELETE\n", "utf-8");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(outsideTarget, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(".github/hooks as symlink → unlink only, target survives", () => {
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".github"), { recursive: true });
    fs.symlinkSync(outsideTarget, path.join(vault, ".github", "hooks"));

    const removed = migrateLegacyVaultFiles(vault);

    expect(removed).toContain(".github/hooks/");
    expect(fs.existsSync(path.join(vault, ".github", "hooks"))).toBe(false);
    expect(fs.existsSync(outsideTarget)).toBe(true);
    expect(fs.readFileSync(path.join(outsideTarget, "user-precious.txt"), "utf-8")).toContain("DO NOT DELETE");
  });

  it.skipIf(process.platform === "win32")(".github/copilot as symlink → unlink only, target survives", () => {
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".github"), { recursive: true });
    fs.symlinkSync(outsideTarget, path.join(vault, ".github", "copilot"));

    const removed = migrateLegacyVaultFiles(vault);

    expect(removed).toContain(".github/copilot/");
    expect(fs.existsSync(path.join(vault, ".github", "copilot"))).toBe(false);
    expect(fs.existsSync(outsideTarget)).toBe(true);
    expect(fs.readFileSync(path.join(outsideTarget, "user-precious.txt"), "utf-8")).toContain("DO NOT DELETE");
  });
});

describe("launchCopilot — ordering invariant for all population steps (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-order-all");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  function legacyFilesSnapshot(v: string): string[] {
    return listAllFiles(v).filter((f) => !f.startsWith(".git/"));
  }

  it("if writeCopilotInstructions throws (via buildSystemPrompt), vault is NOT modified", async () => {
    stageLegacyVault(vault);
    const before = legacyFilesSnapshot(vault);

    const coreMod = await import("../../core/index.js");
    const buildSpy = vi.spyOn(coreMod, "buildSystemPrompt").mockImplementation(() => {
      throw new Error("simulated buildSystemPrompt failure");
    });

    try {
      expect(() => {
        launchCopilot([], vault);
      }).toThrow(/simulated buildSystemPrompt failure/);
      expect(legacyFilesSnapshot(vault)).toEqual(before);
      expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
    } finally {
      buildSpy.mockRestore();
    }
  });

  it.skipIf(process.platform === "win32")(
    "if a COPILOT_HOME write fails (chmod read-only), vault is NOT modified",
    () => {
      stageLegacyVault(vault);
      const before = legacyFilesSnapshot(vault);

      // Pre-create copilot home read-only so any subsequent write under it
      // fails with EACCES. This forces a failure during the population phase
      // (installSkills / writeCopilotInstructions / installCopilotHooks /
      // generateCopilotSettings — whichever writes first).
      fs.mkdirSync(mockCopilotHome(), { recursive: true });
      fs.chmodSync(mockCopilotHome(), 0o555);

      try {
        expect(() => {
          launchCopilot([], vault);
        }).toThrow();
        expect(legacyFilesSnapshot(vault)).toEqual(before);
        expect(fs.existsSync(path.join(mockCopilotHome(), ".migration-v1"))).toBe(false);
      } finally {
        fs.chmodSync(mockCopilotHome(), 0o755);
      }
    },
  );
});

describe("runMigrationIfNeeded — marker write failure (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-marker-fail");
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "marker write fails after deletions succeed → marker NOT written; next launch on now-clean vault retries safely",
    () => {
      stageLegacyVault(vault);

      // Strategy: let population complete normally, but after population
      // chmod the copilot home read-only so the marker write fails. We do
      // this by making the COPILOT_HOME's parent (mockConfigDir()) become
      // non-writable just before launch. installSkills writes into
      // mockCopilotHome()/skills/brainkit which already exists from a fake
      // pre-population; we'll instead fake population by pre-creating the
      // copilot home with a fully-populated structure, then chmod it 555,
      // then call launchCopilot. Population steps are all idempotent and
      // re-write existing files, which will now fail.
      //
      // Simpler: pre-create copilot home, do a real first launch to populate
      // it (and write the marker), then DELETE just the marker, chmod it
      // read-only, and re-launch. But marker deletion bypasses the gate so
      // migration retries.
      //
      // Actually simplest: stage legacy + pre-populate copilot home + chmod
      // 555. installSkills will fail on its idempotent re-write attempt.
      // This still proves ordering (vault untouched on failure) but doesn't
      // test marker-specifically. We've already covered ordering above.
      //
      // For the actual marker-write-failure scenario: pre-populate
      // copilot home (populated state), then make ONLY the marker path
      // unwritable via creating it as a directory (writeFileSync to a path
      // that's a directory throws EISDIR).
      fs.mkdirSync(mockCopilotHome(), { recursive: true });
      fs.mkdirSync(path.join(mockCopilotHome(), ".migration-v1"), { recursive: true });

      try {
        expect(() => {
          launchCopilot([], vault);
        }).toThrow();
        // Vault deletions did succeed (migration ran before marker write).
        expect(fs.existsSync(path.join(vault, ".agents"))).toBe(false);
        expect(fs.existsSync(path.join(vault, ".github"))).toBe(false);
        // Marker is still a directory, not a file → existsSync(true) but
        // it's not a valid marker. statSync would tell us it's not a file.
        const markerStat = fs.statSync(path.join(mockCopilotHome(), ".migration-v1"));
        expect(markerStat.isFile()).toBe(false);
      } finally {
        fs.rmSync(path.join(mockCopilotHome(), ".migration-v1"), { recursive: true, force: true });
      }

      // Second launch on now-clean vault — migration is a no-op, marker is
      // written successfully (the directory blocking it has been removed).
      launchCopilot([], vault);
      const markerStatAfter = fs.statSync(path.join(mockCopilotHome(), ".migration-v1"));
      expect(markerStatAfter.isFile()).toBe(true);
      expect(mockSpawnHarness).toHaveBeenCalled();
    },
  );
});

describe("isBrainkitAgentsMd — exact 400-byte boundary (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-boundary");
    stageFreshVault(vault);
    fs.mkdirSync(path.join(vault, ".git"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  const PREAMBLE = "Brainkit is a personal second brain";

  it("preamble ending exactly at code unit 399 → match", () => {
    // Pad so preamble starts at index (400 - PREAMBLE.length) = 365 and ends
    // at index 400 (exclusive). slice(0, 400) includes indices 0..399, which
    // contains the full preamble.
    const padding = "x".repeat(400 - PREAMBLE.length);
    const content = padding + PREAMBLE + "\nrest of file\n";
    fs.writeFileSync(path.join(vault, "AGENTS.md"), content, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).toContain("AGENTS.md");
  });

  it("preamble starting at code unit 400 → no match (just outside the window)", () => {
    const padding = "x".repeat(400);
    const content = padding + PREAMBLE + "\nrest of file\n";
    fs.writeFileSync(path.join(vault, "AGENTS.md"), content, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    expect(removed).not.toContain("AGENTS.md");
    expect(fs.existsSync(path.join(vault, "AGENTS.md"))).toBe(true);
  });

  it("preamble straddling the boundary (starts before, ends after) → no match", () => {
    // Place preamble starting at index 380 — last char lands at index
    // 380 + len - 1. Some of preamble is inside slice, some outside. Since
    // `includes` requires the FULL substring within the slice, this should
    // NOT match.
    const padding = "x".repeat(380);
    const content = padding + PREAMBLE + "\nrest\n";
    fs.writeFileSync(path.join(vault, "AGENTS.md"), content, "utf-8");

    const removed = migrateLegacyVaultFiles(vault);
    // Preamble is 35 chars; ends at index 380+35=415 → past the 400 window.
    // First 400 chars contain only "x"*380 + first 20 chars of preamble.
    // That partial substring should NOT trigger a full-preamble match.
    expect(removed).not.toContain("AGENTS.md");
  });
});

describe("vaultHasLegacyBrainkitFiles — direct unit tests (gap fill)", () => {
  let vault: string;
  beforeEach(() => {
    vault = makeTempDir("vault-has-legacy");
    stageFreshVault(vault);
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
  });

  it("clean vault → false", () => {
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(false);
  });

  it(".agents/skills/brainkit/ only → true", () => {
    fs.mkdirSync(path.join(vault, ".agents", "skills", "brainkit"), { recursive: true });
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(true);
  });

  it(".github/hooks/ only → true", () => {
    fs.mkdirSync(path.join(vault, ".github", "hooks"), { recursive: true });
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(true);
  });

  it(".github/copilot/ only → true", () => {
    fs.mkdirSync(path.join(vault, ".github", "copilot"), { recursive: true });
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(true);
  });

  it("brainkit-shaped AGENTS.md only (sentinel match) → true", () => {
    fs.writeFileSync(path.join(vault, "AGENTS.md"), "<!-- brainkit:generated -->\n# anything\n", "utf-8");
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(true);
  });

  it("brainkit-shaped AGENTS.md only (legacy preamble in head) → true", () => {
    fs.writeFileSync(
      path.join(vault, "AGENTS.md"),
      "## Brainkit\n\nBrainkit is a personal second brain — generated\n",
      "utf-8",
    );
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(true);
  });

  it("non-brainkit AGENTS.md only → false", () => {
    fs.writeFileSync(path.join(vault, "AGENTS.md"), "# My agent rules\nUse TypeScript strict.\n", "utf-8");
    expect(vaultHasLegacyBrainkitFiles(vault)).toBe(false);
  });
});

describe("buildSystemPrompt — sentinel emission (gap fill for P1-A)", () => {
  it("prompt starts with the brainkit sentinel comment", async () => {
    // We mocked buildSystemPrompt for the launchCopilot tests above, but here
    // we want the real one to verify the sentinel is actually emitted in
    // production code, not just the mock.
    vi.doUnmock("../../core/index.js");
    vi.resetModules();
    const real = await vi.importActual<typeof import("../../core/index.js")>("../../core/index.js");
    const config = {
      version: 1,
      user: { name: "Test", role: "engineer" },
      features: {},
    } as Parameters<typeof real.buildSystemPrompt>[0];
    const prompt = real.buildSystemPrompt(config, "/tmp/test-vault", { mode: "cli" });
    expect(prompt.startsWith("<!-- brainkit:generated -->")).toBe(true);
    // Re-mock to avoid bleeding into other tests in this file.
    vi.doMock("../../core/index.js");
  });
});

describe("mergeCopilotSettings", () => {
  const brainkitOwned = {
    companyAnnouncements: ["bk-msg"],
    statusLine: { command: "node /abs/status.js" },
    hooks: {
      agentStop: [{ command: "node /abs/auto-commit.js", description: "brainkit: auto-commit on agent stop" }],
      sessionEnd: [{ command: "node /abs/auto-commit.js", description: "brainkit: auto-commit on session end" }],
    },
  };

  it("no existing settings → returns brainkit-owned content as-is", () => {
    const result = mergeCopilotSettings(null, brainkitOwned);
    expect(result).toEqual(brainkitOwned);
  });

  it("preserves user-added top-level keys", () => {
    const existing = { mcpServers: { foo: { command: "bar" } }, theme: "dark" };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    expect(result["mcpServers"]).toEqual({ foo: { command: "bar" } });
    expect(result["theme"]).toBe("dark");
    expect(result["companyAnnouncements"]).toEqual(["bk-msg"]);
    expect(result["statusLine"]).toEqual({ command: "node /abs/status.js" });
  });

  it("replaces brainkit-owned top-level scalar keys (companyAnnouncements, statusLine)", () => {
    const existing = {
      companyAnnouncements: ["stale"],
      statusLine: { command: "node /old/status.js" },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    expect(result["companyAnnouncements"]).toEqual(["bk-msg"]);
    expect(result["statusLine"]).toEqual({ command: "node /abs/status.js" });
  });

  it("preserves user-added hook entries in agentStop/sessionEnd while refreshing brainkit entries", () => {
    const existing = {
      hooks: {
        agentStop: [
          { command: "user-script.sh", description: "my hook" },
          { command: "node /old/path.js", description: "brainkit: stale entry" },
        ],
        sessionEnd: [{ command: "another-user-script.sh", description: "another user hook" }],
        sessionStart: [{ command: "user-start.sh", description: "user start hook" }],
      },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as {
      agentStop: { command: string; description: string }[];
      sessionEnd: { command: string; description: string }[];
      sessionStart: { command: string; description: string }[];
    };
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user-script.sh", description: "my hook" });
    expect(hooks.agentStop[1]?.description).toBe("brainkit: auto-commit on agent stop");
    expect(hooks.sessionEnd).toHaveLength(2);
    expect(hooks.sessionEnd[0]).toEqual({ command: "another-user-script.sh", description: "another user hook" });
    expect(hooks.sessionEnd[1]?.description).toBe("brainkit: auto-commit on session end");
    expect(hooks.sessionStart).toEqual([{ command: "user-start.sh", description: "user start hook" }]);
  });

  it("idempotent: merging brainkit-owned content twice produces the same result", () => {
    const once = mergeCopilotSettings(null, brainkitOwned);
    const twice = mergeCopilotSettings(once, brainkitOwned);
    expect(twice).toEqual(once);
    const hooks = twice["hooks"] as { agentStop: unknown[]; sessionEnd: unknown[] };
    expect(hooks.agentStop).toHaveLength(1);
    expect(hooks.sessionEnd).toHaveLength(1);
  });

  it("strips legacy unprefixed brainkit hook descriptions (upgrade safety, no duplicate auto-commits)", () => {
    const existing = {
      hooks: {
        agentStop: [
          { command: "node /old/auto-commit.js", description: "Auto-commit vault changes after agent turns" },
          { command: "user.sh", description: "my hook" },
        ],
        sessionEnd: [
          { command: "node /old/auto-commit.js", description: "Commit any remaining vault changes on session end" },
        ],
      },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as {
      agentStop: { command: string; description: string }[];
      sessionEnd: { command: string; description: string }[];
    };
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user.sh", description: "my hook" });
    expect(hooks.agentStop[1]?.description).toMatch(/^brainkit:/);
    expect(hooks.sessionEnd).toHaveLength(1);
    expect(hooks.sessionEnd[0]?.description).toMatch(/^brainkit:/);
  });

  it("produces canonical key order: non-brainkit keys first, then companyAnnouncements/statusLine/hooks", () => {
    const existing = {
      mcpServers: { foo: { command: "bar" } },
      theme: "dark",
      companyAnnouncements: ["stale"],
      hooks: { agentStop: [] },
      statusLine: { command: "old" },
      anotherUserKey: "value",
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const keys = Object.keys(result);
    expect(keys.slice(0, 3)).toEqual(["mcpServers", "theme", "anotherUserKey"]);
    expect(keys.slice(3)).toEqual(["companyAnnouncements", "statusLine", "hooks"]);
  });

  it("hook entry without description (user added bare entry) is preserved", () => {
    const existing = { hooks: { agentStop: [{ command: "user.sh" }] } };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as { agentStop: { command: string; description?: string }[] };
    expect(hooks.agentStop).toHaveLength(2);
    expect(hooks.agentStop[0]).toEqual({ command: "user.sh" });
    expect(hooks.agentStop[1]?.description).toBe("brainkit: auto-commit on agent stop");
  });

  it("existing hooks key with non-array event values (malformed) → brainkit overwrites that event", () => {
    const existing = { hooks: { agentStop: "not an array" as unknown } };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as { agentStop: { description: string }[] };
    expect(Array.isArray(hooks.agentStop)).toBe(true);
    expect(hooks.agentStop).toHaveLength(1);
    expect(hooks.agentStop[0]?.description).toBe("brainkit: auto-commit on agent stop");
  });

  it("preserves non-object entries in user hook arrays (does not crash)", () => {
    const existing = {
      hooks: {
        agentStop: [null, "string-entry", 42, { command: "user.sh", description: "my hook" }],
      },
    };
    const result = mergeCopilotSettings(existing, brainkitOwned);
    const hooks = result["hooks"] as { agentStop: unknown[] };
    // Garbage entries preserved (don't destroy user data); brainkit entry appended.
    expect(hooks.agentStop).toHaveLength(5);
    expect(hooks.agentStop[0]).toBeNull();
    expect(hooks.agentStop[1]).toBe("string-entry");
    expect(hooks.agentStop[2]).toBe(42);
    expect(hooks.agentStop[3]).toEqual({ command: "user.sh", description: "my hook" });
    expect((hooks.agentStop[4] as { description: string }).description).toMatch(/^brainkit:/);
  });

  it("empty brainkit-owned hook array strips brainkit entries while preserving user entries", () => {
    const existing = {
      hooks: {
        agentStop: [
          { command: "user.sh", description: "my hook" },
          { command: "node /old/auto-commit.js", description: "brainkit: stale" },
        ],
      },
    };
    const emptyBrainkit = { ...brainkitOwned, hooks: { agentStop: [] } };
    const result = mergeCopilotSettings(existing, emptyBrainkit);
    const hooks = result["hooks"] as { agentStop: { command: string; description: string }[] };
    expect(hooks.agentStop).toHaveLength(1);
    expect(hooks.agentStop[0]).toEqual({ command: "user.sh", description: "my hook" });
  });

  it("preserves __proto__ as an own property (does not mutate prototype slot)", () => {
    // JSON.parse keeps __proto__ as an own enumerable property. Naive bracket
    // assignment to a plain {} would set the prototype slot instead of an own
    // property, silently losing the key. Object.create(null) prevents this.
    const existing = JSON.parse('{"__proto__": {"polluted": true}, "user": "key"}') as Record<string, unknown>;
    const result = mergeCopilotSettings(existing, brainkitOwned);
    // The __proto__ key should be preserved as an own property in the output.
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(true);
    // And it must not have polluted Object.prototype.
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    // User key still preserved.
    expect(result["user"]).toBe("key");
  });
});
