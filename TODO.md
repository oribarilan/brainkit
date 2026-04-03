# TODO

Ideas and future work for brainkit.

## Extensions & Tools

- [x] **Todo/task management** — Dropped. Brainkit is a knowledge system, not a task manager.
- [ ] **Self-review generation** — `brain_review` tool that summarizes bragfile entries for a given time period. Useful for performance review prep.
- [ ] **Weekly/daily digest** — On session start (or on demand), summarize recent vault activity: new brag entries, contacts added, projects updated, meetings logged.
- [ ] **Vault search improvements** — Fuzzy matching, relevance scoring, search within specific date ranges, search by tag/keyword.
- [ ] **Tagging system** — Add tags to any vault entry. Search and filter by tags across the vault.
- [ ] **Templates** — User-defined templates for common note types (1:1 notes, project kickoff, decision log). Stored in vault, used by the agent.
- [ ] **Project status tracking** — Track project health, blockers, next actions. Agent can summarize project status on demand.
- [x] **Recurring reminders** — Bragfile staleness detection. System prompt reminds the agent to nudge the user when bragfile hasn't been updated in 14+ days.

## Skills

- [x] **Onboarding skill** — First-run guidance that's more conversational. Teach the user what brainkit can do through a natural conversation rather than a setup wizard.
- [x] **Archival skill** — Covered by PARA and maintenance skills (archival triggers, staleness detection).
- [x] **Conditional skill loading** — Dropped. Feature flags aren't user-facing; all skills are always relevant.

## Infrastructure

- [ ] **npm distribution** — Publish to npm for shorter install commands and semver guarantees.
- [x] **Test suite** — Unit tests for vault operations, bragfile parsing, contacts parsing, system prompt builder, changelog parser, version comparison.
- [x] **CI/CD** — GitHub Actions for linting, testing, and automated releases with changelog generation.
- [x] **Vault backup** — Debounced auto-commit after agent turns, flush on session shutdown.
- [ ] **Multi-vault support** — Switch between vaults (work, personal) from within a session.

## UX

- [x] **Onboarding improvements** — Detect empty vault and guide user through first brag entry, first contact, first meeting note.
- [ ] **Vault statistics** — Richer stats: entries per week trend, most referenced contacts, most active projects.
- [ ] **Custom themes** — Let users customize the rose color, status bar style, hint frequency.
- [ ] **Export** — Export bragfile as PDF or formatted document for sharing.
