# Contacts

A people index at `03_resources/contacts.md`. A reference for remembering who people are, their roles, and how you know them.

## Format

Each person gets an H2 heading (full name) with structured fields:

```markdown
# Contacts

## Sarah Chen

- **Role**: Staff Engineer
- **Team**: Platform
- **Relation**: Direct collaborator on API redesign
- **Connection**: Met during 2025 architecture summit
- **Relevant For**: API design, distributed systems, Rust

## Marcus Johnson

- **Role**: Engineering Manager
- **Team**: Security
- **Relation**: Skip-level manager
```

- **Required**: Name (the H2 heading)
- **Optional fields**: Role, Team, Relation, Connection, Relevant For, Alias
- **Alias** is for nicknames or shortened names (e.g., `- **Alias**: SJ, Sarah`)

## Tools

- `brain_query_contacts` — search by name, role, team, or any field
- `brain_add_contact` — add a new person

## When to Cross-Reference Contacts

- User mentions a person by name — check if they're in contacts
- Creating meeting notes — link attendees to contacts
- Discussing a project — mention relevant contacts who may be useful

## When to Suggest Adding a Contact

Offer when the user mentions someone new who seems professionally relevant:

- A new colleague, collaborator, or stakeholder comes up in conversation
- Meeting notes reference someone not already in the index

Never add people without asking first. A simple "Want me to add them to your contacts?" is enough.
