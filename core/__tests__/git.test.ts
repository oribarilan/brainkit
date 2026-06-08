import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { isGitRepo } from "../git.js";

describe("isGitRepo", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir !== undefined) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("returns false for a directory without .git", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-git-test-"));
    expect(isGitRepo(tmpDir)).toBe(false);
  });

  it("returns true for a directory after git init", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-git-test-"));
    execFileSync("git", ["init"], { cwd: tmpDir, stdio: "pipe" });
    expect(isGitRepo(tmpDir)).toBe(true);
  });
});
