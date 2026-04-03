---
description: Core brainkit conventions, tools, commands, and setup flow
---

# Skill: brainkit

brainkit is a personal second brain system — a structured markdown vault organized using the PARA method. It captures projects, areas of responsibility, resources, and archives in a consistent, searchable format.

## Vault access

The agent has tools prefixed with `brain_` to interact with the vault. The vault path is configured by the user and the tools handle pathing automatically — never hardcode or assume a vault path.

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
2. Call brain_setup_vault with the path
3. Use the onboarding skill to conduct a comprehensive Q&A covering both professional and personal life — basics (name, role, expertise), work context (projects, team, collaborators, work rhythm), personal life (family, personal projects, responsibilities, hobbies), and communication preferences (tone, custom rules)
4. Construct a brainkit.toml with a rich `context` field summarizing everything learned, and write it with brain_write at path "brainkit.toml"
5. Call brain_doctor to create the vault structure
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
meeting-notes = true
self-review = false
vault-health = true
```

## Available tools

- `brain_read` — read a file from the vault
- `brain_write` — write or update a file in the vault
- `brain_search` — full-text search across the vault
- `brain_add_brag` — add an accomplishment to the bragfile
- `brain_query_contacts` — look up people in the contacts index
- `brain_add_contact` — add a person to the contacts index
- `brain_setup_vault` — initialize vault at a given path
- `brain_doctor` — run health checks, create missing structure, and fix issues

## Available commands

- `/setup` — set up or update vault configuration
- `/doctor` — run a health check and fix common issues

The agent handles general queries like "show me my vault" or "what can you do" naturally — no special commands needed beyond /setup and /doctor.

## Discoverability

When context is relevant, mention available tools and features — but don't force it.

- User mentions an accomplishment → mention they can capture it with `brain_add_brag`
- User mentions a person → mention they can add them to contacts with `brain_add_contact`
- User asks about their notes → mention `brain_search` to find things
- User is organizing information → mention the PARA structure

Be helpful, not pushy. Surface capabilities when they naturally fit the conversation.
