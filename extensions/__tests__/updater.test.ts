import { describe, it, expect } from "vitest";
import { isNewerVersion, parseChangelog } from "../updater.js";

describe("isNewerVersion", () => {
  it("returns true for patch bump", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns true for minor bump", () => {
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
  });

  it("returns true for major bump", () => {
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("returns false for downgrade", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
  });

  it("returns false for same version", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("uses numeric comparison, not string (0.9.9 < 0.10.0)", () => {
    expect(isNewerVersion("0.9.9", "0.10.0")).toBe(true);
  });

  it("returns false when major is higher even if minor/patch are lower", () => {
    expect(isNewerVersion("2.0.0", "1.99.99")).toBe(false);
  });
});

describe("parseChangelog", () => {
  const CHANGELOG = `# Changelog

## [0.3.0] - 2026-06-01

### Added
- Feature C

## [0.2.0] - 2026-05-01

### Added
- Feature B

## [0.1.0] - 2026-04-03

### Added
- Feature A
`;

  it("extracts a single version section between from and to", () => {
    const result = parseChangelog(CHANGELOG, "0.2.0", "0.3.0");
    expect(result).not.toBeNull();
    expect(result).toContain("0.3.0");
    expect(result).toContain("Feature C");
    expect(result).not.toContain("Feature B");
    expect(result).not.toContain("Feature A");
  });

  it("extracts multiple version sections", () => {
    const result = parseChangelog(CHANGELOG, "0.1.0", "0.3.0");
    expect(result).not.toBeNull();
    expect(result).toContain("Feature C");
    expect(result).toContain("Feature B");
    expect(result).not.toContain("Feature A");
  });

  it("returns null when toVersion not found", () => {
    const result = parseChangelog(CHANGELOG, "0.1.0", "0.9.0");
    expect(result).toBeNull();
  });

  it("returns entries down to end when fromVersion not found", () => {
    const result = parseChangelog(CHANGELOG, "0.0.1", "0.3.0");
    expect(result).not.toBeNull();
    expect(result).toContain("Feature C");
    expect(result).toContain("Feature B");
    expect(result).toContain("Feature A");
  });

  it("skips sections with no version bracket", () => {
    const changelog = `# Changelog

## Overview

Some intro text.

## [0.2.0] - 2026-05-01

### Added
- Feature B

## [0.1.0] - 2026-04-03

### Added
- Feature A
`;
    const result = parseChangelog(changelog, "0.1.0", "0.2.0");
    expect(result).not.toBeNull();
    expect(result).toContain("Feature B");
    expect(result).not.toContain("Overview");
    expect(result).not.toContain("Feature A");
  });

  it("returns null for empty changelog", () => {
    const result = parseChangelog("", "0.1.0", "0.2.0");
    expect(result).toBeNull();
  });
});
