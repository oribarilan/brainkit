import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { isOlderThan, getLatestNpmVersion, getNpmVersions } from "../version-utils.js";

const mockExecFileSync = vi.mocked(execFileSync);

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

describe("getNpmVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const npmTimeOutput = JSON.stringify({
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-06-01T00:00:00.000Z",
    "1.0.0": "2026-01-15T10:00:00.000Z",
    "1.1.0": "2026-02-20T10:00:00.000Z",
    "1.1.1-beta.1": "2026-03-01T10:00:00.000Z",
    "1.2.0": "2026-04-10T10:00:00.000Z",
  });

  it("returns versions sorted newest-first with dates", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(npmTimeOutput));
    const result = getNpmVersions("@2brain/brainkit", 10) ?? [];
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ version: "1.2.0", date: "2026-04-10" });
    expect(result[1]).toEqual({ version: "1.1.0", date: "2026-02-20" });
    expect(result[2]).toEqual({ version: "1.0.0", date: "2026-01-15" });
  });

  it("filters out created and modified keys", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(npmTimeOutput));
    const result = getNpmVersions("@2brain/brainkit", 10) ?? [];
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain("created");
    expect(versions).not.toContain("modified");
  });

  it("filters out prerelease versions", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(npmTimeOutput));
    const result = getNpmVersions("@2brain/brainkit", 10) ?? [];
    const versions = result.map((e) => e.version);
    expect(versions).not.toContain("1.1.1-beta.1");
  });

  it("respects count parameter", () => {
    mockExecFileSync.mockReturnValue(Buffer.from(npmTimeOutput));
    const result = getNpmVersions("@2brain/brainkit", 2) ?? [];
    expect(result).toHaveLength(2);
    expect(result[0]?.version).toBe("1.2.0");
    expect(result[1]?.version).toBe("1.1.0");
  });

  it("returns null when execFileSync throws", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("network error");
    });
    expect(getNpmVersions("@2brain/brainkit", 5)).toBeNull();
  });

  it("returns null when JSON is malformed", () => {
    mockExecFileSync.mockReturnValue(Buffer.from("not valid json{{{"));
    expect(getNpmVersions("@2brain/brainkit", 5)).toBeNull();
  });

  it("handles empty version list after filtering", () => {
    const onlyMeta = JSON.stringify({
      created: "2026-01-01T00:00:00.000Z",
      modified: "2026-06-01T00:00:00.000Z",
      "1.0.0-alpha.1": "2026-02-01T00:00:00.000Z",
    });
    mockExecFileSync.mockReturnValue(Buffer.from(onlyMeta));
    const result = getNpmVersions("@2brain/brainkit", 5);
    expect(result).toEqual([]);
  });
});

describe("getLatestNpmVersion", () => {
  it("returns trimmed version on success", () => {
    mockExecFileSync.mockReturnValue(Buffer.from("1.2.3\n"));
    expect(getLatestNpmVersion("@2brain/brainkit")).toBe("1.2.3");
  });

  it("returns null on failure", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("network error");
    });
    expect(getLatestNpmVersion("@2brain/brainkit")).toBeNull();
  });
});
