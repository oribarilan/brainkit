import { describe, it, expect } from "vitest";
import { buildOnboardingPrompt } from "../onboarding-prompt.js";

describe("buildOnboardingPrompt", () => {
  it("returns prompt containing first-time setup header", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("Brainkit — First-Time Setup");
  });

  it("includes all setup steps", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("Brain location");
    expect(result).toContain("Vault name");
    expect(result).toContain("Basics");
    expect(result).toContain("Context");
    expect(result).toContain("Preferences");
  });

  it("includes config file templates", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).toContain("config.toml");
    expect(result).toContain("brainkit.toml");
  });

  it("opencode variant does not contain restart instruction", () => {
    const result = buildOnboardingPrompt("opencode");
    expect(result).not.toContain("run `brainkit` again");
  });

  it("copilot variant contains restart instruction", () => {
    const result = buildOnboardingPrompt("copilot");
    expect(result).toContain("run `brainkit` again");
  });

  it("copilot variant is a superset of opencode variant", () => {
    const opencode = buildOnboardingPrompt("opencode");
    const copilot = buildOnboardingPrompt("copilot");
    expect(copilot).toContain(opencode);
  });

  it("claude variant contains restart instruction with brainkit claude command", () => {
    const result = buildOnboardingPrompt("claude");
    expect(result).toContain("run `brainkit claude` again");
    expect(result).toContain("### Restart required");
  });

  it("claude variant is a superset of opencode variant", () => {
    const opencode = buildOnboardingPrompt("opencode");
    const claude = buildOnboardingPrompt("claude");
    expect(claude).toContain(opencode);
  });

  it("claude variant closing does not reference brainkit copilot", () => {
    const result = buildOnboardingPrompt("claude");
    const closing = result.slice(result.indexOf("### Restart required"));
    expect(closing).not.toContain("brainkit copilot");
    expect(closing).not.toContain("run `brainkit` again");
  });

  it("includes safety rules against overwriting existing brainkit data", () => {
    const result = buildOnboardingPrompt("opencode");
    // Must explicitly tell the agent not to clobber an existing brainkit.toml.
    expect(result).toContain("NEVER overwrite an existing");
    expect(result).toContain("brainkit.toml");
  });

  it("includes the existing-brain detection branch (Scenario B)", () => {
    const result = buildOnboardingPrompt("opencode");
    // The prompt must instruct the agent to inspect the brain dir before
    // creating anything — and to skip re-onboarding if a configured vault
    // is already there. Otherwise users with prior brainkit data lose it.
    expect(result).toContain("existing vault");
    // The three-scenario branching must be documented (no scratch-only flow).
    expect(result).toContain("Scenario A");
    expect(result).toContain("Scenario B");
    expect(result).toContain("Scenario C");
  });
});
