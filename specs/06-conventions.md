# Conventions

## Vault Structure

PARA is mandatory. Fixed categories, fixed directory names:

```
vault/
  brainkit.toml             # Vault configuration
  01_projects/              # Active, deadline-driven efforts
  02_areas/                 # Ongoing responsibilities
    career/
      bragfile.md
  03_resources/             # Reference material, topics of interest
    contacts.md
  04_archive/               # Inactive items from above three
```

## Naming

### Directories

- Lowercase with hyphens: `my-project/`, `api-redesign/`
- No spaces, no underscores (except PARA prefixes: `01_projects`, `02_areas`, etc.)
- PARA prefix format: `NN_name` — only for the four top-level PARA directories

### Files

- Lowercase with hyphens: `meeting-notes.md`, `api-design.md`
- Always `.md` extension
- Exception: `README.md` is always uppercase
- Meeting notes: `YYYY-MM-DD-topic.md`

### Config files

- `brainkit.toml` — vault configuration (lowercase, no prefix)

## Formatting

### Markdown Conventions

- Use **bold** for: key names, decisions, action items, people names
- Use first person ("I", "my") — it's a personal vault
- Use `self` to refer to the vault owner in meeting notes
- `README.md` is the entry point for every directory — describe what the directory contains and link to key files
- Keep content concise — capture decisions and outcomes, not transcripts

### Bragfile Format

```markdown
# Bragfile

## H1 2026

### January

- **2026-01-15**: Shipped the threat detection API, reducing false positives by 40%
- **2026-01-08**: Led architecture review for the new auth service

### February

- **2026-02-20**: Mentored two junior engineers through their first production deployments
```

### Contacts Format

```markdown
# Contacts

## Sarah Chen

- **Role**: Staff Engineer
- **Team**: Platform
- **Relation**: Direct collaborator on API redesign
- **Connection**: Met during 2025 architecture summit
- **Relevant For**: API design, distributed systems, Rust
```

### Meeting Notes Format

```markdown
# Meeting: Topic Name

**Date**: 2026-04-03
**Attendees**: **Sarah Chen**, **Marcus Johnson**, **self**

## Summary

Brief summary of what was discussed and decided.

## Decisions

- **Decision**: Description

## Action Items

- [ ] **Owner**: Task description
```

## The "Never Delete" Rule

Content is never deleted from the vault. If something needs to be removed:

1. Move it to `04_archive/`
2. Add a note to its README.md: "Archived on YYYY-MM-DD. Reason: ..."
3. The archive preserves history indefinitely

This applies to everything — files, directories, entries, contacts. The archive is the safe destination for anything no longer active.

## Tone

The tone is configured per user in `brainkit.toml` (e.g., "direct and technical", "casual and friendly"). The agent matches this tone when writing vault content. Write like the vault owner would.
