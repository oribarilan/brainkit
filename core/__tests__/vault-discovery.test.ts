import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverVaults } from "../vault.js";

describe("discoverVaults", () => {
  let brainDir: string;

  beforeEach(() => {
    brainDir = mkdtempSync(join(tmpdir(), "brainkit-dv-"));
  });

  afterEach(() => {
    rmSync(brainDir, { recursive: true, force: true });
  });

  it("returns vault names for directories containing brainkit.toml", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    mkdirSync(join(brainDir, "life"));
    writeFileSync(join(brainDir, "life", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');

    expect(discoverVaults(brainDir)).toEqual(["life", "work"]);
  });

  it("ignores directories without brainkit.toml", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    mkdirSync(join(brainDir, "random-dir"));

    expect(discoverVaults(brainDir)).toEqual(["work"]);
  });

  it("ignores files (non-directories)", () => {
    mkdirSync(join(brainDir, "work"));
    writeFileSync(join(brainDir, "work", "brainkit.toml"), 'version = 1\n[user]\nname = "Test"\nrole = "Eng"\n');
    writeFileSync(join(brainDir, "notes.md"), "# Notes");

    expect(discoverVaults(brainDir)).toEqual(["work"]);
  });

  it("returns empty array for empty brain directory", () => {
    expect(discoverVaults(brainDir)).toEqual([]);
  });

  it("returns sorted results", () => {
    for (const name of ["zebra", "alpha", "middle"]) {
      mkdirSync(join(brainDir, name));
      writeFileSync(join(brainDir, name, "brainkit.toml"), 'version = 1\n[user]\nname = "T"\nrole = "E"\n');
    }

    expect(discoverVaults(brainDir)).toEqual(["alpha", "middle", "zebra"]);
  });

  it("throws when brain path does not exist", () => {
    expect(() => discoverVaults(join(brainDir, "nonexistent"))).toThrow();
  });

  it("throws when brain path is not a directory", () => {
    const filePath = join(brainDir, "not-a-dir");
    writeFileSync(filePath, "just a file");

    expect(() => discoverVaults(filePath)).toThrow();
  });
});
