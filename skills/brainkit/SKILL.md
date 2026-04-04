---
description: Core brainkit conventions, tools, commands, and setup flow
---

# Skill: brainkit

brainkit is a personal second brain system — a structured markdown vault organized using the PARA method. It captures projects, areas of responsibility, resources, and archives in a consistent, searchable format.

## Vault access

The agent interacts with the vault by reading, writing, and searching files directly. The vault path is configured in `brainkit.toml`.

## General conventions

- Directory names: lowercase with hyphens (`my-project/`)
- File names: lowercase with hyphens (`meeting-notes.md`)
- `README.md` is the entry point for every directory
- Use **bold** for key names, decisions, action items, and people
- Use first person ("I", "my") — this is a personal vault
- Never delete content — archive instead (move to `04_archive/`)

## Setup Flow

When a user runs /setup or asks to set up their vault:

1. Ask where their vault should live (absolute path)
2. Create the vault directory structure at the chosen path
3. Use the onboarding skill to conduct a comprehensive Q&A covering both professional and personal life — basics (name, role, expertise), work context (projects, team, collaborators, work rhythm), personal life (family, personal projects, responsibilities, hobbies), and communication preferences (tone, custom rules)
4. Construct a brainkit.toml with a rich `context` field summarizing everything learned, and write it at path `brainkit.toml` in the vault root
5. Check vault health and create missing structure (PARA directories, key files)
6. Pre-create relevant PARA directories with README.md files based on the conversation
7. Offer first brag entry and first contacts based on what was discussed
8. Confirm setup is complete

Example brainkit.toml:

```toml
[brainkit]
version = "0.1.0"

[user]
name = "Ori"
role = "Senior Backend Engineer"
expertise = ["distributed systems", "API design"]
tone = "direct and technical"
scope = "both"
context = """
Professional: Senior Backend Engineer at Acme Corp, threat detection platform.
Team of 8, reports to VP Engineering.

Personal: Married, two kids. Interests: woodworking, running.
Training for a half marathon. Planning kitchen renovation.
"""
rules = []

[features]
bragfile = true
contacts = true
```

## Vault Operations

- Read files from the vault
- Write or update vault files
- Search across the vault
- Add brag entries to `02_areas/career/bragfile.md`
- Look up or add people in `03_resources/contacts.md`
- Initialize the vault directory structure
- Run health checks and fix issues

The agent handles general queries like "show me my vault" or "what can you do" naturally — no special commands needed.

## Discoverability

When context is relevant, mention available features — but don't force it.

- User mentions an accomplishment → mention they can capture it in the bragfile
- User mentions a person → mention they can add them to contacts
- User asks about their notes → mention they can search the vault to find things
- User is organizing information → mention the PARA structure

Be helpful, not pushy. Surface capabilities when they naturally fit the conversation.
