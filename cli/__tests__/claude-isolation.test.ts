/**
 * Dedicated isolation tests for `cli/claude.ts`.
 *
 * Enforces the non-negotiable guarantees from AGENTS.md § Harness Config
 * Isolation:
 *
 *   1. brainkit must NEVER read or write under `~/.claude/` — that is the
 *      user's own Claude Code config directory and must remain pristine.
 *   2. brainkit must NEVER write under `<pkgRoot>/claude/` — it is the
 *      read-only template that ships in the npm package and lives inside
 *      `node_modules` (or worse, a sudo-installed global) at runtime.
 *
 * The basic versions of these assertions live in `claude.test.ts`; this file
 * adds the rigorous variants (full byte-identical sha256 snapshots, exhaustive
 * staging-dir layout checks, cross-platform path joins, no real claude spawn).
 *
 * If these tests start failing, do NOT relax them. The fix belongs in
 * `cli/claude.ts` (see AGENTS.md § Harness Config Isolation). Any seemingly
 * "harmless" read of `~/.claude/` (even an `fs.statSync` to detect a default)
 * is a violation: a future contributor will follow the precedent and turn it
 * into a write.
 *
 * Scope note: these tests cover the *launch* path (vault configured). The
 * onboarding path (no vault) intentionally does NOT set `CLAUDE_CONFIG_DIR`
 * — Claude must use its defaults so the user can authenticate the first time
 * before running brainkit again under isolation. That behavior is verified in
 * `claude.test.ts` (the onboarding tests assert no `CLAUDE_CONFIG_DIR` in env).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

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

import { launchClaude, MIN_CLAUDE_VERSION } from "../claude.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISOLATION_RULE_REF = "See AGENTS.md § Harness Config Isolation.";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-claude-iso-${prefix}-`));
}

function stageFreshVault(vaultPath: string): void {
  fs.writeFileSync(path.join(vaultPath, "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\n', "utf-8");
}

/**
 * Build a fake `<pkgRoot>/claude/` template tree mirroring the real layout
 * (.claude-plugin/, hooks/, scripts/, skills/doctor/). This is the read-only
 * template that brainkit must never modify at runtime.
 *
 * Also stages a `pkgRoot/skills/` source tree so the (mocked) skill installer
 * has a real source dir to point at — matching what `cli/claude.ts` looks for.
 */
function stagePackageRoot(pkgRoot: string): void {
  const claudeDir = path.join(pkgRoot, "claude");
  fs.mkdirSync(path.join(claudeDir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, ".claude-plugin", "plugin.json"),
    '{"name":"brainkit","version":"test"}\n',
    "utf-8",
  );
  fs.mkdirSync(path.join(claudeDir, "hooks"), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "hooks", "hooks.json"), '{"hooks":[]}\n', "utf-8");
  fs.mkdirSync(path.join(claudeDir, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, "scripts", "statusline.mjs"), "#!/usr/bin/env node\n// statusline\n", "utf-8");
  fs.writeFileSync(
    path.join(claudeDir, "scripts", "auto-commit.mjs"),
    "#!/usr/bin/env node\n// auto-commit\n",
    "utf-8",
  );
  fs.writeFileSync(path.join(claudeDir, "scripts", "precompact.mjs"), "#!/usr/bin/env node\n// precompact\n", "utf-8");
  // exec bits on Unix — mirrors how `fs.cpSync` preserves mode
  if (process.platform !== "win32") {
    fs.chmodSync(path.join(claudeDir, "scripts", "statusline.mjs"), 0o755);
    fs.chmodSync(path.join(claudeDir, "scripts", "auto-commit.mjs"), 0o755);
    fs.chmodSync(path.join(claudeDir, "scripts", "precompact.mjs"), 0o755);
  }
  fs.mkdirSync(path.join(claudeDir, "skills", "doctor"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, "skills", "doctor", "SKILL.md"),
    "---\nname: doctor\ndescription: Run health checks.\ndisable-model-invocation: true\n---\n\n# Doctor\n",
    "utf-8",
  );
  // Source skills tree (separate from claude template) for the installer.
  fs.mkdirSync(path.join(pkgRoot, "skills", "brainkit"), { recursive: true });
  fs.writeFileSync(
    path.join(pkgRoot, "skills", "brainkit", "SKILL.md"),
    "---\ndescription: Core brainkit skill\n---\n\n# Brainkit\n",
    "utf-8",
  );
}

/**
 * Recursively walk `root` and return a Map of relative-path → sha256 hex
 * digest. Includes file mode bits on Unix to catch chmod regressions on the
 * read-only template (e.g. accidental clearing of exec bits on script files).
 *
 * Uses `path.sep` internally but normalizes keys to forward slashes so
 * comparisons across platforms (and snapshot diffs) are stable.
 */
function snapshotTree(root: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(root)) return result;
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const buf = fs.readFileSync(full);
        const hash = createHash("sha256").update(buf).digest("hex");
        // Embed mode bits (Unix only) so chmod-only mutations are also caught.
        const mode = process.platform === "win32" ? "" : `:${(fs.statSync(full).mode & 0o777).toString(8)}`;
        result.set(rel, `${hash}${mode}`);
      }
    }
  };
  walk(root);
  return result;
}

interface MockRestorable {
  mockRestore: () => void;
}
let exitSpy: MockRestorable | null = null;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;
let fakeHome: string;
let vault: string;

beforeEach(() => {
  hoisted.state.configDir = makeTempDir("config");
  hoisted.state.packageRoot = makeTempDir("pkgroot");
  stagePackageRoot(hoisted.state.packageRoot);

  fakeHome = makeTempDir("fake-home");
  // Note: we deliberately do NOT create `<fakeHome>/.claude/`. If brainkit
  // attempts an `fs.statSync` / `fs.readFileSync` on it, the test surfaces
  // it via the no-error invariant in test 1 below.
  originalHome = process.env["HOME"];
  originalUserProfile = process.env["USERPROFILE"];
  process.env["HOME"] = fakeHome;
  // os.homedir() on Windows reads USERPROFILE; mirror it so cross-platform.
  process.env["USERPROFILE"] = fakeHome;

  vault = makeTempDir("vault");
  stageFreshVault(vault);

  vi.clearAllMocks();

  // Real-fs writes in the skill installer mock so existence checks reflect
  // what would actually be on disk after a real install.
  hoisted.mockInstallSkillsCore.mockImplementation(({ targetDir }: { targetDir: string }) => {
    fs.mkdirSync(path.join(targetDir, "brainkit"), { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, "brainkit", "SKILL.md"),
      "---\nname: brainkit\ndisable-model-invocation: false\n---\n# Brainkit\n",
      "utf-8",
    );
    return { installed: true, version: "test" };
  });

  // claude --version returns a known-good version; tests that need otherwise
  // override locally. Note the mock is on `node:child_process.execFileSync`
  // so the real binary is never invoked.
  hoisted.mockExecFileSync.mockImplementation((cmd: string) => {
    if (cmd === "claude") return Buffer.from(`${MIN_CLAUDE_VERSION} (Claude Code)\n`);
    return Buffer.from("");
  });

  // spawnHarness is mocked so launchClaude returns synchronously without
  // actually spawning `claude`. The mocked child has an `on('exit', ...)`
  // handler attached by launchClaude — process.exit is shimmed below to
  // throw rather than terminate the test runner.
  hoisted.mockSpawnHarness.mockImplementation(() => ({ on: vi.fn() }));
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${String(code)})`);
  });
});

afterEach(() => {
  fs.rmSync(hoisted.state.configDir, { recursive: true, force: true });
  fs.rmSync(hoisted.state.packageRoot, { recursive: true, force: true });
  fs.rmSync(fakeHome, { recursive: true, force: true });
  fs.rmSync(vault, { recursive: true, force: true });
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalUserProfile !== undefined) process.env["USERPROFILE"] = originalUserProfile;
  else delete process.env["USERPROFILE"];
  if (exitSpy !== null) exitSpy.mockRestore();
  exitSpy = null;
});

const claudeConfigDir = (): string => path.join(hoisted.state.configDir, "claude");
const stagingDir = (): string => path.join(claudeConfigDir(), "plugin");

// ---------------------------------------------------------------------------
// Test 1: ~/.claude/ is never created OR read
// ---------------------------------------------------------------------------

describe("isolation: user's ~/.claude/ is untouched", () => {
  it("never creates or modifies any file under ~/.claude/ during launch setup", () => {
    // Pre-condition: fakeHome has NO .claude/ dir at all. Any read attempt
    // by brainkit would either silently succeed (bad — means it's reading
    // user state) or throw ENOENT inside a try/catch (bad — means it's
    // probing user state). Even probing is a violation per AGENTS.md.
    const userClaudeDir = path.join(fakeHome, ".claude");
    expect(fs.existsSync(userClaudeDir)).toBe(false);

    launchClaude([], { mode: "single", vaultPath: vault });

    // Post-condition: still no .claude/ under the fake HOME. Throw with an
    // explicit message before the bare `expect` so failure output is actionable.
    if (fs.existsSync(userClaudeDir)) {
      throw new Error(
        `brainkit must never read or write under ~/.claude/. Found unexpected entry at ${userClaudeDir}. ${ISOLATION_RULE_REF}`,
      );
    }
    expect(fs.existsSync(userClaudeDir)).toBe(false);

    // And brainkit's isolated config dir DID get populated.
    expect(fs.existsSync(path.join(claudeConfigDir(), "settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(claudeConfigDir(), "system-prompt.txt"))).toBe(true);
  });

  it("never sets CLAUDE_CONFIG_DIR to anything inside ~/.claude/", () => {
    launchClaude([], { mode: "single", vaultPath: vault });
    const callArgs = hoisted.mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    const dir = callArgs[2].env["CLAUDE_CONFIG_DIR"];
    expect(dir).toBeDefined();
    if (dir === undefined) return;
    const userClaudeDir = path.join(fakeHome, ".claude");
    // Normalize both paths to handle trailing-separator variance.
    const normalize = (p: string): string => path.resolve(p);
    if (normalize(dir).startsWith(normalize(userClaudeDir) + path.sep) || normalize(dir) === normalize(userClaudeDir)) {
      throw new Error(
        `CLAUDE_CONFIG_DIR (${dir}) must not point inside ~/.claude/ (${userClaudeDir}). ${ISOLATION_RULE_REF}`,
      );
    }
    // Positive: it points inside brainkit's own config dir.
    expect(normalize(dir)).toBe(normalize(claudeConfigDir()));
  });
});

// ---------------------------------------------------------------------------
// Test 2: <pkgRoot>/claude/ is byte-identical before and after launch setup
// ---------------------------------------------------------------------------

describe("isolation: <pkgRoot>/claude/ is read-only at runtime", () => {
  it("snapshot of the staged plugin template is byte-identical (sha256 + mode) after launch", () => {
    const pkgClaudeDir = path.join(hoisted.state.packageRoot, "claude");
    const before = snapshotTree(pkgClaudeDir);
    expect(before.size).toBeGreaterThan(0);

    launchClaude([], { mode: "single", vaultPath: vault });

    const after = snapshotTree(pkgClaudeDir);

    // Compute symmetric diff with explicit, actionable failure message.
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];
    for (const [rel, hash] of after) {
      const prev = before.get(rel);
      if (prev === undefined) added.push(rel);
      else if (prev !== hash) modified.push(rel);
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) removed.push(rel);
    }

    if (added.length > 0 || removed.length > 0 || modified.length > 0) {
      throw new Error(
        `brainkit must never write to <pkgRoot>/claude/ — it is read-only at runtime ` +
          `(lives inside node_modules for npm installs, may be sudo-owned for global installs).\n` +
          `Detected mutations:\n` +
          (added.length > 0 ? `  added:    ${added.join(", ")}\n` : "") +
          (removed.length > 0 ? `  removed:  ${removed.join(", ")}\n` : "") +
          (modified.length > 0 ? `  modified: ${modified.join(", ")}\n` : "") +
          `All writes must target the staging dir under $CONFIG_DIR/claude/plugin/. ${ISOLATION_RULE_REF}`,
      );
    }

    // Equivalent assertion for the test reporter (passes after the explicit throw above).
    expect(after).toEqual(before);
  });

  it("snapshot of the source skills tree at <pkgRoot>/skills/ is also untouched", () => {
    // The skill installer writes into staging, never back into the source.
    const pkgSkillsDir = path.join(hoisted.state.packageRoot, "skills");
    const before = snapshotTree(pkgSkillsDir);
    expect(before.size).toBeGreaterThan(0);

    launchClaude([], { mode: "single", vaultPath: vault });

    const after = snapshotTree(pkgSkillsDir);
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Staging dir layout under $CONFIG_DIR/claude/
// ---------------------------------------------------------------------------

describe("staging layout: $CONFIG_DIR/claude/ contains all expected artifacts", () => {
  it("populates the staging dir with the full plugin tree + harness config", () => {
    launchClaude([], { mode: "single", vaultPath: vault });

    const stage = stagingDir();
    const cfg = claudeConfigDir();

    // Files inside the plugin staging dir (consumed by --plugin-dir).
    const pluginFiles = [
      path.join(".claude-plugin", "plugin.json"),
      path.join("skills", "doctor", "SKILL.md"), // hand-authored, preserved by cp
      path.join("skills", "brainkit", "SKILL.md"), // generated by skill installer
      path.join("hooks", "hooks.json"),
      path.join("scripts", "auto-commit.mjs"),
      path.join("scripts", "precompact.mjs"),
      path.join("scripts", "statusline.mjs"),
      ".brainkit-version",
    ];
    for (const rel of pluginFiles) {
      const abs = path.join(stage, rel);
      if (!fs.existsSync(abs)) {
        throw new Error(`expected staged plugin file missing: ${rel} (looked under ${stage})`);
      }
    }

    // Harness config files OUTSIDE the plugin/ subdir but inside claude/.
    const harnessFiles = ["settings.json", "system-prompt.txt", path.join("themes", "brainkit.json")];
    for (const rel of harnessFiles) {
      const abs = path.join(cfg, rel);
      if (!fs.existsSync(abs)) {
        throw new Error(`expected harness config file missing: ${rel} (looked under ${cfg})`);
      }
    }

    // Sanity: harness files must NOT be nested inside plugin/ (common mistake
    // — Claude looks for settings.json at $CLAUDE_CONFIG_DIR root, not inside
    // the plugin dir).
    expect(fs.existsSync(path.join(stage, "settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(stage, "system-prompt.txt"))).toBe(false);
  });

  it("script files retain exec bits on Unix (cpSync should preserve mode)", () => {
    if (process.platform === "win32") return; // exec bit meaningless on Windows
    launchClaude([], { mode: "single", vaultPath: vault });
    for (const script of ["auto-commit.mjs", "precompact.mjs", "statusline.mjs"]) {
      const mode = fs.statSync(path.join(stagingDir(), "scripts", script)).mode & 0o111;
      expect(mode).not.toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 4: Cross-platform path handling sanity
// ---------------------------------------------------------------------------

describe("cross-platform: assertions use path.join (no hardcoded slashes)", () => {
  it("statusline command in settings.json uses forward slashes regardless of platform", () => {
    launchClaude([], { mode: "single", vaultPath: vault });
    const settings = JSON.parse(fs.readFileSync(path.join(claudeConfigDir(), "settings.json"), "utf-8")) as {
      statusLine: { command: string };
    };
    // The command path is normalized to forward slashes by claude.ts so the
    // generated settings.json is portable across platforms.
    expect(settings.statusLine.command).not.toContain("\\");
    expect(settings.statusLine.command).toContain("statusline.mjs");
  });

  it("CLAUDE_CONFIG_DIR env value is a valid platform-native absolute path", () => {
    launchClaude([], { mode: "single", vaultPath: vault });
    const callArgs = hoisted.mockSpawnHarness.mock.calls[0] as unknown as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    const dir = callArgs[2].env["CLAUDE_CONFIG_DIR"];
    expect(dir).toBeDefined();
    if (dir === undefined) return;
    expect(path.isAbsolute(dir)).toBe(true);
  });
});
