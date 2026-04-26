import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// getConfigDir — cross-platform config directory
// ---------------------------------------------------------------------------

describe("getConfigDir", () => {
  const originalPlatform = process.platform;
  let originalAppData: string | undefined;
  let originalConfigDir: string | undefined;

  beforeEach(() => {
    originalAppData = process.env["APPDATA"];
    originalConfigDir = process.env["BRAINKIT_CONFIG_DIR"];
    delete process.env["BRAINKIT_CONFIG_DIR"];
    delete process.env["APPDATA"];
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    if (originalAppData !== undefined) {
      process.env["APPDATA"] = originalAppData;
    } else {
      delete process.env["APPDATA"];
    }
    if (originalConfigDir !== undefined) {
      process.env["BRAINKIT_CONFIG_DIR"] = originalConfigDir;
    } else {
      delete process.env["BRAINKIT_CONFIG_DIR"];
    }
    vi.resetModules();
  });

  it("returns ~/.config/brainkit on macOS/Linux", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { getConfigDir } = await import("../vault.js");
    const result = getConfigDir();
    expect(result).toBe(path.join(os.homedir(), ".config", "brainkit"));
  });

  it("returns %APPDATA%/brainkit on Windows when APPDATA is set", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env["APPDATA"] = "C:\\Users\\Test\\AppData\\Roaming";
    const { getConfigDir } = await import("../vault.js");
    const result = getConfigDir();
    expect(result).toBe(path.join("C:\\Users\\Test\\AppData\\Roaming", "brainkit"));
  });

  it("falls back to homedir/AppData/Roaming on Windows when APPDATA is unset", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const { getConfigDir } = await import("../vault.js");
    const result = getConfigDir();
    expect(result).toBe(path.join(os.homedir(), "AppData", "Roaming", "brainkit"));
  });

  it("respects BRAINKIT_CONFIG_DIR override on all platforms", async () => {
    process.env["BRAINKIT_CONFIG_DIR"] = "/custom/config/dir";
    const { getConfigDir } = await import("../vault.js");
    expect(getConfigDir()).toBe("/custom/config/dir");

    // Also on win32
    Object.defineProperty(process, "platform", { value: "win32" });
    expect(getConfigDir()).toBe("/custom/config/dir");
  });
});

// ---------------------------------------------------------------------------
// Tilde expansion — path normalization
// ---------------------------------------------------------------------------

describe("tilde expansion normalization", () => {
  it("path.resolve normalizes mixed separators", () => {
    // Simulates what happens when brain_path = "~/brain" is expanded on any platform
    const expanded = "~/brain".replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);

    // path.resolve should produce a fully normalized absolute path
    expect(path.isAbsolute(resolved)).toBe(true);
    // Should not contain mixed separators (no forward slashes where backslashes expected on win32)
    expect(resolved).toBe(path.normalize(resolved));
  });
});
