// Regression test for the "no theme / no plugin loads" bug:
// `core/*.ts` files use `.js` import specifiers that don't resolve when bun
// loads `opencode/server.ts` and `opencode/tui.tsx` from inside `node_modules`.
// The fix is to generate `core/<name>.js` shims at prepack time.
//
// We drive the generator against a tempdir mirror of `core/` instead of the
// real directory — the real `core/` is being imported by parallel vitest
// workers, and mutating it from a test races them and produces flaky
// `Cannot find module '/core/index.js'` failures across the suite.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { generateShims, isShimmable, listCoreSources, shimBody } from "../../scripts/generate-core-shims.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const realCoreDir = path.join(repoRoot, "core");

/**
 * Mirror the shippable `*.ts` files from the real `core/` into `dest`.
 * We only need filenames + nominal contents for the generator under test;
 * we don't need (or want) the full directory tree.
 */
function mirrorCoreSources(dest: string): string[] {
  const sources = fs
    .readdirSync(realCoreDir, { withFileTypes: true })
    .filter((e) => e.isFile() && isShimmable(e.name))
    .map((e) => e.name);
  for (const name of sources) {
    fs.writeFileSync(path.join(dest, name), `// fixture for ${name}\n`, "utf-8");
  }
  return sources;
}

describe("core/*.js shim generator", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brainkit-shim-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits one .js shim per shippable core/*.ts source", () => {
    const sources = mirrorCoreSources(tmpDir);
    expect(sources.length).toBeGreaterThan(0);

    const written = generateShims(tmpDir);
    expect(written.sort()).toEqual(sources.map((s) => s.replace(/\.ts$/, ".js")).sort());

    for (const source of sources) {
      const shimName = source.replace(/\.ts$/, ".js");
      const shimPath = path.join(tmpDir, shimName);
      expect(fs.existsSync(shimPath), `expected shim ${shimName} for ${source}`).toBe(true);

      // The shim must use an explicit `.ts` extension. Bun does not perform
      // `.js`→`.ts` fallback inside node_modules, so an extensionless or
      // `.js`-style re-export here would reintroduce the original bug.
      const body = fs.readFileSync(shimPath, "utf-8");
      const base = source.replace(/\.ts$/, "");
      expect(body).toContain(`./${base}.ts`);
    }
  });

  it("does not generate shims for test or declaration files", () => {
    mirrorCoreSources(tmpDir);
    // Add files that must be excluded.
    fs.writeFileSync(path.join(tmpDir, "vault.test.ts"), "// fixture\n", "utf-8");
    fs.writeFileSync(path.join(tmpDir, "vault.spec.ts"), "// fixture\n", "utf-8");
    fs.writeFileSync(path.join(tmpDir, "globals.d.ts"), "// fixture\n", "utf-8");

    generateShims(tmpDir);

    for (const entry of fs.readdirSync(tmpDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      expect(entry.name.endsWith(".test.js")).toBe(false);
      expect(entry.name.endsWith(".spec.js")).toBe(false);
      // No `.d.js` either — `.d.ts` shouldn't produce a shim at all.
      expect(entry.name).not.toBe("globals.d.js");
      expect(entry.name).not.toBe("globals.js");
    }
  });

  it("throws when the directory is missing", () => {
    expect(() => generateShims(path.join(tmpDir, "does-not-exist"))).toThrow(/core directory not found/);
  });

  it("throws when no shippable sources exist", () => {
    expect(() => generateShims(tmpDir)).toThrow(/no shippable/);
  });

  it("shimBody uses an explicit .ts extension", () => {
    expect(shimBody("vault.ts")).toContain('./vault.ts"');
    expect(shimBody("vault.ts")).not.toMatch(/\.\/vault"/);
    expect(shimBody("vault.ts")).not.toMatch(/\.\/vault\.js/);
  });

  it("isShimmable accepts plain .ts and rejects test/spec/d.ts", () => {
    expect(isShimmable("vault.ts")).toBe(true);
    expect(isShimmable("vault.test.ts")).toBe(false);
    expect(isShimmable("vault.spec.ts")).toBe(false);
    expect(isShimmable("globals.d.ts")).toBe(false);
    expect(isShimmable("vault.js")).toBe(false);
    expect(isShimmable("README.md")).toBe(false);
  });

  // Sanity check: verify the helpers that walk the real directory agree on
  // what's shippable. This is read-only — no mutation, safe to run in
  // parallel with other workers importing `core/index.ts`.
  it("listCoreSources(realCoreDir) returns only shippable .ts files", () => {
    const real = listCoreSources(realCoreDir);
    expect(real.length).toBeGreaterThan(0);
    for (const name of real) {
      expect(isShimmable(name)).toBe(true);
    }
  });
});
