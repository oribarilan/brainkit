import { describe, it, expect } from "vitest";
import { containsUserAccomplishment } from "../hooks.js";

describe("containsUserAccomplishment", () => {
  it("detects 'you shipped'", () => {
    expect(containsUserAccomplishment("you shipped the feature")).toBe(true);
  });

  it("detects 'your team launched'", () => {
    expect(containsUserAccomplishment("your team launched the product")).toBe(true);
  });

  it("detects 'you completed'", () => {
    expect(containsUserAccomplishment("you completed the migration")).toBe(true);
  });

  it("rejects agent self-reference 'I shipped'", () => {
    expect(containsUserAccomplishment("I shipped the feature")).toBe(false);
  });

  it("rejects agent self-reference 'I implemented'", () => {
    expect(containsUserAccomplishment("I implemented the function")).toBe(false);
  });

  it("rejects passive voice without you/your nearby", () => {
    expect(containsUserAccomplishment("the feature was shipped")).toBe(false);
  });

  it("rejects when keyword is too far from 'you' (>50 chars)", () => {
    expect(
      containsUserAccomplishment(
        "you wrote some code and then later on after doing many other unrelated things shipped it",
      ),
    ).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsUserAccomplishment("")).toBe(false);
  });

  it("returns false when no accomplishment keyword present", () => {
    expect(containsUserAccomplishment("you said hello")).toBe(false);
  });

  it("does not match 'finished' inside 'refinished' (whole word boundary)", () => {
    expect(containsUserAccomplishment("you refinished the table")).toBe(false);
  });

  it("detects 'you deployed'", () => {
    expect(containsUserAccomplishment("you deployed the fix yesterday")).toBe(true);
  });

  it("detects 'you resolved'", () => {
    expect(containsUserAccomplishment("you resolved the incident")).toBe(true);
  });
});
