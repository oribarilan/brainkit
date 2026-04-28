# Task: package-manager-detection

## Context

To auto-update brainkit, we need to know which package manager installed it (npm, pnpm, yarn, bun). Detection uses the resolved binary path as the primary signal, `npm_config_user_agent` as secondary, and falls back to npm.

**Value delivered**: Reliable package manager detection that maps to the correct update command.

## Related Files

- `cli/self-update.ts` — calls the detection function

## Dependencies

- `self-update-check.md` (the module where this function lives)

## Acceptance Criteria

- [ ] `detectPackageManager(): string` function exported from `cli/self-update.ts` (or a sub-module)
- [ ] Primary detection: resolves `process.argv[1]` via `fs.realpathSync()`, matches path patterns:
  - `/.bun/` → `"bun"`
  - `/pnpm/` or `/.pnpm-global/` → `"pnpm"`
  - `/.yarn/` or `/yarn/global/` → `"yarn"`
  - Everything else → fall through
- [ ] Secondary detection: if primary falls through, parse `process.env.npm_config_user_agent` first token (e.g., `pnpm/8.0.0` → `"pnpm"`)
- [ ] Final fallback: `"npm"`
- [ ] `getUpdateCommand(pm: string): string` maps PM name to full update command:
  - `npm` → `npm install -g @2brain/brainkit@latest`
  - `pnpm` → `pnpm add -g @2brain/brainkit@latest`
  - `yarn` → `yarn global add @2brain/brainkit@latest`
  - `bun` → `bun add -g @2brain/brainkit@latest`
- [ ] Tests cover each PM path detection and the fallback chain

## Verification

- **Automated**: Unit tests that mock `process.argv[1]` real path and `npm_config_user_agent` for each PM
- **Ad-hoc**: `just check` passes

## Scope Estimate

Small
