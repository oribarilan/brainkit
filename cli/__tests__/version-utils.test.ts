import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { isOlderThan, getLatestNpmVersion } from "../version-utils.js";

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
