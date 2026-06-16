import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as p from "@clack/prompts";
import { execFileSync } from "node:child_process";
import { readGlobalConfig, writeGlobalConfig, discoverVaults, getConfigDir } from "../core/index.js";
import { launchCopilot } from "./copilot.js";
import { launchClaude } from "./claude.js";
import { maybeCheckHarnessVersion } from "./harness-version.js";
import { spawnHarness } from "./spawn.js";
import { resetBrainkitConfig } from "./reset.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VaultSelection =
  | { mode: "single"; vaultPath: string; brainPath: string }
  | { mode: "all"; brainPath: string }
  | { mode: "onboarding" };

export type LaunchTarget =
  | { mode: "single"; vaultPath: string }
  | { mode: "all"; brainPath: string }
  | { mode: "onboarding" };

const ALL_VAULT_RESERVED = /^all$/i;

// ---------------------------------------------------------------------------
// Harness definitions
// ---------------------------------------------------------------------------

interface Harness {
  name: string;
  binaries: string[];
  aliases: string[];
  launch: (args: string[], target: LaunchTarget) => void;
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

function ensureOpenCodeConfig(isOnboarding: boolean): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const ocConfigPath = path.join(configDir, "opencode.json");
  const ocContent = JSON.stringify(buildOpenCodeConfig(isOnboarding), null, 2) + "\n";
  writeIfChanged(ocConfigPath, ocContent);

  const tuiConfigPath = path.join(configDir, "tui.json");
  const tuiContent = JSON.stringify(buildOpenCodeTuiConfig(), null, 2) + "\n";
  writeIfChanged(tuiConfigPath, tuiContent);
}

function launchOpenCode(args: string[], target: LaunchTarget): void {
  const isOnboarding = target.mode === "onboarding";
  ensureOpenCodeConfig(isOnboarding);

  const configDir = getConfigDir();
  const env: Record<string, string | undefined> = {
    ...process.env,
    OPENCODE_CONFIG: path.join(configDir, "opencode.json"),
    OPENCODE_TUI_CONFIG: path.join(configDir, "tui.json"),
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  };

  if (target.mode === "single") {
    env["BRAINKIT_VAULT_PATH"] = target.vaultPath;
  } else if (target.mode === "all") {
    env["BRAINKIT_ALL_VAULTS"] = "1";
  }

  // Onboarding — auto-submit initial prompt
  const launchArgs = isOnboarding ? ["--prompt", "Let's set up my first brainkit vault!", ...args] : args;

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

  // Filter out vaults named "all" from the picker to avoid visual collision
  const pickerVaults = vaults.filter((v) => !ALL_VAULT_RESERVED.test(v));

  const options = [
    { value: "__all__", label: "+ All vaults" },
    ...pickerVaults.map((v) => ({ value: v, label: v })),
  ];

  const selected = await p.select({
    message: "Select a vault",
    options,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  return selected;
}

export async function selectVault(
  vaultFlag: string | null,
): Promise<VaultSelection> {
  const globalConfig = readGlobalConfig();
  if (globalConfig === null || !globalConfig.brain_path) {
    return { mode: "onboarding" };
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
      return { mode: "onboarding" };
    }

    p.cancel(`Brain directory not found. Run \`brainkit reset\` to clear config and re-onboard.`);
    process.exit(1);
  }

  // Warn if a vault named "all" exists (any case)
  if (vaults.some((v) => ALL_VAULT_RESERVED.test(v))) {
    p.log.warn('"all" is a reserved vault name in brainkit. A vault with this name may conflict with --vault all.');
  }

  // --vault all (case-insensitive reserved name)
  if (vaultFlag !== null && ALL_VAULT_RESERVED.test(vaultFlag)) {
    if (vaults.length === 0) {
      p.cancel("No vaults found. Run brainkit to set up your first vault.");
      process.exit(1);
    }
    return { mode: "all", brainPath };
  }

  // Explicit --vault flag (specific vault name)
  if (vaultFlag !== null) {
    if (!vaults.includes(vaultFlag)) {
      const msg =
        vaults.length > 0
          ? `Vault "${vaultFlag}" not found. Available: ${vaults.join(", ")}`
          : `Vault "${vaultFlag}" not found.`;
      p.cancel(msg);
      process.exit(1);
    }
    return { mode: "single", vaultPath: path.join(brainPath, vaultFlag), brainPath };
  }

  // 0 vaults — fresh brain
  if (vaults.length === 0) {
    return { mode: "single", vaultPath: brainPath, brainPath };
  }

  // 1 vault — auto-select
  if (vaults.length === 1) {
    const single = vaults[0];
    if (single !== undefined) {
      return { mode: "single", vaultPath: path.join(brainPath, single), brainPath };
    }
  }

  // 2+ vaults — interactive prompt with "All vaults" option
  const selected = await promptVaultSelection(vaults);
  if (selected === "__all__") {
    return { mode: "all", brainPath };
  }
  return { mode: "single", vaultPath: path.join(brainPath, selected), brainPath };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isHarnessAlias(arg: string): boolean {
  return HARNESSES.some((h) => h.aliases.includes(arg));
}

/** Resolve a harness alias (e.g. "oc") to its display name (e.g. "OpenCode"). */
export function resolveHarnessName(alias: string): string | undefined {
  return HARNESSES.find((h) => h.aliases.includes(alias))?.name;
}

export async function launchHarness(alias: string, args: string[], target: LaunchTarget): Promise<void> {
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
  harness.launch(args, target);
}

// ---------------------------------------------------------------------------
// Default harness command
// ---------------------------------------------------------------------------

export async function handleDefaultCommand(args: string[]): Promise<void> {
  const alias = args[0];
  if (alias === undefined) {
    await showOrPickDefault();
    return;
  }

  const harness = HARNESSES.find((h) => h.aliases.includes(alias));
  if (!harness) {
    const allAliases = HARNESSES.flatMap((h) => h.aliases).join(", ");
    p.cancel(`Unknown harness alias: "${alias}". Valid aliases: ${allAliases}`);
    process.exit(1);
  }

  const canonicalAlias = harness.aliases[0];
  const globalConfig = readGlobalConfig();
  const currentDefault = globalConfig?.default_harness;

  // Cross-alias aware: "cc" and "claude" resolve to the same harness
  if (currentDefault !== undefined && currentDefault !== "") {
    const currentHarness = HARNESSES.find((h) => h.aliases.includes(currentDefault));
    if (currentHarness === harness) {
      p.log.info(`Default harness is already ${harness.name}.`);
      return;
    }
  }

  const config = globalConfig ?? { version: 1, brain_path: "" };
  config.default_harness = canonicalAlias;
  writeGlobalConfig(config);
  p.log.success(`Default harness set to ${harness.name}.`);

  if (!isInstalled(harness.binaries)) {
    p.log.warn(
      `${harness.binaries[0]} is not found on PATH. The default won't take effect until ${harness.name} is installed.`,
    );
  }
}

async function showOrPickDefault(): Promise<void> {
  const globalConfig = readGlobalConfig();
  const currentDefault = globalConfig?.default_harness;

  if (!process.stdin.isTTY) {
    if (currentDefault !== undefined && currentDefault !== "") {
      const harness = HARNESSES.find((h) => h.aliases.includes(currentDefault));
      console.log(`Default harness: ${harness?.name ?? currentDefault}`);
    } else {
      console.log("No default harness set.");
    }
    return;
  }

  // TTY: interactive picker — all harnesses enabled (unlike detectAndLaunch
  // which disables uninstalled ones, since setting a preference doesn't
  // require the harness to be installed yet)
  const currentHarness =
    currentDefault !== undefined && currentDefault !== ""
      ? HARNESSES.find((h) => h.aliases.includes(currentDefault))
      : undefined;

  const selected = await p.select({
    message: "Select your default harness",
    initialValue: currentHarness,
    options: HARNESSES.map((h) => {
      const installed = isInstalled(h.binaries);
      const isCurrent = h === currentHarness;
      const parts = [h.name];
      if (isCurrent) parts.push("(current)");
      if (!installed) parts.push("(not installed)");
      return { value: h, label: parts.join(" ") };
    }),
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const config = globalConfig ?? { version: 1, brain_path: "" };
  config.default_harness = selected.aliases[0];
  writeGlobalConfig(config);
  p.log.success(`Default harness set to ${selected.name}.`);
}

export async function detectAndLaunch(args: string[], target: LaunchTarget): Promise<void> {
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
      harness.launch(args, target);
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
      defaultHarness.launch(args, target);
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
  selected.launch(args, target);
}
