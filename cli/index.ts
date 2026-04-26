#!/usr/bin/env node

import * as p from "@clack/prompts";
import { version } from "./version.js";
import { isHarnessAlias, launchHarness, detectAndLaunch, parseVaultFlag, selectVault } from "./launch.js";

const HELP_TEXT = `Usage:
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
Example: brainkit --vault work`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // --version: plain output (for scripting/piping)
  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  // --help: framed output
  if (args.includes("--help")) {
    p.intro(`brainkit v${version}`);
    p.note(HELP_TEXT, "Usage");
    p.outro();
    process.exit(0);
  }

  p.intro("brainkit");

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
  await detectAndLaunch(remaining, vaultPath);
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
