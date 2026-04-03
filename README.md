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

## Install

Requires [pi](https://github.com/badlogic/pi-mono) installed and configured with an LLM provider.

```bash
pi install git:github.com/oribarilan/brainkit
```

Or try it without installing:

```bash
pi -e git:github.com/oribarilan/brainkit
```

## Getting Started

```bash
pi
```

Then:

1. Type `/setup` or _"help me set up my vault"_
2. The agent walks you through a getting-to-know-you conversation — work, personal life, preferences
3. It creates your vault structure, writes your config, and pre-creates directories that match your life
4. Start talking

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

- **`01_projects/`** — active efforts with a deadline (work and personal)
- **`02_areas/`** — ongoing responsibilities (career, health, finances, home)
- **`03_resources/`** — reference material (notes, recipes, patterns)
- **`04_archive/`** — completed/inactive items

### Bragfile

A running log of professional accomplishments at `02_areas/career/bragfile.md`. The `brain_add_brag` tool programmatically finds the right half-year/month section and appends a correctly formatted entry — the agent never guesses at placement. The agent recognizes accomplishments in conversation and offers to capture them. If your bragfile hasn't been updated in 14+ days, the agent gently reminds you.

### Contacts

A people index at `03_resources/contacts.md` spanning both professional and personal life. Search with `brain_query_contacts`, add with `brain_add_contact`. The agent cross-references people mentioned in conversation and suggests adding new contacts.

### Meeting Notes

Structured notes filed under the relevant PARA directory. Named `YYYY-MM-DD-topic.md`. Works for work meetings, doctor appointments, school conferences — the agent creates them when you mention any kind of meeting, with attendees, decisions, and action items.

### Vault Health

`/doctor` checks your vault and fixes issues — creates missing directories, validates naming conventions, reports orphaned files, and verifies your GitHub repo is private. Never deletes, always archives. Detects stale projects that may need archiving.

### Auto-Commit

Vault changes are automatically committed to git after each conversation. Debounced (30s) so rapid changes collapse into one commit. Flushes on session end. Skips silently if not a git repo.

### Personalized Onboarding

First run walks you through a comprehensive getting-to-know-you conversation — your professional role, team, current projects, personal responsibilities, family, hobbies. The agent uses this to pre-create PARA directories that match your actual life and write a rich config. The vault feels personalized from the start, not empty and generic.

## Architecture

Two layers that complement each other:

| Layer                  | What                     | Why                                                                        |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------- |
| **Tools** (TypeScript) | Deterministic operations | `brain_add_brag` finds the right section and appends correctly, every time |
| **Skills** (Markdown)  | Domain knowledge         | Teaches the agent _when_ to suggest a brag, _how_ to structure notes       |

Tools handle the **how**. Skills handle the **when** and **why**.

## Updating

```bash
pi update
```

Brainkit shows a sticky status bar notification when updates are available, and displays a changelog on first run after updating.

## License

MIT
