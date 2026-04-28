#!/usr/bin/env node
// Brainkit Claude statusline — vault stats footer.
// Reads JSON from stdin (Claude session info), prints a single-line summary:
//   🧠 <user>'s vault · <N> brags · last: <Xd ago colored> · <M> contacts
// Resolves brainkit's core/ from $BRAINKIT_PACKAGE_ROOT (set by the launcher).
// Note: if you uninstall brainkit but leave the staged plugin behind, this
// script fails silently — that's intentional.

import { pathToFileURL } from "node:url";
import * as path from "node:path";

let stdin = "";
try {
  for await (const chunk of process.stdin) stdin += chunk;
} catch {
  // ignore — fall through with empty session info
}

let session = {};
try {
  if (stdin.trim()) session = JSON.parse(stdin);
} catch {
  // ignore — session info is best-effort
}

const vaultPath = process.env.BRAINKIT_VAULT_PATH ?? session.cwd;
const pkgRoot = process.env.BRAINKIT_PACKAGE_ROOT;
if (!vaultPath || !pkgRoot) process.exit(0);

try {
  const corePath = pathToFileURL(path.join(pkgRoot, "dist", "core", "index.js")).href;
  const {
    readVaultConfigSimple,
    getBragStats,
    readContacts,
    parseContacts,
    stalenessCategory,
    daysSinceLastEntry,
  } = await import(corePath);

  const config = readVaultConfigSimple(vaultPath);
  if (!config) process.exit(0);

  const STALENESS_ANSI = {
    fresh: "\x1b[32m", // green
    warning: "\x1b[33m", // yellow
    stale: "\x1b[31m", // red
    never: "\x1b[31m", // red
  };
  const RESET = "\x1b[0m";

  const parts = [`\u{1f9e0} ${config.user.name}'s vault`];

  if (config.features?.bragfile !== false) {
    const stats = getBragStats(vaultPath);
    parts.push(`${stats.totalEntries} brags`);
    const cat = stalenessCategory(stats.lastEntryDate);
    if (cat === "never") {
      parts.push(`last: ${STALENESS_ANSI.never}never${RESET}`);
    } else {
      const days = daysSinceLastEntry(stats.lastEntryDate);
      parts.push(`last: ${STALENESS_ANSI[cat]}${days}d ago${RESET}`);
    }
  }

  if (config.features?.contacts !== false) {
    try {
      const raw = readContacts(vaultPath);
      if (raw) {
        const contacts = parseContacts(raw);
        parts.push(`${contacts.length} contacts`);
      }
    } catch {
      // ignore
    }
  }

  process.stdout.write(parts.join(" \u00b7 "));
} catch {
  // Silent failure — statusline must never error visibly.
}
