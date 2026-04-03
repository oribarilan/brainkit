import { execSync } from "node:child_process";
import * as fs from "node:fs";

// ---------------------------------------------------------------------------
// Debounced vault auto-commit
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 30_000; // 30 seconds

let commitTimer: ReturnType<typeof setTimeout> | null = null;

function isGitRepo(vaultPath: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd: vaultPath, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasUncommittedChanges(vaultPath: string): boolean {
  try {
    const status = execSync("git status --porcelain", { cwd: vaultPath, stdio: "pipe" }).toString().trim();
    return status !== "";
  } catch {
    return false;
  }
}

function commitChanges(vaultPath: string): void {
  try {
    const date = new Date().toISOString().slice(0, 10);
    execSync("git add -A", { cwd: vaultPath, stdio: "pipe" });
    execSync(`git commit -m "brainkit: auto-save ${date}"`, { cwd: vaultPath, stdio: "pipe" });
  } catch {
    // Commit failed (nothing to commit, or git error) — skip silently
  }
}

export function scheduleAutoCommit(vaultPath: string): void {
  if (!fs.existsSync(vaultPath)) return;
  if (!isGitRepo(vaultPath)) return;

  // Clear existing timer — restart the debounce window
  if (commitTimer !== null) {
    clearTimeout(commitTimer);
  }

  commitTimer = setTimeout(() => {
    if (hasUncommittedChanges(vaultPath)) {
      commitChanges(vaultPath);
    }
    commitTimer = null;
  }, DEBOUNCE_MS);
}

export function flushAutoCommit(vaultPath: string): void {
  // Called on session shutdown — commit immediately if pending
  if (commitTimer !== null) {
    clearTimeout(commitTimer);
    commitTimer = null;
  }

  if (fs.existsSync(vaultPath) && isGitRepo(vaultPath) && hasUncommittedChanges(vaultPath)) {
    commitChanges(vaultPath);
  }
}
