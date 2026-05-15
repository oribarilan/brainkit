import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as p from "@clack/prompts";
import { execFileSync } from "node:child_process";
import { readGlobalConfig, writeGlobalConfig, discoverVaults, getConfigDir, readVaultConfigSimple } from "../core/index.js";
import { buildLibrarianAgentFile } from "../core/librarian-agent.js";
import { launchCopilot } from "./copilot.js";
import { launchClaude } from "./claude.js";
import { maybeCheckHarnessVersion } from "./harness-version.js";
import { spawnHarness } from "./spawn.js";
import { resetBrainkitConfig } from "./reset.js";

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
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = execFileSync(cmd, [binary], { stdio: "pipe" }).toString().trim();
    // `where` on Windows may return multiple lines — take the first match
    return result.split(/\r?\n/)[0] ?? result;
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

/**
 * Build the opencode.json config object brainkit writes to its isolated config dir.
 *
 * The brainkit-isolated `opencode.json` is 100% brainkit-owned: only the fields
 * brainkit needs to function (`$schema`, `plugin`, conditional `permission`).
 * Per-user customizations (model, MCP, LSP, instructions, etc.) belong in
 * `~/.config/opencode/` — OpenCode merges that with brainkit's config at load
 * time, with brainkit's values winning on conflict (verified empirically).
 *
 * During onboarding we grant full permissions ("yolo mode") so the agent can
 * create dirs, write config, etc. without permission prompts. The top-level
 * `permission: "allow"` shortcut is the documented OpenCode form for this
 * (https://opencode.ai/docs/permissions/#configuration). The previous
 * agent-scoped form (`agent.build.permission: "allow"`) is invalid — nested
 * permissions require an object, and OpenCode's validator rejected the string
 * character-by-character.
 *
 * On subsequent launches (with a vault), permissions revert to OpenCode defaults.
 */
export function buildOpenCodeConfig(isOnboarding: boolean): Record<string, unknown> {
  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
    plugin: ["@2brain/brainkit"],
  };
  if (isOnboarding) {
    config["permission"] = "allow";
  }
  return config;
}

/**
 * Build the tui.json config object brainkit writes to its isolated config dir.
 *
 * Brainkit currently does not declare a theme — see opencode/tui.tsx for the
 * reason. The brainkit theme JSON is kept dormant in the repo for future use.
 */
export function buildOpenCodeTuiConfig(): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/tui.json",
    plugin: ["@2brain/brainkit"],
  };
}

/**
 * Write `content` to `filePath` only if the on-disk content differs.
 *
 * Preserves mtime when content is unchanged, which avoids unnecessary file
 * churn (and any tooling that watches config mtimes) on every launch.
 *
 * Exported for direct unit testing; production callers go through
 * `ensureOpenCodeConfig`.
 */
export function writeIfChanged(filePath: string, content: string): void {
  let existing: string | null;
  try {
    existing = fs.readFileSync(filePath, "utf-8");
  } catch {
    existing = null;
  }
  if (existing === content) return;
  fs.writeFileSync(filePath, content, "utf-8");
}

function ensureOpenCodeConfig(isOnboarding: boolean, vaultPath?: string): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const ocConfigPath = path.join(configDir, "opencode.json");
  const ocContent = JSON.stringify(buildOpenCodeConfig(isOnboarding), null, 2) + "\n";
  writeIfChanged(ocConfigPath, ocContent);

  const tuiConfigPath = path.join(configDir, "tui.json");
  const tuiContent = JSON.stringify(buildOpenCodeTuiConfig(), null, 2) + "\n";
  writeIfChanged(tuiConfigPath, tuiContent);

  // Write librarian agent file when a vault exists
  if (vaultPath !== undefined) {
    try {
      const vaultConfig = readVaultConfigSimple(vaultPath);
      if (vaultConfig) {
        const agentsDir = path.join(configDir, "agents");
        fs.mkdirSync(agentsDir, { recursive: true });
        const agentContent = buildLibrarianAgentFile(vaultConfig, vaultPath);
        writeIfChanged(path.join(agentsDir, "librarian.md"), agentContent);
      }
    } catch {
      // Gracefully skip — no Librarian, but OpenCode still works
    }
  }
}

function launchOpenCode(args: string[], vaultPath?: string): void {
  const isOnboarding = vaultPath === undefined;
  ensureOpenCodeConfig(isOnboarding, vaultPath);

  const configDir = getConfigDir();
  // Selective isolation: brainkit owns the OPENCODE_CONFIG file (overrides on
  // conflict via OpenCode's merge precedence) and overrides OPENCODE_CONFIG_DIR
  // so the user's dotfiles-managed `.opencode/` directory doesn't leak in.
  // OPENCODE_DISABLE_PROJECT_CONFIG kills the upward project walk so vault
  // parent directories can't inject their own `.opencode/` configs. Auth, MCP
  // servers, model defaults from `~/.config/opencode/` continue to merge in —
  // we don't redirect XDG_*_HOME because that would wipe the user's auth.json.
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  };

  if (vaultPath !== undefined) {
    env["BRAINKIT_VAULT_PATH"] = vaultPath;
  }

  // No vault = onboarding — auto-submit initial prompt
  const launchArgs = vaultPath === undefined ? ["--prompt", "Let's set up my first brainkit vault!", ...args] : args;

  const child = spawnHarness("opencode", launchArgs, { stdio: "inherit", env });
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
  {
    name: "Claude Code",
    binaries: ["claude"],
    aliases: ["claude", "cc"],
    launch: launchClaude,
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

  const brainPath = path.resolve(globalConfig.brain_path.replace(/^~/, os.homedir()));
  let vaults: string[];

  try {
    vaults = discoverVaults(brainPath);
  } catch {
    p.log.warn(`Brain directory not found: ${brainPath}`);

    if (process.stdin.isTTY) {
      const shouldReset = await p.confirm({
        message: "Remove all brainkit config and start fresh? (Includes Copilot auth/history; vaults are not touched.)",
      });

      if (p.isCancel(shouldReset) || !shouldReset) {
        p.cancel("Cannot continue without a valid brain directory.");
        process.exit(1);
      }

      // Wipe the entire brainkit config dir to trigger onboarding on next launch.
      try {
        resetBrainkitConfig();
      } catch (err) {
        p.cancel(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      p.log.success("Brainkit config removed. Restarting onboarding...");
      return { vaultPath: undefined, brainPath: undefined };
    }

    p.cancel(`Brain directory not found. Run \`brainkit reset\` to clear config and re-onboard.`);
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

export async function launchHarness(alias: string, args: string[], vaultPath?: string): Promise<void> {
  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    p.cancel(`Unknown harness: ${alias}`);
    process.exit(1);
  }

  if (!isInstalled(harness.binaries)) {
    p.cancel(`${harness.name} is not installed.`);
    process.exit(1);
  }

  await maybeCheckHarnessVersion(harness.name);
  p.outro(`Launching ${harness.name}...`);
  harness.launch(args, vaultPath);
}

export async function detectAndLaunch(args: string[], vaultPath?: string): Promise<void> {
  const available = HARNESSES.filter((h) => isInstalled(h.binaries));

  if (available.length === 0) {
    p.cancel("No supported harness found. Install OpenCode, Copilot CLI, or Claude Code.");
    process.exit(1);
  }

  if (available.length === 1) {
    const harness = available[0];
    if (harness !== undefined) {
      await maybeCheckHarnessVersion(harness.name);
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
      await maybeCheckHarnessVersion(defaultHarness.name);
      p.outro(`Launching ${defaultHarness.name}...`);
      defaultHarness.launch(args, vaultPath);
      return;
    }
  }

  // Non-TTY — can't prompt
  if (!process.stdin.isTTY) {
    p.cancel("Multiple harnesses found. Specify one: brainkit oc | brainkit copilot | brainkit claude");
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

  await maybeCheckHarnessVersion(selected.name);
  p.outro(`Launching ${selected.name}...`);
  selected.launch(args, vaultPath);
}
