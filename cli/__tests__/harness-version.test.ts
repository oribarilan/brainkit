import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Pure function tests (no mocks needed)
// ---------------------------------------------------------------------------

import { isOlderThan, shouldCheckVersion, writeVersionMarker } from "../harness-version.js";

describe("isOlderThan", () => {
  it("returns true when major is lower", () => {
    expect(isOlderThan("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns true when minor is lower", () => {
    expect(isOlderThan("1.2.0", "1.3.0")).toBe(true);
  });

  it("returns true when patch is lower", () => {
    expect(isOlderThan("1.2.3", "1.2.4")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isOlderThan("1.2.3", "1.2.3")).toBe(false);
  });

  it("returns false when installed is newer", () => {
    expect(isOlderThan("2.0.0", "1.9.9")).toBe(false);
  });

  it("returns false when installed minor is higher", () => {
    expect(isOlderThan("1.5.0", "1.4.9")).toBe(false);
  });

  it("strips pre-release suffix before comparing", () => {
    // 1.2.3-beta.1 → 1.2.3, which IS older than 1.2.4
    expect(isOlderThan("1.2.3-beta.1", "1.2.4")).toBe(true);
    // 1.2.4-beta.1 → 1.2.4, which is NOT older than 1.2.4
    expect(isOlderThan("1.2.4-beta.1", "1.2.4")).toBe(false);
  });

  it("returns false for unparseable versions (safe fallback)", () => {
    expect(isOlderThan("abc", "1.2.3")).toBe(false);
    expect(isOlderThan("1.2.3", "abc")).toBe(false);
  });
});

describe("shouldCheckVersion", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns true when marker file does not exist", () => {
    expect(shouldCheckVersion(tempDir, "1.0.0")).toBe(true);
  });

  it("returns false when marker matches current version", () => {
    writeVersionMarker(tempDir, "1.0.0");
    expect(shouldCheckVersion(tempDir, "1.0.0")).toBe(false);
  });

  it("returns true when marker differs from current version", () => {
    writeVersionMarker(tempDir, "0.9.0");
    expect(shouldCheckVersion(tempDir, "1.0.0")).toBe(true);
  });
});

describe("writeVersionMarker", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates the marker file with version content", () => {
    writeVersionMarker(tempDir, "1.2.3");
    const content = fs.readFileSync(path.join(tempDir, "last-brainkit-version"), "utf-8").trim();
    expect(content).toBe("1.2.3");
  });

  it("creates parent directories if needed", () => {
    const nested = path.join(tempDir, "nested", "dir");
    writeVersionMarker(nested, "1.0.0");
    expect(fs.existsSync(path.join(nested, "last-brainkit-version"))).toBe(true);
  });

  it("overwrites existing marker", () => {
    writeVersionMarker(tempDir, "1.0.0");
    writeVersionMarker(tempDir, "2.0.0");
    const content = fs.readFileSync(path.join(tempDir, "last-brainkit-version"), "utf-8").trim();
    expect(content).toBe("2.0.0");
  });
});

// ---------------------------------------------------------------------------
// maybeCheckHarnessVersion — mocked integration tests
// ---------------------------------------------------------------------------

// Must mock modules BEFORE importing maybeCheckHarnessVersion
vi.mock("../../core/index.js", () => ({
  getConfigDir: vi.fn(),
}));

vi.mock("../version.js", () => ({
  version: "1.0.0",
}));

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
}));

import { getConfigDir } from "../../core/index.js";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import { maybeCheckHarnessVersion } from "../harness-version.js";

const mockGetConfigDir = vi.mocked(getConfigDir);
const mockExecFileSync = vi.mocked(execFileSync);
const mockConfirm = vi.mocked(p.confirm);
const mockIsCancel = vi.mocked(p.isCancel);

describe("maybeCheckHarnessVersion", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-test-"));
    mockGetConfigDir.mockReturnValue(tempDir);
    mockIsCancel.mockReturnValue(false);

    // Default: TTY
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("skips when marker matches brainkit version", async () => {
    // Write marker with current version (mocked as "1.0.0")
    writeVersionMarker(tempDir, "1.0.0");

    await maybeCheckHarnessVersion("OpenCode");

    // Should not have called execFileSync for version checks
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("skips in non-TTY mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    await maybeCheckHarnessVersion("OpenCode");

    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("skips for unknown harness name", async () => {
    await maybeCheckHarnessVersion("UnknownHarness");

    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("skips silently when installed version check fails", async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("command not found");
    });

    await maybeCheckHarnessVersion("OpenCode");

    // Should not have written marker (will retry next time)
    expect(fs.existsSync(path.join(tempDir, "last-brainkit-version"))).toBe(false);
  });

  it("skips silently when npm version check fails", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      // Return version for harness binary
      if (cmd === "opencode") return Buffer.from("1.14.0\n");
      // Fail for npm
      throw new Error("network error");
    });

    await maybeCheckHarnessVersion("OpenCode");

    // Should not have written marker (will retry next time)
    expect(fs.existsSync(path.join(tempDir, "last-brainkit-version"))).toBe(false);
  });

  it("writes marker and returns silently when harness is up to date", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode") return Buffer.from("1.15.0\n");
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      throw new Error("unexpected");
    });

    await maybeCheckHarnessVersion("OpenCode");

    // Should have written marker
    const marker = fs.readFileSync(path.join(tempDir, "last-brainkit-version"), "utf-8").trim();
    expect(marker).toBe("1.0.0");

    // Should NOT have shown confirm
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("shows confirm when harness is outdated", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode") return Buffer.from("1.14.0\n");
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      throw new Error("unexpected");
    });
    mockConfirm.mockResolvedValue(false);

    await maybeCheckHarnessVersion("OpenCode");

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1.14.0") as string,
      }),
    );
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1.15.0") as string,
      }),
    );
  });

  it("continues normally when user declines update", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode") return Buffer.from("1.14.0\n");
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      throw new Error("unexpected");
    });
    mockConfirm.mockResolvedValue(false);

    // Should not throw or exit
    await maybeCheckHarnessVersion("OpenCode");

    // Marker should still be written
    const marker = fs.readFileSync(path.join(tempDir, "last-brainkit-version"), "utf-8").trim();
    expect(marker).toBe("1.0.0");
  });

  it("prints update command and exits when user confirms", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode") return Buffer.from("1.14.0\n");
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      throw new Error("unexpected");
    });
    mockConfirm.mockResolvedValue(true);

    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(maybeCheckHarnessVersion("OpenCode")).rejects.toThrow("process.exit");

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("opencode upgrade"));
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("continues when user cancels the confirm prompt", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode") return Buffer.from("1.14.0\n");
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      throw new Error("unexpected");
    });
    mockConfirm.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    // Should not throw or exit
    await maybeCheckHarnessVersion("OpenCode");
  });

  it("parses Copilot CLI version from descriptive output", async () => {
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "copilot") return Buffer.from("GitHub Copilot CLI 1.2.3\n");
      if (cmd === "npm") return Buffer.from("1.3.0\n");
      throw new Error("unexpected");
    });
    mockConfirm.mockResolvedValue(false);

    await maybeCheckHarnessVersion("Copilot CLI");

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("1.2.3") as string,
      }),
    );
  });

  it("works for both OpenCode and Copilot CLI harnesses", async () => {
    // Test that both harness names are recognized
    mockExecFileSync.mockImplementation((cmd) => {
      if (cmd === "opencode" || cmd === "copilot") return Buffer.from("1.0.0\n");
      if (cmd === "npm") return Buffer.from("1.0.0\n");
      throw new Error("unexpected");
    });

    // Neither should throw
    await maybeCheckHarnessVersion("OpenCode");

    // Reset marker for second call
    fs.unlinkSync(path.join(tempDir, "last-brainkit-version"));

    await maybeCheckHarnessVersion("Copilot CLI");
  });
});
