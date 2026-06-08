import { describe, it, expect, vi } from "vitest";

vi.mock("../git.js", () => ({
  isGitRepo: vi.fn(() => false),
}));

import { buildSystemPrompt } from "../system-prompt.js";
import { isGitRepo } from "../git.js";
import type { BrainkitConfig } from "../types.js";

function makeConfig(): BrainkitConfig {
  return {
    version: 1,
    user: { name: "Test", role: "Engineer" },
    features: { bragfile: false, contacts: false },
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
