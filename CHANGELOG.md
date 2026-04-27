# Changelog

## [Unreleased]

### Fixed
- Windows: onboarding prompt string split into separate tokens by cmd.exe — `shell: true` caused `spawn` to re-tokenize args containing spaces, so Copilot CLI rejected them with "too many arguments"

### Added
- `spawnHarness()` helper that handles Windows `.cmd` shim resolution with proper arg quoting, replacing raw `spawn` + `shell: true` across all launch sites
- Cross-platform spawn integration tests — verify args survive the shell by spawning a real child process
- Windows CI runner — unit tests now run on `windows-latest` alongside the existing Ubuntu check

## [0.6.1] - 2026-04-27

### Added
- Auto-approve permissions during onboarding — OpenCode gets `permission: "allow"` in config, Copilot CLI gets `--allow-all` flag, so the agent can set up the vault without permission prompts on first run
- Onboarding permissions documented in CLI spec and onboarding feature doc for future harness authors

### Changed
- Custom rules question removed from onboarding flow — rules are still supported in config but are now a power-user setting, not part of first-run setup

## [0.6.0] - 2026-04-27

### Added
- Harness version check — on first run or brainkit version change, checks if OpenCode/Copilot CLI is outdated via npm registry and suggests updating
- Cross-platform support for macOS, Linux, and Windows

## [0.5.0] - 2026-04-26

### Added
- `brainkit reset` command — factory reset with confirmation prompt, removes config and re-triggers onboarding
- Auto-submit initial prompt on first-run onboarding: OpenCode uses `--prompt`, Copilot CLI uses `-i`

## [0.4.0] - 2026-04-26

### Added
- Polished CLI experience with `@clack/prompts` — branded intro, boxed help, interactive select menus for vault and harness selection, styled errors and cancellation
- Copilot CLI first-run onboarding — agent-guided vault setup without requiring OpenCode first, using a temporary onboarding workspace
- Shared onboarding prompt module — both OpenCode and Copilot use the same setup flow, extracted to `core/onboarding-prompt.ts`
- `BRAINKIT_CONFIG_DIR` env var to override the default config directory (useful for isolated dev/testing)
- `just run` and `just reset` recipes for testing the full CLI launch experience with isolated config
- Content curation listed as a feature in docs
- Harness detection hints — select menu shows "(detected)" / "(not installed)" for each harness

### Changed
- Onboarding prompt scoped to vault type — work vaults only ask about work context, personal vaults about personal context
- Onboarding uses the question tool for structured prompts instead of free-form text
- Config directory paths centralized through `getConfigDir()` instead of hardcoded `~/.config/brainkit`

### Fixed
- OIDC trusted publisher for npm auth (Node 24 compatibility)

## [0.3.0] - 2026-04-26

### Added
- Harness auto-detection with remembered default: when multiple harnesses are installed, brainkit prompts you to pick a default and saves the choice
- Meeting note processing: extract action items, decisions, contacts, and accomplishments to where they belong, then archive the original note
- "Store where you'll search for it" principle added to client-side vault rules

### Changed
- Package renamed from `@oribish/brainkit` to `@2brain/brainkit`
- Release pipeline switched from NPM_TOKEN to OIDC trusted publishing

## [0.2.0] - 2026-04-26

### Added
- OpenCode plugin: server (system prompt, compaction, brag detection, auto-commit) + TUI (sidebar, tips, theme, branding)
- CLI launcher (`npx @2brain/brainkit`) — detects OpenCode, sets up plugin config, spawns it
- CI release pipeline: auto-publish to npm on version change, GitHub Releases with changelog
- Package integrity test (`just test-package`) — validates npm artifact before every publish
- `writeVaultConfig` function for creating `brainkit.toml` programmatically
- `just build-cli` recipe for compiling CLI to `dist/`

### Changed
- Collapsed two-package architecture (`@2brain/brainkit-core` + `@2brain/brainkit`) into single `@2brain/brainkit` package
- `buildSystemPrompt` now accepts `{ cwd?, mode? }` options object instead of positional `cwd`
- All skills rewritten to action-oriented language (no tool name references)
- Package renamed to `@2brain/brainkit` for npm publishing

## [0.1.0] - 2026-04-03

### Added
- PARA-based vault structure (mandatory, fixed 4 categories)
- Bragfile management with `brain_add_brag` tool
- Contacts index with `brain_query_contacts` and `brain_add_contact` tools
- Vault search with `brain_search` tool
- Vault read/write with `brain_read` and `brain_write` tools
- Vault setup with `brain_setup_vault` tool
- Health check and auto-fix with `brain_doctor` tool
- Dynamic system prompt injection with user context
- Smart project context detection (cwd matching)
- Auto-brag detection on agent responses
- 6 skills: brainkit, para, bragfile, contacts, meeting-notes, maintenance
- Skills-first architecture: `/setup` and `/doctor` commands trigger agent
- Rose ASCII art header with command reference
- Rotating status bar hints
- Auto-update checking with changelog display
