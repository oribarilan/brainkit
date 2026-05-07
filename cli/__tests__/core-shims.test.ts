// Regression test for the "no theme / no plugin loads" bug:
// `core/*.ts` files use `.js` import specifiers that don't resolve when bun
// loads `opencode/server.ts` and `opencode/tui.tsx` from inside `node_modules`.
// The fix is to generate `core/<name>.js` shims at prepack time.
// This test verifies the generator produces a shim for every shippable
// `core/*.ts` source file so we can never silently regress to the broken state.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const coreDir = path.join(repoRoot, "core");
const generatorPath = path.join(repoRoot, "scripts", "generate-core-shims.mjs");

function isShimmable(name: string): boolean {
  if (!name.endsWith(".ts")) return false;
  if (name.endsWith(".d.ts")) return false;
  if (name.endsWith(".test.ts")) return false;
  if (name.endsWith(".spec.ts")) return false;
  return true;
}

function listCoreSources(): string[] {
  const entries = fs.readdirSync(coreDir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && isShimmable(e.name)).map((e) => e.name);
}

describe("core/*.js shim generator", () => {
  // Snapshot any existing shims so we can restore them after the test
  // (devs running `just test` shouldn't end up with stray generated files,
  // and CI shouldn't either).
  const existingShims = new Map<string, string | null>();
  let backupDir: string;

  beforeAll(() => {
    backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-shim-backup-"));
    for (const entry of fs.readdirSync(coreDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        const fullPath = path.join(coreDir, entry.name);
        existingShims.set(entry.name, fs.readFileSync(fullPath, "utf-8"));
      }
    }
  });

  afterAll(() => {
    // Remove every .js the test (or generator) left behind, then restore
    // any pre-existing shims byte-for-byte.
    for (const entry of fs.readdirSync(coreDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        fs.rmSync(path.join(coreDir, entry.name));
      }
    }
    for (const [name, content] of existingShims) {
      if (content !== null) {
        fs.writeFileSync(path.join(coreDir, name), content, "utf-8");
      }
    }
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it("emits one .js shim per shippable core/*.ts source", () => {
    execFileSync("node", [generatorPath], { stdio: "pipe" });

    const sources = listCoreSources();
    expect(sources.length).toBeGreaterThan(0);

    for (const source of sources) {
      const shimName = source.replace(/\.ts$/, ".js");
      const shimPath = path.join(coreDir, shimName);
      expect(fs.existsSync(shimPath), `expected shim ${shimName} for ${source}`).toBe(true);

      // The shim must use an explicit `.ts` extension. Bun does not perform
      // `.js`→`.ts` fallback inside node_modules, so an extensionless or
      // `.js`-style re-export here would reintroduce the original bug.
      const body = fs.readFileSync(shimPath, "utf-8");
      const base = source.replace(/\.ts$/, "");
      expect(body).toContain(`./${base}.ts`);
    }
  });

  it("does not generate shims for test files", () => {
    execFileSync("node", [generatorPath], { stdio: "pipe" });

    // No `*.test.js` or `*.spec.js` should appear in core/.
    for (const entry of fs.readdirSync(coreDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      expect(entry.name.endsWith(".test.js")).toBe(false);
      expect(entry.name.endsWith(".spec.js")).toBe(false);
    }
  });
});
