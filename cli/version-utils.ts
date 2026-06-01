import { execFileSync } from "node:child_process";

export interface NpmVersionEntry {
  version: string;
  date: string; // YYYY-MM-DD
}

/**
 * Fetch the latest `count` published versions of an npm package (excluding prereleases).
 * Returns versions with publish dates, sorted newest-first, or null on failure.
 * Uses `npm view <pkg> time --json` to get both versions and dates in one call.
 */
export function getNpmVersions(npmPackage: string, count: number): NpmVersionEntry[] | null {
  try {
    const output = execFileSync("npm", ["view", npmPackage, "time", "--json"], {
      stdio: "pipe",
      timeout: 10_000,
      shell: process.platform === "win32",
    }).toString();
    const timeMap = JSON.parse(output) as Record<string, string>;
    return Object.entries(timeMap)
      .filter(([key]) => key !== "created" && key !== "modified" && !key.includes("-"))
      .map(([version, iso]) => ({ version, date: iso.slice(0, 10) }))
      .sort((a, b) => (isOlderThan(a.version, b.version) ? 1 : -1))
      .slice(0, count);
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
