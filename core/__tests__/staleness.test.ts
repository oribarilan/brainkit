import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { stalenessCategory, daysSinceLastEntry } from "../vault.js";

// Fixed reference time for deterministic tests.
const NOW = new Date("2025-01-15T12:00:00Z").getTime();

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("stalenessCategory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "never" for null', () => {
    expect(stalenessCategory(null)).toBe("never");
  });

  it('returns "fresh" for 0 days', () => {
    expect(stalenessCategory(isoDaysAgo(0))).toBe("fresh");
  });

  it('returns "fresh" at 7-day boundary', () => {
    expect(stalenessCategory(isoDaysAgo(7))).toBe("fresh");
  });

  it('returns "warning" at 8 days', () => {
    expect(stalenessCategory(isoDaysAgo(8))).toBe("warning");
  });

  it('returns "warning" at 14-day boundary', () => {
    expect(stalenessCategory(isoDaysAgo(14))).toBe("warning");
  });

  it('returns "stale" at 15 days', () => {
    expect(stalenessCategory(isoDaysAgo(15))).toBe("stale");
  });

  it('returns "stale" at 365 days', () => {
    expect(stalenessCategory(isoDaysAgo(365))).toBe("stale");
  });
});

describe("daysSinceLastEntry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for null input", () => {
    expect(daysSinceLastEntry(null)).toBeNull();
  });

  it("returns 0 for now", () => {
    expect(daysSinceLastEntry(isoDaysAgo(0))).toBe(0);
  });

  it("returns 7 for 7 days ago", () => {
    expect(daysSinceLastEntry(isoDaysAgo(7))).toBe(7);
  });

  it("returns 8 for 8 days ago", () => {
    expect(daysSinceLastEntry(isoDaysAgo(8))).toBe(8);
  });

  it("returns 14 for 14 days ago", () => {
    expect(daysSinceLastEntry(isoDaysAgo(14))).toBe(14);
  });

  it("returns 15 for 15 days ago", () => {
    expect(daysSinceLastEntry(isoDaysAgo(15))).toBe(15);
  });

  it("returns 365 for 365 days ago", () => {
    expect(daysSinceLastEntry(isoDaysAgo(365))).toBe(365);
  });
});
