import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import { getConfigDir } from "../core/index.js";
import { version as brainkitVersion } from "./version.js";
import { isOlderThan, getLatestNpmVersion } from "./version-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HarnessVersionMeta {
  binary: string;
  npmPackage: string;
  versionArgs: string[];
  parseVersion: (output: string) => string;
  updateCommand: { binary: string; args: string[] };
}

// ---------------------------------------------------------------------------
// Harness version metadata
// ---------------------------------------------------------------------------

const HARNESS_VERSION_META: Record<string, HarnessVersionMeta> = {
  OpenCode: {
    binary: "opencode",
    npmPackage: "opencode-ai",
    versionArgs: ["--version"],
    parseVersion: (output) => output.trim(),
    updateCommand: { binary: "opencode", args: ["upgrade"] },
  },
  "Copilot CLI": {
    binary: "copilot",
    npmPackage: "@github/copilot",
    versionArgs: ["--version"],
    parseVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match?.[1] ?? output.trim();
    },
    updateCommand: { binary: "copilot", args: ["update"] },
  },
};

function formatUpdateCommand(cmd: { binary: string; args: string[] }): string {
  return [cmd.binary, ...cmd.args].join(" ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MARKER_FILE = "last-brainkit-version";

export function shouldCheckVersion(configDir: string, currentVersion: string): boolean {
  const markerPath = path.join(configDir, MARKER_FILE);
  try {
    const existing = fs.readFileSync(markerPath, "utf-8").trim();
    return existing !== currentVersion;
  } catch {
    // Marker doesn't exist — first run or reset
    return true;
  }
}

export function writeVersionMarker(configDir: string, currentVersion: string): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, MARKER_FILE), currentVersion + "\n", "utf-8");
}

export function getInstalledVersion(meta: HarnessVersionMeta): string | null {
  try {
    const output = execFileSync(meta.binary, meta.versionArgs, {
      stdio: "pipe",
      timeout: 5_000,
      shell: process.platform === "win32",
    }).toString();
    return meta.parseVersion(output);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function runHarnessCheck(meta: HarnessVersionMeta, harnessName: string, showUpToDate: boolean): Promise<void> {
  const configDir = getConfigDir();

  const installed = getInstalledVersion(meta);
  const latest = getLatestNpmVersion(meta.npmPackage);

  // If either check failed, skip silently
  if (installed === null || latest === null) return;

  // Successfully checked — write marker
  writeVersionMarker(configDir, brainkitVersion);

  // Up to date
  if (!isOlderThan(installed, latest)) {
    if (showUpToDate) p.log.info(`${harnessName} is up to date (${installed}).`);
    return;
  }

  // Outdated — suggest update
  const shouldUpdate = await p.confirm({
    message: `${harnessName} update available (${installed} → ${latest}). Run "${formatUpdateCommand(meta.updateCommand)}"?`,
  });

  if (p.isCancel(shouldUpdate) || !shouldUpdate) return;

  const cmdString = formatUpdateCommand(meta.updateCommand);
  p.log.info(`Running: ${cmdString}`);

  runUpdateCommand(meta.updateCommand, cmdString, harnessName);
}

/**
 * Core harness version check — gets installed/latest versions, compares, prompts, updates.
 * Does NOT check TTY or version marker. Silently skips unknown harness names.
 */
export async function checkHarnessVersion(harnessName: string): Promise<void> {
  const meta = HARNESS_VERSION_META[harnessName];
  if (!meta) return;
  await runHarnessCheck(meta, harnessName, true);
}

export async function maybeCheckHarnessVersion(harnessName: string): Promise<void> {
  // Skip in non-TTY (can't prompt)
  if (!process.stdin.isTTY) return;

  const meta = HARNESS_VERSION_META[harnessName];
  if (!meta) return;

  // Only check on first run or brainkit version change
  if (!shouldCheckVersion(getConfigDir(), brainkitVersion)) return;

  await runHarnessCheck(meta, harnessName, false);
}

/**
 * Run an update command that may itself manipulate the TTY (raw mode, alt
 * screen, etc.). Wraps `execFileSync` with stdio handover/restore + a no-op
 * stdin error listener to swallow the spurious EIO Node throws when the child
 * returns the TTY in a transient state. See:
 *   - https://github.com/google-gemini/gemini-cli/pull/15410
 *   - https://github.com/nodejs/node/issues/51238
 *   - https://github.com/nodejs/node/issues/12101
 */
function runUpdateCommand(cmd: { binary: string; args: string[] }, cmdString: string, harnessName: string): void {
  // Hand the TTY cleanly to the child: stop reading, drop raw mode (clack
  // leaves it on between prompts), and don't keep the loop alive on fd 0.
  const wasRaw = process.stdin.isTTY ? process.stdin.isRaw : false;
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Not a TTY; ignore.
    }
  }
  process.stdin.pause();
  if (typeof process.stdin.unref === "function") process.stdin.unref();

  // Swallow spurious EIO/EPIPE from the parent's stdin after the child exits.
  // The error often fires asynchronously (next tick or later), so leave the
  // listener attached for the rest of the process lifetime.
  const swallowTtyError = (err: NodeJS.ErrnoException): void => {
    if (err.code === "EIO" || err.code === "EPIPE" || err.code === "ENOTCONN") return;
    throw err;
  };
  process.stdin.on("error", swallowTtyError);

  try {
    execFileSync(cmd.binary, cmd.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.log.success(`${harnessName} updated.`);
  } catch {
    p.log.error(`Update failed. Run manually: ${cmdString}`);
  } finally {
    // Restore raw mode if it was on before, and re-attach stdin so subsequent
    // prompts (or the spawned harness) can read input. Wrapped in try/catch
    // because the child may have closed the TTY in unexpected ways.
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(wasRaw);
      } catch {
        // Best effort.
      }
    }
    if (typeof process.stdin.ref === "function") process.stdin.ref();
  }
}
