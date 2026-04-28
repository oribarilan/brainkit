import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Pure function tests (no mocks needed)
// ---------------------------------------------------------------------------

import { shouldCheckVersion, writeVersionMarker } from "../harness-version.js";

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

  it("runs update command when user confirms", async () => {
    const calls: Array<{ cmd: string; args: readonly string[] | undefined }> = [];
    mockExecFileSync.mockImplementation((cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "--version") {
        return Buffer.from("1.14.0\n");
      }
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "upgrade") {
        // Simulate successful update
        return Buffer.from("");
      }
      throw new Error(`unexpected: ${cmd} ${JSON.stringify(args)}`);
    });
    mockConfirm.mockResolvedValue(true);

    await maybeCheckHarnessVersion("OpenCode");

    // Should have invoked the update command directly
    const upgradeCall = calls.find((c) => c.cmd === "opencode" && Array.isArray(c.args) && c.args[0] === "upgrade");
    expect(upgradeCall).toBeDefined();
    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("opencode upgrade"));
    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining("OpenCode"));
  });

  it("logs error and continues when update command fails", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "--version") {
        return Buffer.from("1.14.0\n");
      }
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "upgrade") {
        throw new Error("upgrade failed");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    mockConfirm.mockResolvedValue(true);

    // Should not throw
    await maybeCheckHarnessVersion("OpenCode");

    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining("opencode upgrade"));
  });

  it("disables raw mode and pauses stdin before running update, restores after", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "--version") {
        return Buffer.from("1.14.0\n");
      }
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "upgrade") {
        return Buffer.from("");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    mockConfirm.mockResolvedValue(true);

    // Pretend stdin was in raw mode (clack does this between prompts).
    Object.defineProperty(process.stdin, "isRaw", { value: true, configurable: true });
    const setRawMode = vi.fn();
    const pause = vi.spyOn(process.stdin, "pause").mockImplementation(() => process.stdin);
    Object.defineProperty(process.stdin, "setRawMode", { value: setRawMode, configurable: true });

    await maybeCheckHarnessVersion("OpenCode");

    // Raw mode disabled before exec
    expect(setRawMode).toHaveBeenCalledWith(false);
    // Stdin paused before exec
    expect(pause).toHaveBeenCalled();
    // Raw mode restored to previous value after exec
    expect(setRawMode).toHaveBeenCalledWith(true);
  });

  it("attaches a stdin error listener that swallows EIO/EPIPE", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "--version") {
        return Buffer.from("1.14.0\n");
      }
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "upgrade") {
        return Buffer.from("");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    mockConfirm.mockResolvedValue(true);

    const onSpy = vi.spyOn(process.stdin, "on");

    await maybeCheckHarnessVersion("OpenCode");

    // Find the error listener we attached
    const errorCall = onSpy.mock.calls.find((c) => c[0] === "error");
    expect(errorCall).toBeDefined();
    const listener = errorCall?.[1] as ((err: NodeJS.ErrnoException) => void) | undefined;
    expect(listener).toBeDefined();

    // Should swallow EIO, EPIPE, ENOTCONN
    expect(() => listener?.({ code: "EIO" } as NodeJS.ErrnoException)).not.toThrow();
    expect(() => listener?.({ code: "EPIPE" } as NodeJS.ErrnoException)).not.toThrow();
    expect(() => listener?.({ code: "ENOTCONN" } as NodeJS.ErrnoException)).not.toThrow();

    // Should re-throw anything else
    expect(() => listener?.({ code: "EACCES", message: "denied" } as NodeJS.ErrnoException)).toThrow();

    // Cleanup
    if (listener) process.stdin.removeListener("error", listener);
  });

  it("still attaches stdin cleanup even when update command fails", async () => {
    mockExecFileSync.mockImplementation((cmd, args) => {
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "--version") {
        return Buffer.from("1.14.0\n");
      }
      if (cmd === "npm") return Buffer.from("1.15.0\n");
      if (cmd === "opencode" && Array.isArray(args) && args[0] === "upgrade") {
        throw new Error("upgrade failed");
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    mockConfirm.mockResolvedValue(true);

    const setRawMode = vi.fn();
    Object.defineProperty(process.stdin, "isRaw", { value: false, configurable: true });
    Object.defineProperty(process.stdin, "setRawMode", { value: setRawMode, configurable: true });

    // Should not throw
    await maybeCheckHarnessVersion("OpenCode");

    // setRawMode called for both pre-exec disable and post-exec restore
    expect(setRawMode).toHaveBeenCalledWith(false);
    expect(p.log.error).toHaveBeenCalledWith(expect.stringContaining("opencode upgrade"));
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
