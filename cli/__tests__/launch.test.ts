import { describe, it, expect } from "vitest";

import { buildOpenCodeConfig } from "../launch.js";

describe("buildOpenCodeConfig", () => {
  it("uses top-level permission: 'allow' during onboarding", () => {
    const cfg = buildOpenCodeConfig(true);
    expect(cfg["permission"]).toBe("allow");
    expect(cfg["agent"]).toBeUndefined();
  });

  it("omits permission when not onboarding", () => {
    const cfg = buildOpenCodeConfig(false);
    expect(cfg["permission"]).toBeUndefined();
    expect(cfg["agent"]).toBeUndefined();
  });

  it("always sets schema and plugin", () => {
    for (const onboarding of [true, false]) {
      const cfg = buildOpenCodeConfig(onboarding);
      expect(cfg["$schema"]).toBe("https://opencode.ai/config.json");
      expect(cfg["plugin"]).toEqual(["@2brain/brainkit"]);
    }
  });

  it("never nests a string permission under agent.<name> (regression)", () => {
    // Regression: prior versions wrote `agent.build.permission: "allow"`,
    // which OpenCode's schema rejects (nested permissions require an object).
    // The validator iterated the string character-by-character, producing
    // errors like: Expected PermissionActionConfig, got "a" / "l" / "l" / "o" / "w".
    const cfg = buildOpenCodeConfig(true);
    const agent = cfg["agent"] as Record<string, { permission?: unknown }> | undefined;
    if (agent) {
      for (const a of Object.values(agent)) {
        expect(typeof a.permission).not.toBe("string");
      }
    }
  });
});
