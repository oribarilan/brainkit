import { execSync } from "node:child_process";
import * as fs from "node:fs";

import { isGitRepo } from "./git.js";

// ---------------------------------------------------------------------------
// Debounced vault auto-commit (per-vault timers)
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 30_000; // 30 seconds

const commitTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  // Clear existing timer for THIS vault — restart its debounce window
  const existing = commitTimers.get(vaultPath);
  if (existing !== undefined) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    if (hasUncommittedChanges(vaultPath)) {
      commitChanges(vaultPath);
    }
    commitTimers.delete(vaultPath);
  }, DEBOUNCE_MS);

  commitTimers.set(vaultPath, timer);
}

export function flushAutoCommit(vaultPath: string): void {
  // Called on session shutdown for a specific vault — commit immediately if pending
  const timer = commitTimers.get(vaultPath);
  if (timer !== undefined) {
    clearTimeout(timer);
    commitTimers.delete(vaultPath);
  }

  if (fs.existsSync(vaultPath) && isGitRepo(vaultPath) && hasUncommittedChanges(vaultPath)) {
    commitChanges(vaultPath);
  }
}

export function flushAllAutoCommits(): void {
  // Flush all tracked vaults — used in multi-vault mode on session shutdown
  for (const [vaultPath, timer] of commitTimers) {
    clearTimeout(timer);
    if (fs.existsSync(vaultPath) && isGitRepo(vaultPath) && hasUncommittedChanges(vaultPath)) {
      commitChanges(vaultPath);
    }
  }
  commitTimers.clear();
}
