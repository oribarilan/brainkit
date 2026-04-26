import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import { getConfigDir } from "../core/index.js";
import { version as brainkitVersion } from "./version.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HarnessVersionMeta {
  binary: string;
  npmPackage: string;
  versionArgs: string[];
  parseVersion: (output: string) => string;
  updateCommand: string;
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
    updateCommand: "opencode upgrade",
  },
  "Copilot CLI": {
    binary: "copilot",
    npmPackage: "@github/copilot",
    versionArgs: ["--version"],
    parseVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match?.[1] ?? output.trim();
    },
    updateCommand: "copilot update",
  },
};

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

export function getLatestNpmVersion(npmPackage: string): string | null {
  try {
    const output = execFileSync("npm", ["view", npmPackage, "version"], {
      stdio: "pipe",
      timeout: 10_000,
      shell: process.platform === "win32",
    }).toString();
    return output.trim();
  } catch {
    return null;
  }
}

export function isOlderThan(installed: string, latest: string): boolean {
  const parse = (v: string): number[] => v.replace(/-.*$/, "").split(".").map(Number);
  const [a1 = 0, a2 = 0, a3 = 0] = parse(installed);
  const [b1 = 0, b2 = 0, b3 = 0] = parse(latest);
  if (isNaN(a1) || isNaN(b1)) return false;
  if (a1 !== b1) return a1 < b1;
  if (a2 !== b2) return a2 < b2;
  return a3 < b3;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function maybeCheckHarnessVersion(harnessName: string): Promise<void> {
  // Skip in non-TTY (can't prompt)
  if (!process.stdin.isTTY) return;

  const meta = HARNESS_VERSION_META[harnessName];
  if (!meta) return;

  const configDir = getConfigDir();

  // Only check on first run or brainkit version change
  if (!shouldCheckVersion(configDir, brainkitVersion)) return;

  const installed = getInstalledVersion(meta);
  const latest = getLatestNpmVersion(meta.npmPackage);

  // If either check failed, skip silently — don't write marker so we retry next time
  if (installed === null || latest === null) return;

  // Successfully checked — write marker so we don't check again until brainkit updates
  writeVersionMarker(configDir, brainkitVersion);

  // Up to date
  if (!isOlderThan(installed, latest)) return;

  // Outdated — suggest update
  const shouldUpdate = await p.confirm({
    message: `${harnessName} update available (${installed} → ${latest}). Run "${meta.updateCommand}"?`,
  });

  if (p.isCancel(shouldUpdate) || !shouldUpdate) return;

  p.log.info(`Run: ${meta.updateCommand}`);
  process.exit(0);
}
