#!/usr/bin/env node

import { version } from "./version.js";
import { isHarnessAlias, launchHarness, detectAndLaunch } from "./launch.js";

function printUsage(): void {
  console.log(`
  brainkit v${version}

  Usage:
    brainkit                     Auto-detect harness and launch
    brainkit oc [args...]        Launch with OpenCode
    brainkit opencode [args...]  Launch with OpenCode

  Options:
    --version    Print version and exit
    --help       Show this help message

  All arguments after the harness alias are passed through.
  Example: brainkit oc --model anthropic/claude-sonnet-4-5
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    console.log(version);
    process.exit(0);
  }

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  const firstArg = args[0];

  // Harness alias — launch explicitly
  if (firstArg !== undefined && isHarnessAlias(firstArg)) {
    launchHarness(firstArg, args.slice(1));
    return;
  }

  // No args — auto-detect and launch
  if (firstArg === undefined) {
    detectAndLaunch([]);
    return;
  }

  // Unknown argument — pass everything through to auto-detected harness
  detectAndLaunch(args);
}

process.on("SIGINT", () => {
  console.log("");
  process.exit(0);
});

main();
