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
});
