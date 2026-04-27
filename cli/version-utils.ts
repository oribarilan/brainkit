import { execFileSync } from "node:child_process";

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
