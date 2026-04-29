#!/usr/bin/env node
// Brainkit SessionEnd hook — auto-commits vault changes.
// Self-contained (no brainkit imports) so it stays trivially debuggable and
// matches the Copilot AUTO_COMMIT_SCRIPT pattern in cli/copilot.ts.
// All errors swallowed silently — this hook MUST NOT block session end or
// pollute the TUI with output.

import { execSync } from "node:child_process";

const vaultPath = process.env.BRAINKIT_VAULT_PATH;
if (!vaultPath) process.exit(0);

const opts = { cwd: vaultPath, stdio: "pipe" };

try {
  execSync("git rev-parse --git-dir", opts);
} catch {
  process.exit(0);
}

let status = "";
try {
  status = execSync("git status --porcelain", opts).toString().trim();
} catch {
  process.exit(0);
}
if (!status) process.exit(0);

try {
  const date = new Date().toISOString().slice(0, 10);
  execSync("git add -A", opts);
  execSync(`git commit -m "brainkit: auto-save ${date}"`, opts);
} catch {
  // commit failed — skip silently
}
