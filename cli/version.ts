import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function findPackageJson(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  // Walk up from current file to find the nearest package.json.
  // Works from both source (cli/) and compiled (dist/cli/) locations.
  for (;;) {
    const candidate = path.join(dir, "package.json");
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      // not found at this level, keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("package.json not found");
    dir = parent;
  }
}

const packageJson = JSON.parse(fs.readFileSync(findPackageJson(), "utf-8")) as { version: string };

export const version: string = packageJson.version;
