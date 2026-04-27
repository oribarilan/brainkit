import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock child_process to capture spawn calls
// ---------------------------------------------------------------------------

const mockSpawn = vi.fn(() => ({ on: vi.fn() }));

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...(args as Parameters<typeof mockSpawn>)),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { spawnHarness } from "../spawn.js";

// ---------------------------------------------------------------------------
// Platform stubbing helpers
// ---------------------------------------------------------------------------

let originalPlatform: PropertyDescriptor | undefined;

function stubPlatform(value: string): void {
  originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value, configurable: true });
}

function restorePlatform(): void {
  if (originalPlatform) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSpawnArgs(): string[] {
  const call = mockSpawn.mock.calls[0];
  expect(call).toBeDefined();
  return (call as unknown[])[1] as string[];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("spawnHarness", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
  });

  afterEach(() => {
    restorePlatform();
  });

  // -------------------------------------------------------------------------
  // Windows behavior
  // -------------------------------------------------------------------------

  describe("on Windows", () => {
    beforeEach(() => {
      stubPlatform("win32");
    });

    it("uses shell: true for .cmd shim resolution", () => {
      spawnHarness("copilot", ["-i"], { stdio: "inherit" });

      expect(mockSpawn).toHaveBeenCalledWith("copilot", ["-i"], expect.objectContaining({ shell: true }));
    });

    it("quotes args containing spaces to prevent cmd.exe re-splitting", () => {
      spawnHarness("copilot", ["-i", "--allow-all", "Let's set up my first brainkit vault!"], {
        stdio: "inherit",
      });

      const passedArgs = getSpawnArgs();
      expect(passedArgs[0]).toBe("-i");
      expect(passedArgs[1]).toBe("--allow-all");
      // The prompt must be wrapped in double quotes so cmd.exe treats it as one token
      expect(passedArgs[2]).toBe('"Let\'s set up my first brainkit vault!"');
    });

    it("does not double-quote args that are already safe", () => {
      spawnHarness("copilot", ["--flag", "simple"], { stdio: "inherit" });

      const passedArgs = getSpawnArgs();
      expect(passedArgs).toEqual(["--flag", "simple"]);
    });

    it("escapes existing double quotes inside args", () => {
      spawnHarness("copilot", ['He said "hello" today'], { stdio: "inherit" });

      const passedArgs = getSpawnArgs();
      expect(passedArgs[0]).toBe('"He said \\"hello\\" today"');
    });

    it("preserves other spawn options", () => {
      const env = { FOO: "bar" };
      spawnHarness("copilot", [], { stdio: "inherit", cwd: "/tmp", env });

      expect(mockSpawn).toHaveBeenCalledWith(
        "copilot",
        [],
        expect.objectContaining({ stdio: "inherit", cwd: "/tmp", env, shell: true }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Non-Windows behavior
  // -------------------------------------------------------------------------

  describe("on non-Windows", () => {
    beforeEach(() => {
      stubPlatform("darwin");
    });

    it("does not use shell", () => {
      spawnHarness("opencode", ["--prompt", "hello world"], { stdio: "inherit" });

      expect(mockSpawn).toHaveBeenCalledWith(
        "opencode",
        ["--prompt", "hello world"],
        expect.objectContaining({ shell: false }),
      );
    });

    it("passes args through unchanged — no quoting", () => {
      spawnHarness("copilot", ["-i", "Let's set up my first brainkit vault!"], {
        stdio: "inherit",
      });

      const passedArgs = getSpawnArgs();
      expect(passedArgs).toEqual(["-i", "Let's set up my first brainkit vault!"]);
    });
  });
});
