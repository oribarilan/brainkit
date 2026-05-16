import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { buildOpenCodeConfig, buildOpenCodeTuiConfig, writeIfChanged, ensureLibrarianAgent } from "../launch.js";
import { buildLibrarianAgentFile } from "../../core/librarian-agent.js";
import { readVaultConfigSimple } from "../../core/index.js";

describe("buildOpenCodeConfig", () => {
  it("uses top-level permission: 'allow' during onboarding", () => {
    const cfg = buildOpenCodeConfig(true);
    expect(cfg["permission"]).toBe("allow");
    expect(cfg["agent"]).toBeUndefined();
  });

  it("omits permission when not onboarding", () => {
    const cfg = buildOpenCodeConfig(false);
    expect(cfg["permission"]).toBeUndefined();
    expect(cfg["agent"]).toBeUndefined();
  });

  it("always sets schema and plugin", () => {
    for (const onboarding of [true, false]) {
      const cfg = buildOpenCodeConfig(onboarding);
      expect(cfg["$schema"]).toBe("https://opencode.ai/config.json");
      expect(cfg["plugin"]).toEqual(["@2brain/brainkit"]);
    }
  });

  it("never nests a string permission under agent.<name> (regression)", () => {
    // Regression: prior versions wrote `agent.build.permission: "allow"`,
    // which OpenCode's schema rejects (nested permissions require an object).
    // The validator iterated the string character-by-character, producing
    // errors like: Expected PermissionActionConfig, got "a" / "l" / "l" / "o" / "w".
    const cfg = buildOpenCodeConfig(true);
    const agent = cfg["agent"] as Record<string, { permission?: unknown }> | undefined;
    if (agent) {
      for (const a of Object.values(agent)) {
        expect(typeof a.permission).not.toBe("string");
      }
    }
  });

  it("contains only brainkit-owned keys (no leak surface)", () => {
    // The brainkit-isolated opencode.json must be 100% brainkit-owned.
    // Per-user config (model, mcp, lsp, instructions) goes in
    // ~/.config/opencode/ and is merged by OpenCode at load time. If a new
    // top-level key sneaks in here, this test fails so we re-evaluate the
    // ownership contract before shipping it.
    const allowedKeys = new Set(["$schema", "plugin", "permission"]);
    for (const onboarding of [true, false]) {
      const cfg = buildOpenCodeConfig(onboarding);
      for (const key of Object.keys(cfg)) {
        expect(allowedKeys.has(key), `unexpected key in opencode.json: ${key}`).toBe(true);
      }
    }
  });
});

describe("buildOpenCodeTuiConfig", () => {
  it("contains schema and plugin entry", () => {
    const cfg = buildOpenCodeTuiConfig();
    expect(cfg["$schema"]).toBe("https://opencode.ai/tui.json");
    expect(cfg["plugin"]).toEqual(["@2brain/brainkit"]);
  });

  it("does not declare a theme (brainkit theme is dormant)", () => {
    // The brainkit theme is intentionally not installed in any harness right
    // now. If someone re-introduces a `theme` field here without also wiring
    // up the plugin to install it, the user will get a "theme not found"
    // error from OpenCode at startup. See opencode/tui.tsx for the full
    // reason. To re-enable: install the theme in the plugin AND add the
    // theme field back here, in the same change.
    const cfg = buildOpenCodeTuiConfig();
    expect(cfg["theme"]).toBeUndefined();
  });

  it("contains only brainkit-owned keys (no leak surface)", () => {
    // Same ownership contract as opencode.json.
    const allowedKeys = new Set(["$schema", "plugin"]);
    const cfg = buildOpenCodeTuiConfig();
    for (const key of Object.keys(cfg)) {
      expect(allowedKeys.has(key), `unexpected key in tui.json: ${key}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// writeIfChanged behavior
// ---------------------------------------------------------------------------

describe("writeIfChanged", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-write-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the file when it doesn't exist", () => {
    const filePath = path.join(tmpDir, "new.json");
    writeIfChanged(filePath, "hello\n");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello\n");
  });

  it("preserves mtime when content is unchanged across two calls", async () => {
    const filePath = path.join(tmpDir, "stable.json");
    const content = JSON.stringify(buildOpenCodeConfig(false), null, 2) + "\n";

    writeIfChanged(filePath, content);
    const mtime1 = fs.statSync(filePath).mtimeMs;

    // Wait long enough for mtime to register a change if a write happens.
    await new Promise((r) => setTimeout(r, 50));

    writeIfChanged(filePath, content);
    const mtime2 = fs.statSync(filePath).mtimeMs;

    expect(mtime2).toBe(mtime1);
  });

  it("rewrites the file when content differs", async () => {
    const filePath = path.join(tmpDir, "drift.json");

    writeIfChanged(filePath, "stale content\n");
    const mtime1 = fs.statSync(filePath).mtimeMs;

    await new Promise((r) => setTimeout(r, 50));

    const fresh = JSON.stringify(buildOpenCodeConfig(false), null, 2) + "\n";
    writeIfChanged(filePath, fresh);
    const mtime2 = fs.statSync(filePath).mtimeMs;

    expect(mtime2).toBeGreaterThan(mtime1);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(fresh);
  });
});

// ---------------------------------------------------------------------------
// ensureLibrarianAgent — functional tests with real filesystem
// ---------------------------------------------------------------------------

describe("ensureLibrarianAgent", () => {
  let configDir: string;
  let vaultDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-config-"));
    vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-vault-"));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(vaultDir, { recursive: true, force: true });
  });

  function writeVaultToml(content: string): void {
    fs.writeFileSync(path.join(vaultDir, "brainkit.toml"), content, "utf-8");
  }

  const minimalToml = ["version = 1", "", "[user]", 'name = "Test User"', 'role = "Engineer"'].join("\n");

  it("writes agents/librarian.md when vault has valid config", () => {
    writeVaultToml(minimalToml);
    ensureLibrarianAgent(configDir, vaultDir);

    const agentFile = path.join(configDir, "agents", "librarian.md");
    expect(fs.existsSync(agentFile)).toBe(true);

    const content = fs.readFileSync(agentFile, "utf-8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("mode: subagent");
    expect(content).toContain("Librarian");
    expect(content).toContain(vaultDir);
  });

  it("produces the same content as buildLibrarianAgentFile", () => {
    const tomlWithFeatures = [minimalToml, "", "[features]", "bragfile = true", "contacts = true"].join("\n");
    writeVaultToml(tomlWithFeatures);
    ensureLibrarianAgent(configDir, vaultDir);

    // Read what the launcher wrote
    const written = fs.readFileSync(path.join(configDir, "agents", "librarian.md"), "utf-8");

    // Build expected content directly from the builder
    const vaultConfig = readVaultConfigSimple(vaultDir);
    const expected = buildLibrarianAgentFile(vaultConfig, vaultDir);

    expect(written).toBe(expected);
  });

  it("does not write when vault has no brainkit.toml", () => {
    // vaultDir exists but has no brainkit.toml
    ensureLibrarianAgent(configDir, vaultDir);

    const agentsDir = path.join(configDir, "agents");
    expect(fs.existsSync(agentsDir)).toBe(false);
  });

  it("does not write when vault path does not exist", () => {
    const bogusPath = path.join(os.tmpdir(), `nonexistent-vault-${String(Date.now())}`);
    ensureLibrarianAgent(configDir, bogusPath);

    const agentsDir = path.join(configDir, "agents");
    expect(fs.existsSync(agentsDir)).toBe(false);
  });

  it("does not throw when brainkit.toml is malformed", () => {
    fs.writeFileSync(path.join(vaultDir, "brainkit.toml"), "{{not valid toml}}", "utf-8");
    // Should not throw — graceful degradation
    expect(() => {
      ensureLibrarianAgent(configDir, vaultDir);
    }).not.toThrow();

    const agentsDir = path.join(configDir, "agents");
    expect(fs.existsSync(agentsDir)).toBe(false);
  });

  it("preserves mtime on repeated calls with same config", async () => {
    writeVaultToml(minimalToml);

    ensureLibrarianAgent(configDir, vaultDir);
    const agentFile = path.join(configDir, "agents", "librarian.md");
    const mtime1 = fs.statSync(agentFile).mtimeMs;

    await new Promise((r) => setTimeout(r, 50));

    ensureLibrarianAgent(configDir, vaultDir);
    const mtime2 = fs.statSync(agentFile).mtimeMs;

    expect(mtime2).toBe(mtime1);
  });

  it("scopes external_directory permission to the vault path", () => {
    writeVaultToml(minimalToml);
    ensureLibrarianAgent(configDir, vaultDir);

    const content = fs.readFileSync(path.join(configDir, "agents", "librarian.md"), "utf-8");
    expect(content).toContain(`"${vaultDir}/**": allow`);
  });
});

// ---------------------------------------------------------------------------
// Source-level isolation contract — guards the spawned-env env var contract
// ---------------------------------------------------------------------------
//
// `launchOpenCode` is a side-effect-only function (spawns a child process),
// so we can't unit-test the spawned env directly without an integration test.
// Instead, we read the source and assert the four critical env vars appear in
// the env object brainkit hands to the child. This is brittle to formatting
// but precisely catches "someone removed an isolation env var" regressions.

describe("launchOpenCode isolation env contract (source-level)", () => {
  const launchSource = fs.readFileSync(new URL("../launch.ts", import.meta.url), "utf-8");

  it("sets OPENCODE_CONFIG on spawned env", () => {
    expect(launchSource).toMatch(/OPENCODE_CONFIG\s*:/);
  });

  it("sets OPENCODE_TUI_CONFIG on spawned env", () => {
    expect(launchSource).toMatch(/OPENCODE_TUI_CONFIG\s*:/);
  });

  it("sets OPENCODE_CONFIG_DIR on spawned env (blocks user dotfiles-dir leak)", () => {
    expect(launchSource).toMatch(/OPENCODE_CONFIG_DIR\s*:/);
  });

  it("sets OPENCODE_DISABLE_PROJECT_CONFIG on spawned env (blocks vault-parent walk leak)", () => {
    expect(launchSource).toMatch(/OPENCODE_DISABLE_PROJECT_CONFIG\s*:/);
  });
});

// ---------------------------------------------------------------------------
// Source-level librarian agent file contract
// ---------------------------------------------------------------------------

describe("launchOpenCode librarian agent file contract (source-level)", () => {
  const launchSource = fs.readFileSync(new URL("../launch.ts", import.meta.url), "utf-8");

  it("writes librarian.md to agents directory", () => {
    expect(launchSource).toMatch(/librarian\.md/);
  });

  it("uses writeIfChanged for the agent file", () => {
    expect(launchSource).toMatch(/writeIfChanged.*librarian/s);
  });

  it("creates agents directory with mkdirSync", () => {
    expect(launchSource).toMatch(/agents.*mkdirSync|mkdirSync.*agents/s);
  });

  it("reads vault config before writing agent file", () => {
    expect(launchSource).toMatch(/readVaultConfigSimple/);
  });

  it("gracefully handles missing vault config (try/catch)", () => {
    // The agent file writing must be wrapped in try/catch
    // so a bad brainkit.toml doesn't prevent OpenCode from launching
    expect(launchSource).toMatch(/try\s*\{[\s\S]*readVaultConfigSimple[\s\S]*librarian[\s\S]*catch/);
  });
});
