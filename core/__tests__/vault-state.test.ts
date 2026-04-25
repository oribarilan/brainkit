import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyToml } from "smol-toml";
import { detectVaultState, readVaultConfig } from "../vault.js";
import { migrations } from "../migrations.js";
import type { Migration } from "../migrations.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeToml(dir: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, "brainkit.toml"), stringifyToml(data) + "\n", "utf-8");
}

function makeValidConfig(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    user: { name: "Test", role: "Engineer" },
    features: { bragfile: false, contacts: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectVaultState
// ---------------------------------------------------------------------------

describe("detectVaultState", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brainkit-vs-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns "configured" when brainkit.toml exists', () => {
    writeToml(dir, makeValidConfig());
    expect(detectVaultState(dir)).toEqual({ kind: "configured" });
  });

  it('returns "fresh" for empty directory', () => {
    expect(detectVaultState(dir)).toEqual({ kind: "fresh" });
  });

  it('returns "existing" when 3+ .md files exist (no brainkit.toml)', () => {
    writeFileSync(join(dir, "a.md"), "# A", "utf-8");
    writeFileSync(join(dir, "b.md"), "# B", "utf-8");
    writeFileSync(join(dir, "c.md"), "# C", "utf-8");
    expect(detectVaultState(dir)).toEqual({ kind: "existing" });
  });

  it('returns "existing" when subdirectories with content exist (no brainkit.toml)', () => {
    mkdirSync(join(dir, "notes"));
    writeFileSync(join(dir, "notes", "todo.md"), "# Todo", "utf-8");
    expect(detectVaultState(dir)).toEqual({ kind: "existing" });
  });

  it('returns "fresh" for directory with 1-2 .md files and no content dirs', () => {
    writeFileSync(join(dir, "readme.md"), "# Readme", "utf-8");
    writeFileSync(join(dir, "notes.md"), "# Notes", "utf-8");
    expect(detectVaultState(dir)).toEqual({ kind: "fresh" });
  });

  it("ignores hidden files and directories", () => {
    writeFileSync(join(dir, ".hidden.md"), "hidden", "utf-8");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "config"), "gitconfig", "utf-8");
    expect(detectVaultState(dir)).toEqual({ kind: "fresh" });
  });

  it('returns "fresh" when directory does not exist', () => {
    expect(detectVaultState(join(dir, "nonexistent"))).toEqual({ kind: "fresh" });
  });
});

// ---------------------------------------------------------------------------
// readVaultConfig with migrations
// ---------------------------------------------------------------------------

describe("readVaultConfig with migrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brainkit-rvc-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    migrations.length = 0;
  });

  it("returns config and empty pendingBreaking for a normal config", () => {
    writeToml(dir, makeValidConfig());

    const result = readVaultConfig(dir);

    expect(result.config.user.name).toBe("Test");
    expect(result.pendingBreaking).toHaveLength(0);
  });

  it("auto-applies non-breaking migration and writes back to disk", () => {
    writeToml(dir, makeValidConfig({ version: 1 }));

    migrations.push({
      from: 1,
      to: 2,
      breaking: false,
      description: "add default tone",
      migrate: (c) => {
        const user = c["user"] as Record<string, unknown>;
        return { ...c, user: { ...user, tone: "direct" } };
      },
    } satisfies Migration);

    const result = readVaultConfig(dir);

    expect(result.config.version).toBe(2);
    expect(result.config.user.tone).toBe("direct");
    expect(result.pendingBreaking).toHaveLength(0);

    // Verify it was written back — re-read without migrations
    migrations.length = 0;
    const reread = readVaultConfig(dir);
    expect(reread.config.version).toBe(2);
    expect(reread.config.user.tone).toBe("direct");
  });
});
