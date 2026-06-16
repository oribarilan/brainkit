#!/usr/bin/env node

import * as p from "@clack/prompts";
import { version } from "./version.js";
import {
  isHarnessAlias,
  launchHarness,
  detectAndLaunch,
  handleDefaultCommand,
  parseVaultFlag,
  selectVault,
} from "./launch.js";
import type { LaunchTarget } from "./launch.js";
import { factoryReset } from "./reset.js";
import { maybeCheckForSelfUpdate } from "./self-update.js";

const HELP_TEXT = `Usage:
  brainkit                     Launch (auto-detects harness)
  brainkit oc [args...]        Launch with OpenCode
  brainkit opencode [args...]  Launch with OpenCode
  brainkit copilot [args...]   Launch with Copilot CLI
  brainkit cp [args...]        Launch with Copilot CLI
  brainkit claude [args...]    Launch with Claude Code
  brainkit cc [args...]        Launch with Claude Code
  brainkit default [alias]     View or set default harness
  brainkit update [version]    Check for updates or install a specific version
  brainkit reset               Factory reset (removes all brainkit config; vaults untouched)

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
    p.outro("Happy thinking!");
    process.exit(0);
  }

  // Subcommands
  if (args[0] === "reset") {
    await factoryReset();
    return;
  }

  if (args[0] === "default") {
    await handleDefaultCommand(args.slice(1));
    return;
  }

  if (args[0] === "update") {
    const { runUpdate } = await import("./update.js");
    await runUpdate(args[1]); // optional version
    return;
  }

  p.intro("brainkit");

  await maybeCheckForSelfUpdate();

  // Parse --vault from args (before or after harness alias)
  const { vault: vaultFlag, remaining } = parseVaultFlag(args);

  // Select vault
  const selection = await selectVault(vaultFlag);

  // Map VaultSelection to LaunchTarget (drop brainPath for single mode)
  const target: LaunchTarget = selection.mode === "single"
    ? { mode: "single", vaultPath: selection.vaultPath }
    : selection;

  const firstArg = remaining[0];

  // Harness alias — launch explicitly
  if (firstArg !== undefined && isHarnessAlias(firstArg)) {
    await launchHarness(firstArg, remaining.slice(1), target);
    return;
  }

  // No args or unknown — auto-detect and launch
  await detectAndLaunch(remaining, target);
}

main().catch((err: unknown) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
