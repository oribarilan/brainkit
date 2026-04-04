# Changelog

## [Unreleased]

### Added
- CLI mode (`npx @oribish/brainkit`) for non-pi agents (Claude Code, Copilot, OpenCode, Codex)
- Skill distribution following the Agent Skills standard (`.agents/skills/`, `.claude/skills/`)
- AGENTS.md generation for CLI users via `buildSystemPrompt` with `mode: "cli"`
- `writeVaultConfig` function for creating `brainkit.toml` programmatically
- Interactive setup flow: name, role, expertise, scope, tone, coding agent selection
- Bundled extensions: plan-mode, permission-gate, questionnaire
- `just build-cli` recipe for compiling CLI to `dist/`

### Changed
- `buildSystemPrompt` now accepts `{ cwd?, mode? }` options object instead of positional `cwd`
- All skills rewritten to action-oriented language (no `brain_*` tool references) per Decision #23
- Package renamed to `@oribish/brainkit` for npm publishing

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
