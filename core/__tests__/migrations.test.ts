import { describe, it, expect, afterEach } from "vitest";
import { migrateConfig, migrations } from "../migrations.js";
import type { Migration } from "../migrations.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMigration(overrides: Partial<Migration> & Pick<Migration, "from" | "to">): Migration {
  return {
    breaking: false,
    description: "test migration",
    migrate: (c) => c,
    ...overrides,
  };
}

// We push test migrations onto the real array and pop them after each test.
afterEach(() => {
  migrations.length = 0;
});

// ---------------------------------------------------------------------------
// migrateConfig
// ---------------------------------------------------------------------------

describe("migrateConfig", () => {
  it("returns unchanged config when no migrations exist", () => {
    const raw = { version: 1, user: { name: "A" } };
    const result = migrateConfig(raw);

    expect(result.config).toEqual(raw);
    expect(result.applied).toHaveLength(0);
    expect(result.pendingBreaking).toHaveLength(0);
  });

  it("applies non-breaking migration and bumps version", () => {
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        migrate: (c) => ({ ...c, newField: true }),
      }),
    );

    const result = migrateConfig({ version: 1 });

    expect(result.config["version"]).toBe(2);
    expect(result.config["newField"]).toBe(true);
    expect(result.applied).toHaveLength(1);
    expect(result.pendingBreaking).toHaveLength(0);
  });

  it("stops at breaking migration and returns it in pendingBreaking", () => {
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        breaking: true,
        migrate: (c) => ({ ...c, broke: true }),
      }),
    );

    const result = migrateConfig({ version: 1 });

    expect(result.config["version"]).toBe(1);
    expect(result.config["broke"]).toBeUndefined();
    expect(result.applied).toHaveLength(0);
    expect(result.pendingBreaking).toHaveLength(1);
    expect(result.pendingBreaking[0]?.from).toBe(1);
  });

  it("applies non-breaking migrations up to a breaking one then stops", () => {
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        migrate: (c) => ({ ...c, step1: true }),
      }),
      makeMigration({
        from: 2,
        to: 3,
        breaking: true,
        migrate: (c) => ({ ...c, step2: true }),
      }),
      makeMigration({
        from: 3,
        to: 4,
        migrate: (c) => ({ ...c, step3: true }),
      }),
    );

    const result = migrateConfig({ version: 1 });

    expect(result.config["version"]).toBe(2);
    expect(result.config["step1"]).toBe(true);
    expect(result.config["step2"]).toBeUndefined();
    expect(result.config["step3"]).toBeUndefined();
    expect(result.applied).toHaveLength(1);
    expect(result.pendingBreaking).toHaveLength(1);
  });

  it("handles missing version field (defaults to 1)", () => {
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        migrate: (c) => ({ ...c, migrated: true }),
      }),
    );

    const result = migrateConfig({ user: { name: "A" } });

    expect(result.config["version"]).toBe(2);
    expect(result.config["migrated"]).toBe(true);
    expect(result.applied).toHaveLength(1);
  });

  it("skips migrations below current version", () => {
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        migrate: (c) => ({ ...c, old: true }),
      }),
      makeMigration({
        from: 2,
        to: 3,
        migrate: (c) => ({ ...c, current: true }),
      }),
    );

    const result = migrateConfig({ version: 2 });

    expect(result.config["old"]).toBeUndefined();
    expect(result.config["current"]).toBe(true);
    expect(result.applied).toHaveLength(1);
  });

  it("applies migrations in order", () => {
    const order: number[] = [];
    migrations.push(
      makeMigration({
        from: 1,
        to: 2,
        migrate: (c) => {
          order.push(1);
          return { ...c, a: true };
        },
      }),
      makeMigration({
        from: 2,
        to: 3,
        migrate: (c) => {
          order.push(2);
          return { ...c, b: true };
        },
      }),
      makeMigration({
        from: 3,
        to: 4,
        migrate: (c) => {
          order.push(3);
          return { ...c, c: true };
        },
      }),
    );

    const result = migrateConfig({ version: 1 });

    expect(order).toEqual([1, 2, 3]);
    expect(result.config["version"]).toBe(4);
    expect(result.applied).toHaveLength(3);
  });
});
