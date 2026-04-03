# Vault Maintenance

Keeping the vault organized, consistent, and healthy. The vault is a living system that needs occasional care.

## The brain_doctor Tool

Use the `brain_doctor` tool to run health checks and fix issues programmatically. When the user runs `/doctor` or asks about vault health, call `brain_doctor` to get a structured report.

The tool checks:

- **Config validity** — `brainkit.toml` parses correctly.
- **PARA directory structure** — all 4 dirs exist (`01_projects`, `02_areas`, `03_resources`, `04_archive`).
- **Key files exist** — `bragfile.md`, `contacts.md`.
- **Naming conventions** — kebab-case for dirs and files.
- **No orphaned files** in vault root.

`brain_doctor` creates missing directories and files automatically — no manual intervention needed for structural issues. It returns a structured report so the agent can summarize what was found and what was fixed.

## Naming Conventions

- **Directories**: lowercase, hyphens, no spaces, no underscores (except PARA prefixes: `01_projects`, `02_areas`, `03_resources`, `04_archive`).
- **Files**: lowercase, hyphens, `.md` extension.
- **Meeting notes**: `YYYY-MM-DD-topic.md`.
- **Exception**: `README.md` is always uppercase.

## Archive Workflow

- Completed projects → move the entire directory to `04_archive/`.
- Add a note to the project's `README.md`: "Archived on YYYY-MM-DD. Reason: ..."
- Never delete. Archive preserves history.

## Post-Update Alignment

- After brainkit updates, the vault structure may need adjustment.
- New features may require new directories or files.
- `/doctor` handles this: calls `brain_doctor` which creates missing structure and reports changes.

## Staleness Detection

When the user asks about vault health or cleanup, proactively check for stale content:

- **Stale projects** — projects with no recent files or updates. Use `brain_search` to check for recent dated files (meeting notes, entries). If a project has no files newer than ~3 months, suggest asking the user if it should be archived.
- **Stale resources** — resources that haven't been referenced or updated. Less urgent than projects, but worth mentioning during cleanup.
- **Empty directories** — PARA subdirectories with no content (just a README.md). Suggest removing or archiving.

When suggesting archival, always ask — never archive without user confirmation. Follow the archival workflow described in the PARA skill.

## Common Issues and Fixes

| Issue                  | Fix                                              |
| ---------------------- | ------------------------------------------------ |
| Missing PARA directory | Create it.                                       |
| Missing bragfile       | Create with `# Bragfile` heading.                |
| Missing contacts       | Create with `# Contacts` heading.                |
| Non-kebab-case names   | Suggest renaming — don't rename without asking.  |
| Orphaned root files    | Suggest moving to the appropriate PARA category. |

## The "Never Delete" Rule

Content is never deleted from the vault. If something needs to be removed, it's moved to `04_archive/`. This applies to everything — files, directories, entries. The archive is the safe destination for anything that's no longer active.
