import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { themePath } from "../theme-path.js";

// ---------------------------------------------------------------------------
// The brainkit theme is currently dormant — it is not installed by the plugin
// and not declared in tui.json (see opencode/tui.tsx and cli/launch.ts for the
// reason). We keep the theme JSON and the path resolver in the repo so we can
// re-enable the theme later without rebuilding it from scratch.
//
// These tests pin the theme JSON's *validity* — file exists, parses as JSON,
// has the expected top-level shape — so the dormant asset doesn't quietly rot
// in the repo. They do not assert anything about plugin wiring or harness
// installation; that's intentional, those callsites have been removed.
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
