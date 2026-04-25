import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { execFileSync, spawn } from "node:child_process";
import { readGlobalConfig, discoverVaults } from "@oribish/brainkit-core";
import { launchCopilot } from "./copilot.js";

// ---------------------------------------------------------------------------
// Harness definitions
// ---------------------------------------------------------------------------

interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[], vaultPath?: string) => void;
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

function launchOpenCode(args: string[], vaultPath?: string): void {
  ensureOpenCodeConfig();

  const configDir = path.join(os.homedir(), ".config", "brainkit");
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
  };

  if (vaultPath !== undefined) {
    env["BRAINKIT_VAULT_PATH"] = vaultPath;
  }

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
// Vault flag parsing
// ---------------------------------------------------------------------------

export function parseVaultFlag(args: string[]): { vault: string | null; remaining: string[] } {
  const idx = args.indexOf("--vault");
  if (idx === -1) return { vault: null, remaining: [...args] };

  const value = args[idx + 1];
  if (value === undefined) {
    throw new Error("--vault requires a vault name. Usage: brainkit --vault <name>");
  }
  if (value.startsWith("-")) {
    throw new Error(`--vault requires a vault name, got "${value}". Usage: brainkit --vault <name>`);
  }

  const remaining = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { vault: value, remaining };
}

// ---------------------------------------------------------------------------
// Vault selection
// ---------------------------------------------------------------------------

function promptVaultSelection(vaults: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("Multiple vaults found. Use --vault <name> to select one."));
      return;
    }

    console.log("\n  [brainkit] Multiple vaults found:\n");
    for (let i = 0; i < vaults.length; i++) {
      const v = vaults[i];
      if (v !== undefined) {
        console.log(`    ${i + 1}. ${v}`);
      }
    }
    console.log("");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("  Select vault (number): ", (answer) => {
      rl.close();
      const idx = parseInt(answer, 10) - 1;
      const selected = vaults[idx];
      if (selected === undefined) {
        reject(new Error(`Invalid selection. Choose 1-${vaults.length}.`));
        return;
      }
      resolve(selected);
    });
  });
}

export async function selectVault(vaultFlag: string | null): Promise<{ vaultPath: string; brainPath: string }> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    console.error("  [brainkit] No brain configured. Run brainkit with OpenCode first to set up your vault.");
    process.exit(1);
  }

  const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
  let vaults: string[];

  try {
    vaults = discoverVaults(brainPath);
  } catch (err) {
    console.error(`  [brainkit] Cannot read brain directory: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Explicit --vault flag
  if (vaultFlag !== null) {
    if (!vaults.includes(vaultFlag)) {
      console.error(`  [brainkit] Vault "${vaultFlag}" not found.`);
      if (vaults.length > 0) {
        console.error(`  [brainkit] Available vaults: ${vaults.join(", ")}`);
      }
      process.exit(1);
    }
    return { vaultPath: path.join(brainPath, vaultFlag), brainPath };
  }

  // 0 vaults — fresh brain
  if (vaults.length === 0) {
    return { vaultPath: brainPath, brainPath };
  }

  // 1 vault — auto-select
  if (vaults.length === 1) {
    const single = vaults[0];
    if (single !== undefined) {
      return { vaultPath: path.join(brainPath, single), brainPath };
    }
  }

  // 2+ vaults — interactive prompt
  const selected = await promptVaultSelection(vaults);
  return { vaultPath: path.join(brainPath, selected), brainPath };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isHarnessAlias(arg: string): boolean {
  return HARNESSES.some((h) => h.aliases.includes(arg));
}

export function launchHarness(alias: string, args: string[], vaultPath?: string): void {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    console.error(`  [brainkit] Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    console.error(`  [brainkit] ${harness.name} is not installed. Install it first.`);
    process.exit(1);
  }

  harness.launch(args, vaultPath);
}

export function detectAndLaunch(args: string[], vaultPath?: string): void {
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
      harness.launch(args, vaultPath);
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
