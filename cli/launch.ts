import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { launchCopilot } from "./copilot.js";

// ---------------------------------------------------------------------------
// Harness definitions
// ---------------------------------------------------------------------------

interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[]) => void;
}

function which(binary: string): string | null {
  try {
    return execFileSync("which", [binary], { stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

function isInstalled(binaries: string[]): boolean {
  return binaries.some((b) => which(b) !== null);
}

// ---------------------------------------------------------------------------
// OpenCode launcher
// ---------------------------------------------------------------------------

function ensureOpenCodeConfig(): void {
  const configDir = path.join(os.homedir(), ".config", "brainkit");
  fs.mkdirSync(configDir, { recursive: true });

  const ocConfigPath = path.join(configDir, "opencode.json");
  if (!fs.existsSync(ocConfigPath)) {
    const config = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["@oribish/brainkit"],
    };
    fs.writeFileSync(ocConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  const tuiConfigPath = path.join(configDir, "tui.json");
  if (!fs.existsSync(tuiConfigPath)) {
    const config = {
      $schema: "https://opencode.ai/tui.json",
      plugin: ["@oribish/brainkit"],
    };
    fs.writeFileSync(tuiConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }
}

function launchOpenCode(args: string[]): void {
  ensureOpenCodeConfig();

  const configDir = path.join(os.homedir(), ".config", "brainkit");
  const env = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
  };

  const child = spawn("opencode", args, { stdio: "inherit", env });
  child.on("exit", (code) => process.exit(code ?? 0));
}

// ---------------------------------------------------------------------------
// Harness registry
// ---------------------------------------------------------------------------

const HARNESSES: Harness[] = [
  {
    name: "OpenCode",
    binaries: ["opencode"],
    aliases: ["oc", "opencode"],
    launch: launchOpenCode,
  },
  {
    name: "Copilot CLI",
    binaries: ["copilot"],
    aliases: ["copilot", "cp"],
    launch: launchCopilot,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isHarnessAlias(arg: string): boolean {
  return HARNESSES.some((h) => h.aliases.includes(arg));
}

export function launchHarness(alias: string, args: string[]): void {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    console.error(`  [brainkit] Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    console.error(`  [brainkit] ${harness.name} is not installed. Install it first.`);
    process.exit(1);
  }

  harness.launch(args);
}

export function detectAndLaunch(args: string[]): void {
  const available = HARNESSES.filter((h) => isInstalled(h.binaries));

  if (available.length === 0) {
    console.error("  [brainkit] No supported coding harness found.");
    console.error("  [brainkit] Install OpenCode: https://opencode.ai");
    console.error("  [brainkit] Install Copilot CLI: https://github.com/github/copilot-cli");
    process.exit(1);
  }

  if (available.length === 1) {
    const harness = available[0];
    if (harness !== undefined) {
      harness.launch(args);
    }
    return;
  }

  // Multiple harnesses — prompt user (for now, just list them)
  console.log("  [brainkit] Multiple coding harnesses found:");
  for (const h of available) {
    console.log(`    brainkit ${h.aliases[0]}  — launch ${h.name}`);
  }
  process.exit(0);
}
