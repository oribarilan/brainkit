import * as fs from "node:fs";
import * as path from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { readGlobalConfig, writeGlobalConfig } from "./vault.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REMOTE_PACKAGE_URL = "https://raw.githubusercontent.com/oribarilan/brainkit/main/package.json";

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function getLocalVersion(): string {
  const extensionDir = path.dirname(new URL(import.meta.url).pathname);
  const pkgPath = path.resolve(extensionDir, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return pkg.version ?? "0.0.0";
}

function isNewerVersion(current: string, remote: string): boolean {
  const c = current.split(".").map(Number);
  const r = remote.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((r[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Changelog parsing
// ---------------------------------------------------------------------------

function parseChangelog(content: string, fromVersion: string, toVersion: string): string | null {
  // fromVersion = lastSeenVersion (old), toVersion = currentVersion (new)
  // Return entries from toVersion down to (but not including) fromVersion
  const sections = content.split(/^## /m).filter((s) => s.trim());
  const relevant: string[] = [];
  let collecting = false;

  for (const section of sections) {
    const versionMatch = section.match(/^\[([^\]]+)\]/);
    if (!versionMatch) continue;
    const version = versionMatch[1];

    if (version === toVersion) collecting = true;
    if (version === fromVersion) break;
    if (collecting) relevant.push("## " + section.trim());
  }

  return relevant.length > 0 ? relevant.join("\n\n") : null;
}

// ---------------------------------------------------------------------------
// Remote update check
// ---------------------------------------------------------------------------

async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    const response = await fetch(REMOTE_PACKAGE_URL);
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: string };
    if (data.version && isNewerVersion(currentVersion, data.version)) {
      return data.version;
    }
  } catch {
    // Network error — silently skip
  }
  return null;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupUpdater(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    const currentVersion = getLocalVersion();
    const theme = ctx.ui.theme;
    const globalConfig = readGlobalConfig();

    // --- Changelog check ---
    if (globalConfig) {
      const lastSeen = globalConfig.lastSeenVersion;

      if (lastSeen && lastSeen !== currentVersion && isNewerVersion(lastSeen, currentVersion)) {
        // New version just installed — show changelog
        const extensionDir = path.dirname(new URL(import.meta.url).pathname);
        const changelogPath = path.resolve(extensionDir, "..", "CHANGELOG.md");
        try {
          const content = fs.readFileSync(changelogPath, "utf-8");
          const entries = parseChangelog(content, lastSeen, currentVersion);
          if (entries) {
            ctx.ui.notify(`[brainkit] Updated to v${currentVersion}\n\n${entries}`, "info");
          } else {
            ctx.ui.notify(`[brainkit] Updated to v${currentVersion}`, "info");
          }
        } catch {
          ctx.ui.notify(`[brainkit] Updated to v${currentVersion}`, "info");
        }
      }

      // Update lastSeenVersion
      if (!lastSeen || lastSeen !== currentVersion) {
        writeGlobalConfig({
          ...globalConfig,
          lastSeenVersion: currentVersion,
        });
      }
    }

    // --- Remote update check (non-blocking) ---
    checkForUpdate(currentVersion).then((remoteVersion) => {
      if (remoteVersion) {
        ctx.ui.setStatus(
          "brainkit-update",
          theme.fg("warning", `v${remoteVersion} available`) +
            theme.fg("dim", " · run: ") +
            theme.fg("accent", "pi update"),
        );
      }
    });
  });
}
