import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// CI guard against cwd-relative paths in api.theme.install(...)
//
// The bug this US fixes was a string-literal cwd-relative path passed to
// theme.install. This guard scans every .ts/.tsx file in opencode/ for
// `theme.install("...")`, `theme.install('...')`, or `` theme.install(`...`) ``
// — i.e. any direct string-literal argument — and fails the build if found.
//
// Acceptable form: `theme.install(themePath)` where themePath is an
// identifier resolved from import.meta.url.
//
// Limitations: this guard does not analyze indirection (variable assignments,
// function returns, computed expressions). It only catches the direct-literal
// form, which is the form the bug took both times it appeared (the original
// cwd-relative bug and the half-fix in commit a7f3f67).
// ---------------------------------------------------------------------------

describe("no cwd-relative theme paths", () => {
  it("opencode/*.{ts,tsx} contains no string-literal arguments to theme.install", () => {
    const opencodeDir = path.join(__dirname, "..");
    const files: string[] = [];

    function walk(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    walk(opencodeDir);

    expect(files.length, "must scan at least one source file").toBeGreaterThan(0);

    // Match: .theme.install( <whitespace> ["'`]
    // i.e. theme.install with a string-literal first arg (any quote style).
    const literalArgPattern = /\.theme\.install\(\s*["'`]/;

    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      if (literalArgPattern.test(src)) {
        offenders.push(path.relative(opencodeDir, file));
      }
    }

    expect(
      offenders,
      `theme.install was called with a string literal in: ${offenders.join(
        ", ",
      )}. Use the exported themePath constant from ./theme-path.ts instead — string-literal paths break when opencode is launched from a directory other than the brainkit repo root.`,
    ).toEqual([]);
  });
});
