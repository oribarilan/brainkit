import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walk up from this file until we find the `@2brain/brainkit` package.json
 * and return the directory containing it.
 *
 * Used by harness launchers (`copilot.ts`, `claude.ts`) to resolve assets
 * shipped with the package — `<pkgRoot>/skills/`, `<pkgRoot>/claude/`,
 * `<pkgRoot>/dist/...` — regardless of whether we're running from source
 * (`cli/`) or compiled (`dist/cli/`).
 */
export function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    try {
      const content = JSON.parse(fs.readFileSync(candidate, "utf-8")) as { name?: string };
      if (content.name === "@2brain/brainkit") return dir;
    } catch {
      // not found or not parseable, keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find @2brain/brainkit package root");
    dir = parent;
  }
}
