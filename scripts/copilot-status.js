#!/usr/bin/env node

// Copilot CLI statusLine script — prints vault stats for the footer bar.
// Called by Copilot CLI via the statusLine config in .github/copilot/settings.json.

import {
  readGlobalConfig,
  readVaultConfigSimple,
  getBragStats,
  readContacts,
  parseContacts,
} from "../core/index.js";

function staleness(lastEntryDate) {
  if (!lastEntryDate) return { text: "never", color: "\x1b[31m" }; // red
  const days = Math.floor((Date.now() - new Date(lastEntryDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 7) return { text: `${days}d ago`, color: "\x1b[32m" }; // green
  if (days <= 14) return { text: `${days}d ago`, color: "\x1b[33m" }; // yellow
  return { text: `${days}d ago`, color: "\x1b[31m" }; // red
}

function resolveVaultPath() {
  const fromEnv = process.env.BRAINKIT_VAULT_PATH;
  if (fromEnv) return fromEnv;

  // Fallback: read from global config (single-vault compat)
  const globalConfig = readGlobalConfig();
  if (!globalConfig?.brain_path) return null;
  return globalConfig.brain_path;
}

try {
  const vaultPath = resolveVaultPath();
  if (!vaultPath) process.exit(0);

  const config = readVaultConfigSimple(vaultPath);
  if (!config) process.exit(0);

  const parts = [`\u{1f9e0} ${config.user.name}'s vault`];

  if (config.features?.bragfile !== false) {
    const stats = getBragStats(vaultPath);
    const s = staleness(stats.lastEntryDate);
    const reset = "\x1b[0m";
    parts.push(`${stats.totalEntries} brags`);
    parts.push(`last: ${s.color}${s.text}${reset}`);
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
  // Silent failure — statusLine should never error visibly
}
