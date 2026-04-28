#!/usr/bin/env node
// Brainkit PreCompact hook — injects vault identity into compaction summary.
// Resolves brainkit's core/ from $BRAINKIT_PACKAGE_ROOT (set by the launcher).
// Note: if you uninstall brainkit but leave the staged plugin behind, this
// script fails silently — that's intentional. Reinstall brainkit or remove the
// plugin from ~/.claude/plugins/.

import { pathToFileURL } from "node:url";
import * as path from "node:path";

const vaultPath = process.env.BRAINKIT_VAULT_PATH;
const pkgRoot = process.env.BRAINKIT_PACKAGE_ROOT;
if (!vaultPath || !pkgRoot) process.exit(0);

try {
  const corePath = pathToFileURL(path.join(pkgRoot, "dist", "core", "index.js")).href;
  const { readVaultConfigSimple } = await import(corePath);
  const config = readVaultConfigSimple(vaultPath);
  if (!config) process.exit(0);

  const vaultName = path.basename(vaultPath);
  const features =
    Object.entries(config.features ?? {})
      .filter(([, enabled]) => enabled !== false)
      .map(([name]) => name)
      .join(", ") || "defaults";

  const lines = [
    "## Brainkit Vault Context (Condensed)",
    `- User: ${config.user.name} (${config.user.role})`,
    `- Vault: ${vaultName} (${vaultPath})`,
    `- Features: ${features}`,
    `- Tone: ${config.user.tone ?? "direct"}`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
} catch {
  process.exit(0);
}
