import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { themePath } from "../theme-path.js";

// ---------------------------------------------------------------------------
// Path test — pins the runtime-resolved theme path
//
// `themePath` is computed from `import.meta.url` of `opencode/theme-path.ts`,
// which lives in the same directory as `brainkit.json` and `tui.tsx`. The
// runtime plugin imports the same `themePath` constant, so this test is
// asserting on the EXACT path the runtime hands to `api.theme.install`.
//
// This guards against regressions where someone changes theme-path.ts to use
// a cwd-relative idiom, or moves brainkit.json without updating the anchor.
// ---------------------------------------------------------------------------

describe("themePath", () => {
  it("resolves to a real file on disk", () => {
    expect(fs.existsSync(themePath)).toBe(true);
  });

  it("ends with brainkit.json", () => {
    expect(themePath.endsWith("brainkit.json")).toBe(true);
  });

  it("points to a parseable theme JSON with a primary entry", () => {
    const raw = fs.readFileSync(themePath, "utf-8");
    const json = JSON.parse(raw);
    expect(json.theme).toBeDefined();
    expect(json.theme.primary).toBeDefined();
    expect(json.theme.primary.dark).toBeDefined();
    expect(json.theme.primary.light).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Resilience test — pins the structural improvement
//
// The bug this US fixes was: a single failing `await api.theme.install(...)`
// at the top of the `tui` plugin function silently aborted every subsequent
// slot/command registration. Users saw no theme, no logo, no sidebar, no
// tips, no /doctor — and no error.
//
// We can't import tui.tsx into Vitest because it pulls in @opentui/solid +
// solid-js (peer deps not installed for tests). Instead, we read the source
// and assert on its structure: the theme call must be inside a try/catch,
// AND there must be slot/command registrations BELOW the catch block.
//
// This is a source-level structural test, not a runtime test. It's brittle
// to formatting changes but precisely targets the bug class: "one failing
// await above the registrations kills everything."
// ---------------------------------------------------------------------------

describe("tui plugin resilience structure", () => {
  const tuiSource = fs.readFileSync(new URL("../tui.tsx", import.meta.url), "utf-8");

  it("wraps theme.install in a try/catch", () => {
    // Find the try block. It must contain api.theme.install.
    const tryBlockMatch = tuiSource.match(/try\s*\{([\s\S]*?)\}\s*catch/);
    expect(tryBlockMatch, "tui.tsx must contain a try { ... } catch block").toBeTruthy();
    const tryBody = tryBlockMatch![1]!;
    expect(tryBody).toMatch(/api\.theme\.install\s*\(/);
  });

  it("registers slots AFTER the theme try/catch (not before)", () => {
    const catchEnd = tuiSource.search(/\}\s*catch[\s\S]*?\}\s*\n/);
    expect(catchEnd, "tui.tsx must contain a catch block").toBeGreaterThan(-1);

    // Find the position immediately after the catch block closes.
    const catchBlockMatch = tuiSource.match(/\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/);
    expect(catchBlockMatch).toBeTruthy();
    const afterCatchPos = tuiSource.indexOf(catchBlockMatch![0]) + catchBlockMatch![0].length;
    const afterCatch = tuiSource.slice(afterCatchPos);

    // After the catch, we must register slots and commands.
    expect(afterCatch).toMatch(/api\.slots\.register/);
    expect(afterCatch).toMatch(/api\.command\.register/);
  });

  it("logs to console.error on theme failure", () => {
    expect(tuiSource).toMatch(/console\.error\([^)]*\[brainkit\][^)]*\)/);
  });

  it("attempts api.ui.toast on theme failure (guarded by typeof)", () => {
    expect(tuiSource).toMatch(/typeof\s+api\.ui\??\.toast/);
    expect(tuiSource).toMatch(/api\.ui\.toast\s*\(/);
  });

  it("deactivates internal:home-tips AFTER our slot registrations", () => {
    const slotRegMatches = [...tuiSource.matchAll(/api\.slots\.register/g)];
    const deactivateMatch = tuiSource.match(/api\.plugins\.deactivate\(["']internal:home-tips["']\)/);
    expect(slotRegMatches.length, "must register at least one slot").toBeGreaterThan(0);
    expect(deactivateMatch, "must deactivate internal:home-tips").toBeTruthy();
    const lastSlotRegPos = slotRegMatches[slotRegMatches.length - 1]!.index!;
    const deactivatePos = tuiSource.indexOf(deactivateMatch![0]);
    expect(deactivatePos, "deactivate must come AFTER all slot registrations").toBeGreaterThan(lastSlotRegPos);
  });
});
