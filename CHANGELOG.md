# Changelog

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
