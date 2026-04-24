# brainkit

**An augmentation kit for your brain.**

An opinionated second brain, delivered as an [OpenCode](https://opencode.ai) plugin.

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

```bash
npx @oribish/brainkit
```

Installs the brainkit CLI and launches [OpenCode](https://opencode.ai) with the brainkit plugin loaded. Requires OpenCode on your `$PATH` and configured with an LLM provider.

Or install globally:

```bash
npm install -g @oribish/brainkit
brainkit
```

[![npm version](https://img.shields.io/npm/v/@oribish/brainkit)](https://www.npmjs.com/package/@oribish/brainkit)

### With Copilot CLI

```bash
brainkit copilot
```

Requires [GitHub Copilot CLI](https://github.com/github/copilot-cli) installed and authenticated. The brainkit launcher installs skills and hooks into your vault, then launches Copilot with full vault awareness.

## What is this?

A "second brain" is a system for capturing and organizing everything you know (accomplishments, people, meeting notes, projects, ideas) so you can find it when you need it instead of keeping it all in your head.

Brainkit is an opinionated agentic implementation of that idea. It's a structured markdown vault that follows the [PARA method](https://fortelabs.com/blog/para/), with a bragfile, contacts index, and more. You talk, things happen:

- _"I just shipped the API redesign"_ → adds it to your bragfile, in the right section
- _"I had a meeting with Sarah about the migration"_ → creates meeting notes, cross-references Sarah from contacts, files it under the right project
- _"Who was that engineer from the platform team?"_ → searches your contacts

No commands, no formatting, no manual filing. The agent handles it.

## Getting started

```bash
brainkit
```

The agent walks you through a getting-to-know-you conversation on first run — your work, your personal life, your preferences. It creates a vault that matches your actual life, not an empty template.

## Features

### [PARA vault](docs/para.md)

Four directories. Projects for active work with deadlines, areas for ongoing responsibilities, resources for reference material, archive for everything else. The agent figures out where things go.

### [Bragfile](docs/bragfile.md)

A log of your accomplishments at `02_areas/career/bragfile.md`. Say "I shipped the API redesign" and the agent offers to add it. Goes quiet for two weeks? It'll mention that.

### [Contacts](docs/contacts.md)

People index at `03_resources/contacts.md`. The agent checks if people are in your contacts when they come up and suggests adding new ones.

### [Meeting notes](docs/meeting-notes.md)

Notes from any meeting, filed under the right PARA directory. Named `YYYY-MM-DD-topic.md`, with attendees, decisions, and action items. Works for standup syncs and doctor visits.

### [Doctor](docs/doctor.md)

`/doctor` checks vault health: missing directories, naming violations, orphaned files, whether your GitHub repo is private. Fixes what it can, asks before renaming.

### [Auto-commit](docs/auto-commit.md)

Vault changes get git-committed after conversations. Debounced so rapid edits collapse into one commit.

### [Onboarding](docs/onboarding.md)

First run is a conversation, not a form. The agent asks about your work, your life, your preferences, then builds a vault that actually matches your situation.

### [TUI](docs/tui.md)

Custom terminal UI for OpenCode: ASCII art header, vault stats sidebar with bragfile staleness, rotating tips, and a rose-pink theme.

## License

MIT
