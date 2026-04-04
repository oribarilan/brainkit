#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { init } from "./init.js";
import { update } from "./install.js";

const packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as { version: string };
const version = packageJson.version;

function printUsage(): void {
  console.log(`
  brainkit v${version}

  Usage: npx @oribish/brainkit [options]

  Options:
    --version    Print version and exit
    --help       Show this help message

  If no brainkit.toml exists in the current directory, starts interactive setup.
  If brainkit.toml exists, updates installed skills and AGENTS.md.
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

  const cwd = process.cwd();
  const configPath = path.join(cwd, "brainkit.toml");

  if (fs.existsSync(configPath)) {
    await update(cwd);
  } else {
    await init(cwd);
  }
}

process.on("SIGINT", () => {
  console.log("");
  process.exit(0);
});

main().catch((err: unknown) => {
  console.error(`  [brainkit] Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
