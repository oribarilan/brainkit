import { describe, it, expect } from "vitest";
import type { BrainkitConfig } from "../types.js";
import type { SectionContext } from "../prompt-sections.js";
import {
  joinSections,
  buildPreamble,
  buildIdentity,
  buildVaultStructure,
  buildKeyFiles,
  buildConventions,
  buildCustomRules,
  buildProfileNudge,
  buildBehavioralRules,
} from "../prompt-sections.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<BrainkitConfig>): BrainkitConfig {
  return {
    version: 1,
    user: {
      name: "Test User",
      role: "Engineer",
      expertise: ["TypeScript", "APIs"],
      tone: "direct",
      ...overrides?.user,
    },
    features: {
      bragfile: false,
      contacts: false,
      ...overrides?.features,
    },
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<SectionContext>): SectionContext {
  return {
    config: makeConfig(overrides?.config ? { ...overrides.config } : undefined),
    vaultPath: "/fake/vault",
    mode: "cli",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

describe("buildPreamble", () => {
  it("includes vault path", () => {
    const result = buildPreamble(makeCtx({ vaultPath: "/my/vault" }));
    expect(result).toContain("/my/vault");
  });

  it("includes 'backed by git' when isGit is true", () => {
    const result = buildPreamble(makeCtx({ isGit: true }));
    expect(result).toContain("backed by git");
  });

  it("omits 'backed by git' when isGit is false and still includes vault path", () => {
    const result = buildPreamble(makeCtx({ isGit: false }));
    expect(result).not.toContain("backed by git");
    expect(result).toContain("/fake/vault");
  });
});

describe("buildIdentity", () => {
  it("includes user name, role, expertise", () => {
    const result = buildIdentity(makeCtx());
    expect(result).toContain("Test User");
    expect(result).toContain("Engineer");
    expect(result).toContain("TypeScript, APIs");
  });

  it("includes work context when set", () => {
    const ctx = makeCtx({
      config: makeConfig({
        user: {
          name: "Test User",
          role: "Engineer",
          work: { description: "Building widgets" },
        },
      }),
    });
    const result = buildIdentity(ctx);
    expect(result).toContain("Building widgets");
  });

  it("includes personal context when set", () => {
    const ctx = makeCtx({
      config: makeConfig({
        user: {
          name: "Test User",
          role: "Engineer",
          personal: { description: "Loves hiking" },
        },
      }),
    });
    const result = buildIdentity(ctx);
    expect(result).toContain("Loves hiking");
  });
});

describe("buildVaultStructure", () => {
  it("returns PARA description", () => {
    const result = buildVaultStructure();
    expect(result).toContain("PARA");
    expect(result).toContain("01_projects/");
    expect(result).toContain("02_areas/");
    expect(result).toContain("03_resources/");
    expect(result).toContain("04_archive/");
  });
});

describe("buildKeyFiles", () => {
  it("returns null when no features enabled", () => {
    const ctx = makeCtx({ config: makeConfig({ features: { bragfile: false, contacts: false } }) });
    expect(buildKeyFiles(ctx)).toBeNull();
  });

  it("includes bragfile section when enabled", () => {
    const ctx = makeCtx({
      config: makeConfig({ features: { bragfile: true, contacts: false } }),
    });
    const result = buildKeyFiles(ctx);
    expect(result).toContain("Bragfile");
    expect(result).toContain("02_areas/career/bragfile.md");
  });

  it("uses action-oriented text (no tool references)", () => {
    const ctx = makeCtx({
      config: makeConfig({ features: { bragfile: true, contacts: false } }),
    });
    const result = buildKeyFiles(ctx);
    expect(result).toContain("Bragfile");
    expect(result).not.toContain("brain_add_brag");
    expect(result).toContain("02_areas/career/bragfile.md");
  });
});

describe("buildConventions", () => {
  it("includes tone", () => {
    const ctx = makeCtx({
      config: makeConfig({ user: { name: "A", role: "B", tone: "casual" } }),
    });
    const result = buildConventions(ctx);
    expect(result).toContain("casual");
  });
});

describe("buildCustomRules", () => {
  it("returns null when no rules", () => {
    const ctx = makeCtx();
    expect(buildCustomRules(ctx)).toBeNull();
  });

  it("formats rules as bullet list", () => {
    const ctx = makeCtx({
      config: makeConfig({
        user: {
          name: "A",
          role: "B",
          customization: { rules: ["Rule one", "Rule two"] },
        },
      }),
    });
    const result = buildCustomRules(ctx);
    expect(result).not.toBeNull();
    expect(result).toContain("- Rule one");
    expect(result).toContain("- Rule two");
  });
});

describe("buildProfileNudge", () => {
  it("returns null when onboarding_complete is true", () => {
    const ctx = makeCtx({
      config: makeConfig({
        user: {
          name: "A",
          role: "B",
          expertise: ["X"],
          work: { description: "Y" },
          customization: { onboarding_complete: true },
        },
      }),
    });
    expect(buildProfileNudge(ctx)).toBeNull();
  });
});

describe("buildBehavioralRules — pre-action announcement rule", () => {
  const result = buildBehavioralRules(makeCtx());

  it("includes a 'Before editing' (or equivalent) subsection", () => {
    // Subsection header — locks in the structural placement so it can't get
    // silently demoted to a buried bullet.
    expect(result).toMatch(/###\s+Before editing/i);
  });

  it("uses announce/say/state semantics", () => {
    expect(result).toMatch(/\b(announce|say|state|tell)\b/i);
  });

  it("references at least one context noun (project / contact / file / where)", () => {
    expect(result).toMatch(/\b(project|contact|file|where)\b/i);
  });

  it("scopes itself to write/edit/modify actions, not all actions", () => {
    // Must mention modifying actions...
    expect(result).toMatch(/\b(write|edit|modif|create|delete|move)/i);
    // ...and explicitly exclude read-only ones, so the rule doesn't get
    // generalized to "always announce" (which would contradict
    // "Search the vault before answering" and add noise).
    expect(result).toMatch(/\b(read|search|list)/i);
  });

  it("includes at least one of the example phrasings", () => {
    const examples = [/Acme Redesign/i, /John Doe/i, /Team Sync/i];
    const matched = examples.some((re) => re.test(result));
    expect(matched).toBe(true);
  });
});

describe("joinSections", () => {
  it("filters nulls and joins with double newlines", () => {
    const result = joinSections(["A", null, "B", undefined, "C"]);
    expect(result).toBe("A\n\nB\n\nC\n");
  });
});
