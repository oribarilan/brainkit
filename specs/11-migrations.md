# Migrations

## Overview

Brainkit needs to handle updates gracefully when the tool itself evolves. Two layers: config schema migrations (code-driven, deterministic) and content format migrations (skill-driven, self-healing). The guiding principle is that brainkit never silently breaks a user's vault.

## Config Migrations (code-driven)

### Design

A deterministic pipeline of pure functions: `(config) → config`. Each migration transforms from version N to N+1. Runs at startup in `readVaultConfig()`, before anything else reads the config. The `version` field in `brainkit.toml` (currently `1`, integer) tracks the schema version. Missing version is treated as `1`.

### Behavior by severity

**Non-breaking** (new optional fields, defaults changed, additive structure):

- Auto-migrate silently at startup
- Write the updated config back to disk with bumped `version`
- No user prompt, no system prompt mention
- Examples: adding `features.meeting_notes`, adding `user.timezone`

**Breaking** (renames, removals, type changes, restructured sections):

- Detect at startup but do NOT auto-migrate
- Return pending breaking migrations so the system prompt can surface them
- The agent explains the change, shows old vs new, and asks the user before modifying their config
- The user can approve, defer, or opt out
- Examples: renaming `user.context` to `user.customization.context`, removing a deprecated field

### Implementation

```typescript
// core/migrations.ts

type Migration = {
  from: number;
  to: number;
  breaking: boolean;
  description: string;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
};

const migrations: Migration[] = [
  // Example: v1 → v2, add features.meeting_notes default
  // {
  //   from: 1,
  //   to: 2,
  //   breaking: false,
  //   description: "Add meeting_notes feature toggle (defaults to true)",
  //   migrate: (config) => {
  //     const features = (config.features ?? {}) as Record<string, unknown>;
  //     if (features.meeting_notes === undefined) {
  //       features.meeting_notes = true;
  //     }
  //     return { ...config, features };
  //   },
  // },
];

export function migrateConfig(raw: Record<string, unknown>): {
  config: Record<string, unknown>;
  applied: Migration[];
  pendingBreaking: Migration[];
} {
  let config = { ...raw };
  const currentVersion = (config.version as number) ?? 1;
  const applied: Migration[] = [];
  const pendingBreaking: Migration[] = [];

  const applicable = migrations.filter((m) => m.from >= currentVersion).sort((a, b) => a.from - b.from);

  for (const migration of applicable) {
    if (migration.breaking) {
      pendingBreaking.push(migration);
      break; // Stop at first breaking migration — can't skip ahead
    }
    config = migration.migrate(config);
    config.version = migration.to;
    applied.push(migration);
  }

  return { config, applied, pendingBreaking };
}
```

### Integration with `readVaultConfig()`

```typescript
export function readVaultConfig(vaultPath: string): {
  config: BrainkitConfig;
  pendingBreaking: Migration[];
} {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parseToml(raw) as Record<string, unknown>;

  const { config, applied, pendingBreaking } = migrateConfig(parsed);

  // Write back if non-breaking migrations were applied
  if (applied.length > 0) {
    const toml = stringifyToml(config);
    fs.writeFileSync(configPath, toml + "\n", "utf-8");
  }

  return {
    config: config as unknown as BrainkitConfig,
    pendingBreaking,
  };
}
```

> **Warning**: Most TOML serializers strip comments. If `smol-toml`'s `stringify` doesn't preserve comments, auto-migration will destroy user comments in `brainkit.toml`. Before implementing, verify `smol-toml`'s behavior. If it strips comments, consider a line-level patch approach (only modify the `version` line and add new fields) instead of full re-serialization.

> **Note**: The first startup after a brainkit update rewrites `brainkit.toml` if non-breaking migrations apply. This is a one-time write per migration — subsequent startups skip it since the version is current. Combined with the comment-stripping concern, this means the first post-update startup is the riskiest moment for config file integrity.

> **Note**: This changes the return type of `readVaultConfig()`. All callers need to destructure `{ config, pendingBreaking }` instead of getting a plain `BrainkitConfig`. The `pendingBreaking` array is empty in the common case — most call sites can ignore it.

### Caller migration

Changing `readVaultConfig()` return type affects all callers. Current call sites:

- `opencode/server.ts` — system prompt hook and config hook. Needs `pendingBreaking` to inject migration prompts.
- `extensions/tools.ts` — tool implementations. Can ignore `pendingBreaking` (destructure `{ config }`).
- `core/system-prompt.ts` — `buildSystemPrompt()`. Needs `pendingBreaking` to render the migration prompt section.
- Health checks / doctor — can ignore `pendingBreaking`.

To minimize churn, consider a convenience wrapper:

```typescript
// For callers that don't care about pending migrations
export function readVaultConfigSimple(vaultPath: string): BrainkitConfig {
  return readVaultConfig(vaultPath).config;
}
```

### System prompt for pending migrations

When `pendingBreaking` is non-empty, the system prompt includes a section:

```markdown
## ⚠️ Pending config migration

Brainkit has a config update that requires your approval:

{migration.description}

Please explain this change to the user and ask if they'd like to proceed.
If they approve, apply the migration and update the version field.
If they decline, respect their choice — the config stays as-is.
```

#### Prompt frequency

The pending migration prompt appears on the **first turn of a session**, then not again for **3 days**. This avoids nagging while ensuring the user eventually sees it. Implementation: track `last_migration_prompt_shown` as a timestamp in the plugin's runtime state (not persisted to disk — resets on restart, which is fine since restarts are infrequent enough).

The agent handles the conversation. Two execution paths based on migration type:

- **Config schema migrations** (deterministic): After user approval, the agent calls `brain_apply_migration` — a server-side tool registered by the plugin. This tool programmatically runs the pending migration function and writes the result. The agent doesn't hand-edit the TOML — the code does. The user never needs to know about this tool; the agent calls it after a natural "sounds good, go ahead" from the user.
- **Content format migrations** (skill-driven): After user approval, the agent loads the relevant skill (e.g., bragfile skill's "Legacy Formats" section), follows its migration instructions, and edits vault files conversationally.

This ensures config migrations are precise (code runs the tested transform function) while content migrations remain flexible (agent adapts to the user's actual file contents).

#### `brain_apply_migration` tool

Registered by the server plugin when `pendingBreaking` is non-empty. Accepts no parameters — it applies the next pending breaking migration (the first one in the queue, since they're sequential). Returns a success/failure message.

```typescript
// In server plugin tool registration
api.tool("brain_apply_migration", {
  description: "Apply the next pending config migration. Call after user approves.",
  parameters: {},
  run: async () => {
    const { config: currentConfig, pendingBreaking } = readVaultConfig(vaultPath);
    if (pendingBreaking.length === 0) return "No pending migrations.";

    const migration = pendingBreaking[0];
    const raw = parseToml(fs.readFileSync(configPath, "utf-8"));
    const migrated = migration.migrate(raw);
    migrated.version = migration.to;
    fs.writeFileSync(configPath, stringifyToml(migrated) + "\n", "utf-8");

    return `Migration applied: ${migration.description} (v${migration.from} → v${migration.to})`;
  },
});
```

### Constraints

- Migrations are **ordered and sequential**. You can't skip from v1 to v3 without applying v2.
- Breaking migrations **block** subsequent migrations. If v2→v3 is breaking, v3→v4 doesn't run until v2→v3 is resolved.
- Migration functions are **pure** — they take a config object, return a config object. No filesystem access, no side effects.
- The migration array is **append-only**. Never remove or reorder existing migrations.

## Content Migrations (skill-driven, self-healing)

### Philosophy

Each skill owns its own migration story. If the bragfile format changes, the bragfile skill describes the current format, how to detect the old format, and how to guide the user through migration. This keeps migrations decentralized — no central registry of content transforms. The agent reads the skill, sees the format mismatch, and handles it conversationally.

### Pattern for skills

Each skill that defines a file format should include a "Legacy Formats" section:

```markdown
## Legacy Formats

### Pre-v2 bragfile

The original bragfile used flat date headers instead of half-year grouping.

**Detection:** Bragfile has H2 month headers (`## January 2025`) without
H1 half-year headers (`# H1 2025`).

**Migration:**

1. Show the user the current format and the new format
2. Ask if they want to migrate (restructure into H1/H2 grouping)
3. If yes, restructure — preserve all entries, just reorganize
4. If no, offer to disable the feature so brainkit doesn't manage it
5. Never modify without explicit user consent
```

### Self-healing behavior

The agent doesn't run a dedicated "migration step." Instead, format mismatches surface naturally during vault operations:

1. Agent reads a skill → skill describes expected format
2. Agent reads the actual file → detects mismatch
3. Agent follows the skill's migration instructions → converses with user
4. User approves or declines

The doctor/health check should always check for and surface format mismatches as warnings. A health check that detects a legacy bragfile format reports it as a `warn` result with a message like "Bragfile uses pre-v2 format. Use the bragfile skill to migrate."

### Opting out

Users can always:

- Disable a feature (`features.bragfile = false`) to stop brainkit from managing that file
- Keep the old format with a custom rule (`"don't restructure my bragfile"`)
- The agent respects both — skill migration instructions explicitly include opt-out paths

## What this does NOT cover

- **Vault content created outside brainkit** — that's the existing-vault-adoption concern, not migration
- **OpenCode plugin API changes** — brainkit code handles those directly, no user-facing migration needed
- **Global config migrations** — `~/.config/brainkit/config.toml` currently only has `vault_path` and is machine-specific. If it ever needs migration, the same pattern applies, but it's not worth building until needed
- **Downgrade paths** — migrations are forward-only. If a user needs to go back, they use git to revert their `brainkit.toml`
- **Execution order with vault adoption** — When a user points brainkit at an existing vault, `detectVaultState()` runs first (spec 12). If the vault has no `brainkit.toml`, the adoption flow creates one. Only after `brainkit.toml` exists does the migration pipeline apply. The adoption flow always creates a config at the latest schema version, so no migration runs on first setup.

## Decisions & Open Questions

- **Migration logs** (decided): Add a TOML comment to `brainkit.toml` when auto-applying non-breaking migrations (e.g., `# Migrated v1 → v2 on 2026-04-19`). No separate log file — keeps it simple and visible. Note: depends on TOML comment preservation (see warning above).
- **Breaking migration timeout**: Should pending breaking migrations eventually auto-apply after N sessions or days? Leaning no — the user should always be in control.
- **Batch breaking migrations**: If v2→v3 and v3→v4 are both breaking, should the agent present them together or one at a time? Current design is one at a time (blocked sequential), which is simpler but slower for users who skip multiple versions.
