import { describe, it, expect, vi } from "vitest";

vi.mock("../git.js", () => ({
  isGitRepo: vi.fn(() => false),
}));

import { buildSystemPrompt, buildMultiVaultPrompt } from "../system-prompt.js";
import { isGitRepo } from "../git.js";
import type { BrainkitConfig } from "../types.js";

function makeConfig(): BrainkitConfig {
  return {
    version: 1,
    user: { name: "Test", role: "Engineer" },
    features: { bragfile: false, contacts: false },
  };
}

function makeVaultEntry(name: string, overrides?: Partial<BrainkitConfig["user"]>): {
  name: string;
  path: string;
  config: BrainkitConfig;
} {
  return {
    name,
    path: `/brain/${name}`,
    config: {
      version: 1,
      user: { name: "Ori", role: "Staff Engineer", ...overrides },
      features: { bragfile: true, contacts: false },
    } satisfies BrainkitConfig,
  };
}

describe("buildSystemPrompt — git awareness", () => {
  it("includes 'backed by git' when vault is a git repo", () => {
    vi.mocked(isGitRepo).mockReturnValue(true);
    const result = buildSystemPrompt(makeConfig(), "/test/vault");
    expect(result).toContain("backed by git");
  });

  it("omits 'backed by git' when vault is not a git repo", () => {
    vi.mocked(isGitRepo).mockReturnValue(false);
    const result = buildSystemPrompt(makeConfig(), "/test/vault");
    expect(result).not.toContain("backed by git");
    expect(result).toContain("/test/vault");
  });
});

describe("buildMultiVaultPrompt", () => {
  it("produces per-vault identity blocks with vault names", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("## Vault: work");
    expect(result).toContain("## Vault: personal");
  });

  it("includes multi-vault preamble", () => {
    const vaults = [makeVaultEntry("work")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("multiple brainkit vaults");
  });

  it("includes write routing instructions", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("Write Routing");
  });

  it("includes shared sections only once", () => {
    const vaults = [makeVaultEntry("work"), makeVaultEntry("personal")];
    const result = buildMultiVaultPrompt(vaults);
    const structureMatches = result.match(/## Vault Structure/g);
    expect(structureMatches).toHaveLength(1);
  });

  it("includes brainkit sentinel", () => {
    const vaults = [makeVaultEntry("work")];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("<!-- brainkit:generated -->");
  });

  it("produces tone-neutral conventions section", () => {
    const vaults = [
      makeVaultEntry("work", { name: "Ori", role: "Engineer", tone: "direct" }),
      makeVaultEntry("personal", { name: "Ori", role: "Engineer", tone: "casual" }),
    ];
    const result = buildMultiVaultPrompt(vaults);
    const conventionsStart = result.indexOf("## Conventions");
    const conventionsEnd = result.indexOf("\n## ", conventionsStart + 1);
    const conventionsSection = result.slice(conventionsStart, conventionsEnd > -1 ? conventionsEnd : undefined);
    expect(conventionsSection).not.toContain("direct tone");
    expect(conventionsSection).not.toContain("casual tone");
  });

  it("includes per-vault tone in identity blocks", () => {
    const vaults = [
      makeVaultEntry("work", { name: "Ori", role: "Engineer", tone: "direct" }),
      makeVaultEntry("personal", { name: "Ori", role: "Engineer", tone: "casual" }),
    ];
    const result = buildMultiVaultPrompt(vaults);
    expect(result).toContain("Tone for this vault: direct");
    expect(result).toContain("Tone for this vault: casual");
  });
});
