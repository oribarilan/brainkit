#!/usr/bin/env node

import { version } from "./version.js";
import { isHarnessAlias, launchHarness, detectAndLaunch, parseVaultFlag, selectVault } from "./launch.js";

function printUsage(): void {
  console.log(`
  brainkit v${version}

  Usage:
    brainkit                     Launch (auto-detects harness)
    brainkit oc [args...]        Launch with OpenCode
    brainkit opencode [args...]  Launch with OpenCode
    brainkit copilot [args...]   Launch with Copilot CLI
    brainkit cp [args...]        Launch with Copilot CLI

  Options:
    --vault <name>  Pick which vault to open
    --version       Print version
    --help          Show this message

  Extra args are passed through to the harness.
  Example: brainkit oc --model anthropic/claude-sonnet-4-5
  Example: brainkit --vault work
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  // Parse --vault from args (before or after harness alias)
  const { vault: vaultFlag, remaining } = parseVaultFlag(args);

  // Select vault
  const { vaultPath } = await selectVault(vaultFlag);

  const firstArg = remaining[0];

  // Harness alias — launch explicitly
  if (firstArg !== undefined && isHarnessAlias(firstArg)) {
    launchHarness(firstArg, remaining.slice(1), vaultPath);
    return;
  }

  // No args or unknown — auto-detect and launch
  detectAndLaunch(remaining, vaultPath);
}

process.on("SIGINT", () => {
  console.log("");
  process.exit(0);
});

main().catch((err: unknown) => {
  console.error(`  [brainkit] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
