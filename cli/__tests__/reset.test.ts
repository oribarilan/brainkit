import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mocks (declared before importing the module under test)
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  state: { configDir: "" },
  mockConfirm: vi.fn(),
  mockIsCancel: vi.fn((_v?: unknown) => false),
  mockLog: { success: vi.fn() },
  mockIntro: vi.fn(),
  mockOutro: vi.fn(),
  mockNote: vi.fn(),
  mockCancel: vi.fn(),
}));

vi.mock("../../core/index.js", () => ({
  getConfigDir: vi.fn(() => hoisted.state.configDir),
}));

vi.mock("@clack/prompts", () => ({
  intro: hoisted.mockIntro,
  outro: hoisted.mockOutro,
  note: hoisted.mockNote,
  cancel: hoisted.mockCancel,
  confirm: hoisted.mockConfirm,
  isCancel: hoisted.mockIsCancel,
  log: hoisted.mockLog,
}));

import { resetBrainkitConfig, factoryReset } from "../reset.js";
import { getConfigDir } from "../../core/index.js";

const mockGetConfigDir = vi.mocked(getConfigDir);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `brainkit-reset-${prefix}-`));
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

function seedConfigDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.toml"), 'version = 1\nbrain_path = "/x"\n', "utf-8");
  fs.writeFileSync(path.join(dir, "opencode.json"), "{}\n", "utf-8");
  fs.writeFileSync(path.join(dir, "tui.json"), "{}\n", "utf-8");
  const copilot = path.join(dir, "copilot");
  fs.mkdirSync(copilot, { recursive: true });
  fs.writeFileSync(path.join(copilot, "settings.json"), "{}\n", "utf-8");
  fs.writeFileSync(path.join(copilot, "auth.json"), '{"token":"secret"}\n', "utf-8");
  const onboarding = path.join(dir, "onboarding");
  fs.mkdirSync(onboarding, { recursive: true });
  fs.writeFileSync(path.join(onboarding, "AGENTS.md"), "# prompt\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resetBrainkitConfig", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = makeTempDir("config");
    hoisted.state.configDir = configDir;
    seedConfigDir(configDir);
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("removes the entire config dir including all brainkit-managed files", () => {
    expect(listAllFiles(configDir).length).toBeGreaterThan(0);

    resetBrainkitConfig();

    expect(fs.existsSync(configDir)).toBe(false);
  });

  it("leaves sibling directories untouched", () => {
    // Simulate the user's global harness configs and a vault sitting outside
    // the brainkit config dir. None of these should be touched.
    const fakeHome = path.dirname(configDir);
    const fakeOpencode = path.join(fakeHome, `oc-${path.basename(configDir)}`);
    const fakeCopilot = path.join(fakeHome, `cp-${path.basename(configDir)}`);
    const fakeVault = path.join(fakeHome, `vault-${path.basename(configDir)}`);

    fs.mkdirSync(fakeOpencode, { recursive: true });
    fs.writeFileSync(path.join(fakeOpencode, "config.json"), "user-data\n", "utf-8");
    fs.mkdirSync(fakeCopilot, { recursive: true });
    fs.writeFileSync(path.join(fakeCopilot, "settings.json"), "user-data\n", "utf-8");
    fs.mkdirSync(fakeVault, { recursive: true });
    fs.writeFileSync(path.join(fakeVault, "brainkit.toml"), "version = 1\n", "utf-8");

    try {
      resetBrainkitConfig();

      expect(fs.readFileSync(path.join(fakeOpencode, "config.json"), "utf-8")).toBe("user-data\n");
      expect(fs.readFileSync(path.join(fakeCopilot, "settings.json"), "utf-8")).toBe("user-data\n");
      expect(fs.readFileSync(path.join(fakeVault, "brainkit.toml"), "utf-8")).toBe("version = 1\n");
    } finally {
      fs.rmSync(fakeOpencode, { recursive: true, force: true });
      fs.rmSync(fakeCopilot, { recursive: true, force: true });
      fs.rmSync(fakeVault, { recursive: true, force: true });
    }
  });

  it("is a no-op when the config dir does not exist", () => {
    fs.rmSync(configDir, { recursive: true, force: true });

    expect(() => {
      resetBrainkitConfig();
    }).not.toThrow();
    expect(fs.existsSync(configDir)).toBe(false);
  });
});

describe("resetBrainkitConfig — safety guard", () => {
  it("refuses to delete the user's home directory", () => {
    mockGetConfigDir.mockReturnValueOnce(os.homedir());

    expect(() => {
      resetBrainkitConfig();
    }).toThrow(/home directory/i);
    // Home still exists.
    expect(fs.existsSync(os.homedir())).toBe(true);
  });

  it("refuses to delete the filesystem root", () => {
    const root = path.parse(os.homedir()).root;
    mockGetConfigDir.mockReturnValueOnce(root);

    expect(() => {
      resetBrainkitConfig();
    }).toThrow(/filesystem root|home directory/i);
    expect(fs.existsSync(root)).toBe(true);
  });

  it("refuses to delete when getConfigDir returns empty string", () => {
    mockGetConfigDir.mockReturnValueOnce("");

    expect(() => {
      resetBrainkitConfig();
    }).toThrow(/empty/i);
  });
});

// ---------------------------------------------------------------------------
// factoryReset — orchestration (prompt, confirm, helper, exit codes)
// ---------------------------------------------------------------------------

describe("factoryReset", () => {
  let configDir: string;
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    configDir = makeTempDir("orchestration");
    hoisted.state.configDir = configDir;
    seedConfigDir(configDir);
    hoisted.mockConfirm.mockReset();
    hoisted.mockIsCancel.mockReset().mockReturnValue(false);
    hoisted.mockIntro.mockReset();
    hoisted.mockOutro.mockReset();
    hoisted.mockNote.mockReset();
    hoisted.mockCancel.mockReset();
    hoisted.mockLog.success.mockReset();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit(${String(code)})`);
    });
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    exitSpy.mockRestore();
  });

  it("wipes the config dir and reports success when user confirms", async () => {
    hoisted.mockConfirm.mockResolvedValue(true);

    await factoryReset();

    expect(fs.existsSync(configDir)).toBe(false);
    expect(hoisted.mockLog.success).toHaveBeenCalledWith(expect.stringMatching(/removed/i));
    expect(hoisted.mockOutro).toHaveBeenCalled();
    expect(hoisted.mockCancel).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("shows the user what will be removed before confirming", async () => {
    hoisted.mockConfirm.mockResolvedValue(true);

    await factoryReset();

    // The note must surface Copilot auth/history loss explicitly so the user
    // isn't blindsided by a re-auth flow.
    const noteText = hoisted.mockNote.mock.calls[0]?.[0] as string;
    expect(noteText).toMatch(/copilot.*auth/i);
    expect(noteText).toMatch(/vault/i);
    expect(noteText).toMatch(/does NOT touch.*vault/i);
  });

  it("exits 0 and leaves config intact when user declines", async () => {
    hoisted.mockConfirm.mockResolvedValue(false);

    await expect(factoryReset()).rejects.toThrow("process.exit(0)");

    expect(fs.existsSync(configDir)).toBe(true);
    expect(hoisted.mockCancel).toHaveBeenCalledWith(expect.stringMatching(/cancel/i));
    expect(hoisted.mockLog.success).not.toHaveBeenCalled();
  });

  it("exits 0 and leaves config intact when user cancels the prompt (Ctrl+C)", async () => {
    const cancelSentinel = Symbol("cancel");
    hoisted.mockConfirm.mockResolvedValue(cancelSentinel);
    hoisted.mockIsCancel.mockImplementation((v: unknown) => v === cancelSentinel);

    await expect(factoryReset()).rejects.toThrow("process.exit(0)");

    expect(fs.existsSync(configDir)).toBe(true);
  });

  it("exits 1 with the helper's error message when the safety guard fires", async () => {
    hoisted.mockConfirm.mockResolvedValue(true);
    mockGetConfigDir.mockReturnValueOnce(os.homedir());

    await expect(factoryReset()).rejects.toThrow("process.exit(1)");

    expect(hoisted.mockCancel).toHaveBeenCalledWith(expect.stringMatching(/home directory/i));
    // Original config dir untouched because the guard threw before rmSync.
    expect(fs.existsSync(configDir)).toBe(true);
  });
});
