import { describe, it, expect } from "vitest";
import * as fs from "node:fs";

import { resolveHarnessName } from "../launch.js";

// ---------------------------------------------------------------------------
// Source-level contract — index.ts routes the `update` subcommand
// ---------------------------------------------------------------------------

describe("index.ts update subcommand contract (source-level)", () => {
  const indexSource = fs.readFileSync(new URL("../index.ts", import.meta.url), "utf-8");

  it("routes the 'update' subcommand to update.ts", () => {
    expect(indexSource).toMatch(/args\[0\]\s*===\s*["']update["']/);
  });

  it("dynamically imports ./update.js", () => {
    expect(indexSource).toMatch(/import\(["']\.\/update\.js["']\)/);
  });

  it("lists the update command in help text", () => {
    expect(indexSource).toMatch(/brainkit update/);
  });
});

// ---------------------------------------------------------------------------
// Source-level contract — update.ts imports
// ---------------------------------------------------------------------------

describe("update.ts import contract (source-level)", () => {
  const updateSource = fs.readFileSync(new URL("../update.ts", import.meta.url), "utf-8");

  it("imports checkForSelfUpdate from self-update", () => {
    expect(updateSource).toMatch(/import\s.*checkForSelfUpdate.*from\s+["']\.\/self-update\.js["']/);
  });

  it("imports checkHarnessVersion from harness-version", () => {
    expect(updateSource).toMatch(/import\s.*checkHarnessVersion.*from\s+["']\.\/harness-version\.js["']/);
  });

  it("imports resolveHarnessName from launch", () => {
    expect(updateSource).toMatch(/import\s.*resolveHarnessName.*from\s+["']\.\/launch\.js["']/);
  });
});

// ---------------------------------------------------------------------------
// resolveHarnessName
// ---------------------------------------------------------------------------

describe("resolveHarnessName", () => {
  it.each([
    ["oc", "OpenCode"],
    ["opencode", "OpenCode"],
    ["copilot", "Copilot CLI"],
    ["cp", "Copilot CLI"],
    ["claude", "Claude Code"],
    ["cc", "Claude Code"],
  ])('resolveHarnessName("%s") returns "%s"', (alias, expected) => {
    expect(resolveHarnessName(alias)).toBe(expected);
  });

  it("returns undefined for unknown aliases", () => {
    expect(resolveHarnessName("unknown")).toBeUndefined();
  });
});
