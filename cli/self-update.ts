import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import * as p from "@clack/prompts";
import { getConfigDir, readGlobalConfig, writeGlobalConfig } from "../core/index.js";
import { version as brainkitVersion } from "./version.js";
import { isOlderThan, getLatestNpmVersion, getNpmVersions } from "./version-utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMESTAMP_FILE = "last-update-check";
const THROTTLE_MS = 86_400_000; // 24 hours
const GITHUB_RELEASES_URL = "https://api.github.com/repos/oribarilan/brainkit/releases";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isNpx(): boolean {
  return (process.argv[1] ?? "").includes("/_npx/");
}

export function shouldThrottleCheck(configDir: string): boolean {
  const filePath = path.join(configDir, TIMESTAMP_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    const ts = new Date(raw).getTime();
    if (isNaN(ts)) return false;
    return Date.now() - ts < THROTTLE_MS;
  } catch {
    return false;
  }
}

export function writeCheckTimestamp(configDir: string): void {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, TIMESTAMP_FILE), new Date().toISOString() + "\n", "utf-8");
}

export function cleanSkipVersions(versions: string[], currentVersion: string): string[] {
  return versions.filter((v) => v !== currentVersion && !isOlderThan(v, currentVersion));
}

export function detectPackageManager(): string {
  // Primary: resolve the binary path (fall back to raw argv if realpathSync fails)
  const rawPath = process.argv[1] ?? "";
  let resolved: string;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch {
    resolved = rawPath;
  }
  if (resolved.includes("/.bun/")) return "bun";
  if (resolved.includes("/pnpm/") || resolved.includes("/.pnpm-global/")) return "pnpm";
  if (resolved.includes("/.yarn/") || resolved.includes("/yarn/global/")) return "yarn";

  // Secondary: npm_config_user_agent
  const ua = process.env["npm_config_user_agent"] ?? "";
  if (ua.length > 0) {
    const token = ua.split("/")[0] ?? "";
    if (token.length > 0 && ["bun", "pnpm", "yarn"].includes(token)) return token;
  }

  return "npm";
}

export function getUpdateCommand(pm: string, version?: string): { binary: string; args: string[] } {
  const pkg = `@2brain/brainkit@${version ?? "latest"}`;
  switch (pm) {
    case "pnpm":
      return { binary: "pnpm", args: ["add", "-g", pkg] };
    case "yarn":
      return { binary: "yarn", args: ["global", "add", pkg] };
    case "bun":
      return { binary: "bun", args: ["add", "-g", pkg] };
    default:
      return { binary: "npm", args: ["install", "-g", pkg] };
  }
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

interface GitHubRelease {
  tag_name: string;
  body: string;
}

export function formatReleaseBody(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const headerMatch = line.match(/^###\s+(.+)/);
      if (headerMatch) return `  ${headerMatch[1]}`;
      if (line.startsWith("- ")) return `    ${line}`;
      return line;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function formatChangelog(releases: GitHubRelease[], currentVersion: string, latestVersion: string): string {
  const relevant = releases
    .map((r) => ({ ...r, version: r.tag_name.replace(/^v/, "") }))
    .filter((r) => isOlderThan(currentVersion, r.version) && !isOlderThan(latestVersion, r.version))
    .sort((a, b) => (isOlderThan(a.version, b.version) ? 1 : -1));

  if (relevant.length === 0) return "";

  return relevant
    .map((r) => {
      const body = formatReleaseBody(r.body);
      return body.length > 0 ? `v${r.version}\n${body}` : `v${r.version}`;
    })
    .join("\n\n");
}

export async function fetchChangelog(currentVersion: string, latestVersion: string): Promise<string | null> {
  try {
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const releases = (await response.json()) as GitHubRelease[];
    const formatted = formatChangelog(releases, currentVersion, latestVersion);
    return formatted.length > 0 ? formatted : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Update execution
// ---------------------------------------------------------------------------

/** Install a brainkit version. Returns true on success, false on failure. */
export function installSelfUpdate(version?: string): boolean {
  const pm = detectPackageManager();
  const { binary, args } = getUpdateCommand(pm, version);
  try {
    execFileSync(binary, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    return true;
  } catch {
    p.log.error(`Update failed. Run manually: ${binary} ${args.join(" ")}`);
    return false;
  }
}

function runUpdateAndRelaunch(): Promise<void> {
  if (!installSelfUpdate()) return Promise.resolve();

  p.log.success("Updated! Restarting...");

  // Spawn the new brainkit child and HALT the parent until it exits. Without
  // this await, control returns to main() in the parent process, which then
  // races the child for stdin (showing duplicate prompts) and corrupts the
  // user's session. We must not let the parent do anything else after the
  // relaunch — the child fully owns the rest of the user interaction.
  return new Promise((resolve) => {
    const nodeBin = process.argv[0] ?? process.execPath;
    const child = spawn(nodeBin, process.argv.slice(1), { stdio: "inherit" });
    child.on("exit", (code) => {
      // Exit the parent with the child's status. resolve() is unreachable in
      // practice (process.exit terminates first) but kept for type safety.
      process.exit(code ?? 0);
      resolve();
    });
    child.on("error", (err) => {
      p.log.error(`Failed to relaunch brainkit: ${err.message}`);
      process.exit(1);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core update check — queries npm, compares versions, prompts, and updates.
 * Called by `brainkit update [version]`.
 */
export async function checkForSelfUpdate(targetVersion?: string): Promise<void> {
  const configDir = getConfigDir();
  const current = brainkitVersion;

  let target: string;

  if (targetVersion !== undefined) {
    // Explicit version given
    target = targetVersion;
  } else {
    // Show version picker
    const versions = getNpmVersions("@2brain/brainkit", 5);
    if (versions === null || versions.length === 0) {
      p.log.warn("Could not fetch available versions.");
      return;
    }

    writeCheckTimestamp(configDir);

    const maxVersionLen = Math.max(...versions.map((e) => e.version.length));
    const selected = await p.select({
      message: "Pick a version to install",
      options: versions.map((entry, i) => {
        const ver = `v${entry.version.padEnd(maxVersionLen)}`;
        let label = `${ver}  (${entry.date})`;
        if (i === 0) label += "  · latest";
        if (entry.version === current) label += "  <-- you are here";
        return { value: entry.version, label };
      }),
    });

    if (p.isCancel(selected)) return;
    target = selected;
  }

  if (target === current) {
    p.log.info(`Already on v${current}.`);
    return;
  }

  const isUpgrade = isOlderThan(current, target);

  // Show changelog for upgrades
  if (isUpgrade) {
    const changelog = await fetchChangelog(current, target);
    if (changelog !== null) {
      p.note(changelog, "What's new");
    }
  }

  const action = isUpgrade ? "Upgrade" : "Downgrade";
  const shouldProceed = await p.confirm({
    message: `${action} from v${current} to v${target}?`,
  });
  if (p.isCancel(shouldProceed) || !shouldProceed) return;

  if (installSelfUpdate(target)) {
    p.log.success(`Updated to v${target}.`);
  }
}

export async function maybeCheckForSelfUpdate(): Promise<void> {
  // Skip in non-TTY
  if (!process.stdin.isTTY) return;

  // Skip if running via npx
  if (isNpx()) return;

  // Check throttle
  const configDir = getConfigDir();
  if (shouldThrottleCheck(configDir)) return;

  // Query npm
  const latest = getLatestNpmVersion("@2brain/brainkit");
  if (latest === null) return; // Network fail — don't write timestamp, retry next time

  // Write timestamp (successful query)
  writeCheckTimestamp(configDir);

  // Compare
  const current = brainkitVersion;
  if (!isOlderThan(current, latest)) return;

  // Clean and check skip list
  const config = readGlobalConfig();
  if (config?.skip_versions) {
    const cleaned = cleanSkipVersions(config.skip_versions, current);
    // Persist cleaned list if it changed
    if (cleaned.length !== config.skip_versions.length) {
      config.skip_versions = cleaned.length > 0 ? cleaned : undefined;
      writeGlobalConfig(config);
    }
    if (cleaned.includes(latest)) return;
  }

  // Fetch and display changelog (best-effort — don't block on failure)
  const changelog = await fetchChangelog(current, latest);
  if (changelog !== null) {
    p.note(changelog, "What's new");
  }

  // Prompt
  const action = await p.select({
    message: `brainkit update available (${current} → ${latest})`,
    options: [
      { value: "update" as const, label: "Update now" },
      { value: "skip" as const, label: "Skip this version" },
      { value: "later" as const, label: "Remind me later" },
    ],
  });

  if (p.isCancel(action) || action === "later") return;

  if (action === "skip") {
    const cfg = readGlobalConfig() ?? { version: 1, brain_path: "" };
    const skipped = cfg.skip_versions ?? [];
    if (!skipped.includes(latest)) {
      cfg.skip_versions = [...skipped, latest];
      writeGlobalConfig(cfg);
    }
    return;
  }

  // action === "update"
  await runUpdateAndRelaunch();
}
