# brainkit

An opinionated second brain, built as a [pi](https://github.com/badlogic/pi-mono) extension. Talk to your agent — it knows your vault, your people, your accomplishments. Open pi anywhere, brainkit is always with you.

```
        _---~~(~~-_.
      _{        )   )
    ,   ) -~~- ( ,-' )_
   (  `-,_..`., )-- '_,)
  ( ` _)  (  -~( -_ `,  }
  (_-  _  ~_-~~~~`,  ,' )
    `~ -^(    __;-,((()))
          ~~~~ {_ -_(())
                 `\  }
                   { }
```

## What is this?

Brainkit turns pi into a persistent knowledge system. It's a structured markdown vault organized with the [PARA method](https://fortelabs.com/blog/para/), extended with typed tools for deterministic operations and skills that teach the agent domain knowledge.

You don't interact with brainkit through commands or UIs. You talk:

- _"I just shipped the API redesign"_ — agent offers to add it to your bragfile
- _"I had a meeting with Sarah about the migration"_ — agent creates structured meeting notes, cross-references Sarah from your contacts, files it under the right project
- _"Who was that engineer from the platform team?"_ — agent searches your contacts

The agent handles formatting, placement, and conventions. You just talk.

## Principles

### Discoverability

Everything is easy to find. Rotating status bar hints, command reference in the header, and skills that teach the agent to mention features when they're relevant — gently, not pushily.

### Just Works

No commands needed for common operations. Skills teach the agent judgment — _when_ to create meeting notes, _when_ to suggest a brag entry, _how_ to decide where something goes in PARA. Typed tools handle the rest deterministically.

### Auto-Update

Brainkit checks for updates on session start. A sticky status bar shows when a new version is available. After updating, you see what changed.

## Features

### PARA Vault Structure

Mandatory, opinionated organization:

- **`01_projects/`** — active efforts with a deadline
- **`02_areas/`** — ongoing responsibilities
- **`03_resources/`** — reference material
- **`04_archive/`** — completed/inactive items

### Bragfile

A running log of accomplishments at `02_areas/career/bragfile.md`. The `brain_add_brag` tool handles formatting and section placement. The agent recognizes accomplishments in conversation and offers to capture them.

### Contacts

A people index at `03_resources/contacts.md`. Search with `brain_query_contacts`, add with `brain_add_contact`. The agent cross-references people mentioned in conversation.

### Meeting Notes

Structured notes filed under the relevant PARA directory. Named `YYYY-MM-DD-topic.md`. The agent creates them when you mention a meeting — with attendees, decisions, and action items.

### Vault Health

`/doctor` checks your vault and fixes issues — creates missing directories, validates naming conventions, reports orphaned files. Never deletes, always archives.

## Architecture

Two layers that complement each other:

| Layer                  | What                     | Why                                                                          |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| **Tools** (TypeScript) | Deterministic operations | `brain_add_brag` finds the right section and appends correctly, every time   |
| **Skills** (Markdown)  | Domain knowledge         | Teaches the agent _when_ to suggest a brag, _how_ to structure meeting notes |

Tools handle the **how**. Skills handle the **when** and **why**.

## Install

### Prerequisites

- [pi](https://github.com/badlogic/pi-mono) installed and configured with an LLM provider

### Install

```bash
pi install git:github.com/oribarilan/brainkit
```

Or try it without installing:

```bash
pi -e git:github.com/oribarilan/brainkit
```

To pin a specific version:

```bash
pi install git:github.com/oribarilan/brainkit@v1.0.0
```

## Getting Started

```bash
pi
```

Then:

1. Type `/setup` or _"help me set up my vault"_
2. The agent walks you through configuration — vault path, name, role, preferences
3. Type `/doctor` or _"check my vault"_ to create the initial structure
4. Start talking

## Updating

```bash
pi update
```

Brainkit shows a sticky status bar notification when updates are available, and displays a changelog on first run after updating.

## License

MIT
