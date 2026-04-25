/**
 * Config migration pipeline for brainkit.
 *
 * Pure, deterministic transforms: (config) → config.
 * Runs at startup in readVaultConfig() before anything reads the config.
 * The migrations array is append-only — never remove or reorder entries.
 */

/** The latest config schema version. Used to stamp new configs. */
export const CURRENT_SCHEMA_VERSION = 1;

/** A single config schema migration from one version to the next. */
export type Migration = {
  from: number;
  to: number;
  breaking: boolean;
  description: string;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
};

/** Ordered, append-only list of config migrations. */
export const migrations: Migration[] = [];

/**
 * Run the migration pipeline on a raw parsed config object.
 *
 * Non-breaking migrations are applied in sequence. Breaking migrations
 * halt the pipeline — they're returned as `pendingBreaking` so the caller
 * can surface them to the user for approval.
 *
 * @param raw - The parsed config object (e.g. from TOML).
 * @returns The migrated config, list of applied migrations, and any
 *          pending breaking migrations that need user approval.
 */
export function migrateConfig(raw: Record<string, unknown>): {
  config: Record<string, unknown>;
  applied: Migration[];
  pendingBreaking: Migration[];
} {
  let config = { ...raw };
  const currentVersion = typeof config["version"] === "number" ? config["version"] : 1;
  const applied: Migration[] = [];
  const pendingBreaking: Migration[] = [];

  const applicable = migrations.filter((m) => m.from >= currentVersion).sort((a, b) => a.from - b.from);

  for (const migration of applicable) {
    if (migration.breaking) {
      pendingBreaking.push(migration);
      break; // Can't skip ahead past a breaking migration
    }
    config = migration.migrate(config);
    config["version"] = migration.to;
    applied.push(migration);
  }

  return { config, applied, pendingBreaking };
}
