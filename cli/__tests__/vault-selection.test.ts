import { describe, it, expect } from "vitest";
import { parseVaultFlag } from "../launch.js";

describe("parseVaultFlag", () => {
  it("extracts --vault value from args", () => {
    const result = parseVaultFlag(["--vault", "work"]);
    expect(result).toEqual({ vault: "work", remaining: [] });
  });

  it("extracts --vault with other args", () => {
    const result = parseVaultFlag(["--model", "gpt-4", "--vault", "life"]);
    expect(result).toEqual({ vault: "life", remaining: ["--model", "gpt-4"] });
  });

  it("returns null vault when --vault not present", () => {
    const result = parseVaultFlag(["--model", "gpt-4"]);
    expect(result).toEqual({ vault: null, remaining: ["--model", "gpt-4"] });
  });

  it("throws when --vault has no value", () => {
    expect(() => parseVaultFlag(["--vault"])).toThrow();
  });

  it("throws when --vault value looks like another flag", () => {
    expect(() => parseVaultFlag(["--vault", "--model"])).toThrow();
  });
});
