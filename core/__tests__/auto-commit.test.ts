import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../git.js", () => ({
  isGitRepo: vi.fn(() => true),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => Buffer.from("")),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}));

import { scheduleAutoCommit, flushAutoCommit, flushAllAutoCommits } from "../auto-commit.js";
import { execSync } from "node:child_process";

const mockExecSync = vi.mocked(execSync);

describe("auto-commit per-vault timers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockExecSync.mockReset();
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (typeof cmd === "string" && cmd.includes("status --porcelain")) return Buffer.from("M file.md\n");
      return Buffer.from("");
    });
  });

  afterEach(() => {
    flushAllAutoCommits();
    vi.useRealTimers();
  });

  it("schedules independent timers for different vault paths", () => {
    scheduleAutoCommit("/vault/a");
    scheduleAutoCommit("/vault/b");
    vi.advanceTimersByTime(30_000);

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls).toHaveLength(2);
  });

  it("does not cancel vault A timer when vault B is scheduled", () => {
    scheduleAutoCommit("/vault/a");
    vi.advanceTimersByTime(15_000);
    scheduleAutoCommit("/vault/b");
    vi.advanceTimersByTime(15_000);

    const commitCallsA = mockExecSync.mock.calls.filter(
      ([cmd, opts]) =>
        typeof cmd === "string" &&
        cmd.includes("git commit") &&
        (opts as { cwd?: string } | undefined)?.cwd === "/vault/a",
    );
    expect(commitCallsA).toHaveLength(1);
  });

  it("flushAllAutoCommits commits all tracked vaults immediately", () => {
    scheduleAutoCommit("/vault/a");
    scheduleAutoCommit("/vault/b");
    flushAllAutoCommits();

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls).toHaveLength(2);
  });

  it("flushAutoCommit still works for single vault", () => {
    scheduleAutoCommit("/vault/a");
    flushAutoCommit("/vault/a");

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd, opts]) =>
        typeof cmd === "string" &&
        cmd.includes("git commit") &&
        (opts as { cwd?: string } | undefined)?.cwd === "/vault/a",
    );
    expect(commitCalls).toHaveLength(1);
  });

  it("reschedules same vault (debounce reset)", () => {
    scheduleAutoCommit("/vault/a");
    vi.advanceTimersByTime(20_000);
    scheduleAutoCommit("/vault/a");
    vi.advanceTimersByTime(20_000);

    const commitCalls1 = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls1).toHaveLength(0);

    vi.advanceTimersByTime(10_000);
    const commitCalls2 = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls2).toHaveLength(1);
  });

  it("flushAutoCommit for non-pending vault still commits if dirty", () => {
    flushAutoCommit("/vault/a");

    const commitCalls = mockExecSync.mock.calls.filter(
      ([cmd]) => typeof cmd === "string" && cmd.includes("git commit"),
    );
    expect(commitCalls).toHaveLength(1);
  });
});
