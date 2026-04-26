import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as p from "@clack/prompts";
import { execFileSync, spawn } from "node:child_process";
import { readGlobalConfig, writeGlobalConfig, discoverVaults, getConfigDir } from "../core/index.js";
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
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const ocConfigPath = path.join(configDir, "opencode.json");
  if (!fs.existsSync(ocConfigPath)) {
    const config = {
      $schema: "https://opencode.ai/config.json",
      plugin: ["@2brain/brainkit"],
    };
    fs.writeFileSync(ocConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  const tuiConfigPath = path.join(configDir, "tui.json");
  if (!fs.existsSync(tuiConfigPath)) {
    const config = {
      $schema: "https://opencode.ai/tui.json",
      plugin: ["@2brain/brainkit"],
    };
    fs.writeFileSync(tuiConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }
}

function launchOpenCode(args: string[], vaultPath?: string): void {
  ensureOpenCodeConfig();

  const configDir = getConfigDir();
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

async function promptVaultSelection(vaults: string[]): Promise<string> {
  if (!process.stdin.isTTY) {
    p.cancel("Multiple vaults found. Use --vault <name> to select one.");
    process.exit(1);
  }

  const selected = await p.select({
    message: "Select a vault",
    options: vaults.map((v) => ({ value: v, label: v })),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return selected;
}

export async function selectVault(
  vaultFlag: string | null,
): Promise<{ vaultPath: string | undefined; brainPath: string | undefined }> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    return { vaultPath: undefined, brainPath: undefined };
  }

  const brainPath = globalConfig.brain_path.replace(/^~/, os.homedir());
  let vaults: string[];

  try {
    vaults = discoverVaults(brainPath);
  } catch (err) {
    p.cancel(`Cannot read brain directory: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // Explicit --vault flag
  if (vaultFlag !== null) {
    if (!vaults.includes(vaultFlag)) {
      const msg =
        vaults.length > 0
          ? `Vault "${vaultFlag}" not found. Available: ${vaults.join(", ")}`
          : `Vault "${vaultFlag}" not found.`;
      p.cancel(msg);
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
    p.cancel(`Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    p.cancel(`${harness.name} is not installed.`);
    process.exit(1);
  }

  p.outro(`Launching ${harness.name}...`);
  harness.launch(args, vaultPath);
}

export async function detectAndLaunch(args: string[], vaultPath?: string): Promise<void> {
  const available = HARNESSES.filter((h) => isInstalled(h.binaries));

  if (available.length === 0) {
    p.cancel("No supported harness found. Install OpenCode or Copilot CLI.");
    process.exit(1);
  }

  if (available.length === 1) {
    const harness = available[0];
    if (harness !== undefined) {
      p.outro(`Launching ${harness.name}...`);
      harness.launch(args, vaultPath);
    }
    return;
  }

  // Multiple harnesses — check for saved default
  const globalConfig = readGlobalConfig();
  const savedDefault = globalConfig?.default_harness;
  if (savedDefault !== undefined && savedDefault !== "") {
    const defaultHarness = available.find((h) => h.aliases.includes(savedDefault));
    if (defaultHarness) {
      p.outro(`Launching ${defaultHarness.name}...`);
      defaultHarness.launch(args, vaultPath);
      return;
    }
  }

  // Non-TTY — can't prompt
  if (!process.stdin.isTTY) {
    p.cancel("Multiple harnesses found. Specify one: brainkit oc | brainkit copilot");
    process.exit(1);
  }

  // Interactive prompt
  const selected = await p.select({
    message: "Select your default harness",
    options: HARNESSES.map((h) => {
      const detected = available.includes(h);
      return { value: h, label: `${h.name} (${detected ? "detected" : "not installed"})`, disabled: !detected };
    }),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  // Save default
  const config = globalConfig ?? { version: 1, brain_path: "" };
  config.default_harness = selected.aliases[0];
  writeGlobalConfig(config);
  p.log.success(`Default harness set to ${selected.name}.`);

  p.outro(`Launching ${selected.name}...`);
  selected.launch(args, vaultPath);
}
