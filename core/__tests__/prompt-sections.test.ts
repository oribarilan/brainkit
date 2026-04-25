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
} from "../prompt-sections.js";
import { buildThinkerPrompt, buildConsultantPrompt, buildLibrarianPrompt } from "../agent-prompts.js";

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

describe("joinSections", () => {
  it("filters nulls and joins with double newlines", () => {
    const result = joinSections(["A", null, "B", undefined, "C"]);
    expect(result).toBe("A\n\nB\n\nC\n");
  });
});

// ---------------------------------------------------------------------------
// Agent prompt composers
// ---------------------------------------------------------------------------

describe("buildThinkerPrompt", () => {
  it("includes role, preamble, identity, conventions, behavioral rules, discoverability", () => {
    const config = makeConfig();
    const prompt = buildThinkerPrompt(config, "/fake/vault");

    expect(prompt).toContain("## Role");
    expect(prompt).toContain("Thinker");
    expect(prompt).toContain("## Brainkit");
    expect(prompt).toContain("Test User");
    expect(prompt).toContain("## Conventions");
    expect(prompt).toContain("## How to Work With This Vault");
    expect(prompt).toContain("## Discoverability");
  });
});

describe("buildConsultantPrompt", () => {
  it("includes role, preamble, identity, conventions but NOT behavioral rules", () => {
    const config = makeConfig();
    const prompt = buildConsultantPrompt(config, "/fake/vault");

    expect(prompt).toContain("## Role");
    expect(prompt).toContain("Consultant");
    expect(prompt).toContain("## Brainkit");
    expect(prompt).toContain("Test User");
    expect(prompt).toContain("## Conventions");
    expect(prompt).not.toContain("## How to Work With This Vault");
  });
});

describe("buildLibrarianPrompt", () => {
  it("includes role, preamble, vault structure but NOT identity or conventions", () => {
    const config = makeConfig();
    const prompt = buildLibrarianPrompt(config, "/fake/vault");

    expect(prompt).toContain("## Role");
    expect(prompt).toContain("Librarian");
    expect(prompt).toContain("## Brainkit");
    expect(prompt).toContain("PARA");
    expect(prompt).not.toContain("## Second Brain");
    expect(prompt).not.toContain("## Conventions");
  });
});

describe("agent prompts use cli mode", () => {
  it("all three use cli mode (no brain_* tool references in key files)", () => {
    const config = makeConfig({ features: { bragfile: true, contacts: true } });

    const thinker = buildThinkerPrompt(config, "/fake/vault");
    const consultant = buildConsultantPrompt(config, "/fake/vault");
    const librarian = buildLibrarianPrompt(config, "/fake/vault");

    for (const prompt of [thinker, consultant, librarian]) {
      expect(prompt).not.toContain("brain_add_brag");
      expect(prompt).not.toContain("brain_query_contacts");
    }
  });
});
