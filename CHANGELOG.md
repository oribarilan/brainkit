# Changelog

## [Unreleased]

## [0.11.0] - 2026-05-07

### Fixed
- **OpenCode**: brainkit launches no longer leak in `.opencode/` directories from your dotfiles dir or the parent dirs of your vault. The user's `~/.config/opencode/` (auth, MCP, LSP, model defaults) still merges in as before.
- **OpenCode**: brainkit's brain logo, sidebar, rotating tips, and `/doctor` command no longer silently fail to load when brainkit is installed from npm. The plugin's internal modules now resolve correctly when loaded by OpenCode's bun runtime from `node_modules`.
- **Copilot CLI**: settings you change inside a brainkit Copilot session (MCP servers, approved tools, theme) now persist across launches.

### Changed
- **OpenCode**: brainkit no longer ships a custom theme. Brainkit sessions now use whatever OpenCode theme you've selected. The previous custom theme had a leak — installing it copied the theme file into your global OpenCode config dir, which brainkit cannot redirect — so it's been disabled for new users until that's solved. Existing installs are unaffected; your `/theme` choice is respected.

## [0.10.0] - 2026-04-29

### Added
- **Claude Code**: `brainkit claude` (or `cc`) launches Claude Code with brainkit's vault context, skills, brand theme, and statusline. See README for first-launch notes (separate auth, one-time marketplace fetch).

### Fixed
- **OpenCode**: brainkit's custom theme, brain logo, sidebar, rotating tips, and `/doctor` command no longer disappear when launching from outside the brainkit repo (the normal user flow). The plugin now resolves its theme file relative to its own install location instead of the process working directory.
- **OpenCode**: theme load failures now surface a visible error toast and a log line, instead of silently disabling the entire brainkit TUI.

## [0.9.4] - 2026-04-28

### Fixed
- Fixed duplicate prompts that could appear right after a brainkit self-update.

## [0.9.3] - 2026-04-28

### Fixed
- Fixed `Error: read EIO` crash that could appear after running a harness update — brainkit now hands the terminal to the update command cleanly and restores it afterwards.

## [0.9.2] - 2026-04-28

### Fixed
- Harness update prompt now actually runs the update command when you confirm, instead of just printing it and exiting.

## [0.9.1] - 2026-04-28

### Changed
- `brainkit reset` now removes all brainkit config (including Copilot auth and conversation history); vaults and your global harness configs are not touched.

### Fixed
- **OpenCode**: fixed onboarding crash where the generated config was rejected with `Expected PermissionActionConfig, got "a"` (and similar), preventing OpenCode from launching after a fresh install or update.

## [0.9.0] - 2026-04-28

### Changed
- **Copilot CLI**: brainkit no longer writes files into your vault, to not conflict with any other non-brainkit harness session you may want to open there. This was already supported for OpenCode.
- Agent announces what it's about to change before editing the vault, so you can catch wrong-target actions early.

### Fixed
- **Copilot CLI**: fixed onboarding crash: `error: too many arguments. Expected 0 arguments but got 1.`.

## [0.8.0] - 2026-04-27

### Added
- Update prompt shows changelog — when a newer version is available, brainkit fetches release notes from GitHub and displays what's new before asking you to update

## [0.7.0] - 2026-04-27

### Added
- Self-update check — brainkit notifies you when a newer version is available on launch, with options to update now, skip this version, or be reminded later. Auto-detects your package manager and re-launches after updating.
- Windows CI runner for unit tests

### Fixed
- Windows: onboarding prompt split into separate tokens by cmd.exe, causing "too many arguments" error

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
