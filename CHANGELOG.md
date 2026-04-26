# Changelog

## [Unreleased]

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
