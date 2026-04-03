# TODO

Ideas and future work for brainkit.

## Extensions & Tools

- [ ] **Todo/task management** — `brain_add_todo`, `brain_list_todos`, `brain_complete_todo`. Track tasks in the vault with status, priority, due dates. File under relevant PARA directory.
- [ ] **Self-review generation** — `brain_review` tool that summarizes bragfile entries for a given time period. Useful for performance review prep.
- [ ] **Weekly/daily digest** — On session start (or on demand), summarize recent vault activity: new brag entries, contacts added, projects updated, meetings logged.
- [ ] **Vault search improvements** — Fuzzy matching, relevance scoring, search within specific date ranges, search by tag/keyword.
- [ ] **Tagging system** — Add tags to any vault entry. Search and filter by tags across the vault.
- [ ] **Templates** — User-defined templates for common note types (1:1 notes, project kickoff, decision log). Stored in vault, used by the agent.
- [ ] **Project status tracking** — Track project health, blockers, next actions. Agent can summarize project status on demand.
- [x] **Recurring reminders** — "Remind me to update my bragfile every Friday." Agent checks on session start and nudges if overdue.

## Skills

- [ ] **Onboarding skill** — First-run guidance that's more conversational. Teach the user what brainkit can do through a natural conversation rather than a setup wizard.
- [ ] **Archival skill** — Dedicated skill for archival workflows: when to archive, how to write archive notes, how to find archived content.
- [ ] **Conditional skill loading** — Only load skills for enabled features to reduce context usage.

## Infrastructure

- [ ] **npm distribution** — Publish to npm for shorter install commands and semver guarantees.
- [x] **Test suite** — Unit tests for vault operations, bragfile parsing, contacts parsing, system prompt builder, changelog parser, version comparison.
- [x] **CI/CD** — GitHub Actions for linting, testing, and automated releases with changelog generation.
- [ ] **Vault backup** — Periodic git commits of the vault, or integration with git-based backup.
- [ ] **Multi-vault support** — Switch between vaults (work, personal) from within a session.

## UX

- [x] **Onboarding improvements** — Detect empty vault and guide user through first brag entry, first contact, first meeting note.
- [ ] **Vault statistics** — Richer stats: entries per week trend, most referenced contacts, most active projects.
- [ ] **Custom themes** — Let users customize the rose color, status bar style, hint frequency.
- [ ] **Export** — Export bragfile as PDF or formatted document for sharing.
