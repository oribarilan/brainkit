# brainkit

**An augmentation kit for your brain.**

An opinionated second brain implementation, powered by [pi](https://github.com/badlogic/pi-mono) (and your own model of choice).

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

Update anytime with `pi update`. Brainkit tells you when a new version is available.

### With any agent (experimental)

Works with Claude Code, Copilot, OpenCode, Codex, and more. Same vault and skills, without pi-specific extras.

> **Note**: CLI mode is in early development. The core experience should work, but for the full and tested behavior you should use the pi agent.

```bash
npx @oribish/brainkit
```

[![npm version](https://img.shields.io/npm/v/@oribish/brainkit)](https://www.npmjs.com/package/@oribish/brainkit)

## What is this?

A "second brain" is a system for capturing and organizing everything you know (accomplishments, people, meeting notes, projects, ideas) so you can find it when you need it instead of keeping it all in your head.

Brainkit is an opinionated agentic implementation of that idea. It's a structured markdown vault that follows the [PARA method](https://fortelabs.com/blog/para/), uses a bragfile, contacts.md and more. Delivered with an AI agent that actually understands it. You talk, things happen:

- _"I just shipped the API redesign"_ → adds it to your bragfile, in the right section
- _"I had a meeting with Sarah about the migration"_ → creates meeting notes, cross-references Sarah from contacts, files it under the right project
- _"Who was that engineer from the platform team?"_ → searches your contacts

No commands, no formatting, no manual filing. The agent handles it.

## Getting Started

```bash
pi
```

Type `/setup` and the agent walks you through a getting-to-know-you conversation — your work, your personal life, your preferences. It creates a vault that matches your actual life, not an empty template.

## Features

### PARA vault

Everything goes into four directories:

- **`01_projects/`** — active efforts with a deadline (work and personal)
- **`02_areas/`** — ongoing responsibilities (career, health, finances)
- **`03_resources/`** — reference material and interests
- **`04_archive/`** — done or no longer relevant

### Bragfile

A log of professional accomplishments at `02_areas/career/bragfile.md`. The agent recognizes accomplishments in conversation and offers to capture them. Entries are placed programmatically. Nudges you if it's been more than two weeks since your last brag log.

### Contacts

A people index at `03_resources/contacts.md`: colleagues, family, doctors, anyone. The agent cross-references people when they come up in conversation and suggests adding new ones.

### Meeting notes

Structured notes from any meeting: work, doctor visits, school conferences. Filed under the relevant PARA directory, named `YYYY-MM-DD-topic.md`, with attendees, decisions, and action items.

### Vault health

`/doctor` fixes issues automatically: missing directories, naming violations, orphaned files. Checks that your GitHub repo is private. Detects stale projects that might need archiving. Never deletes, always archives.

### Auto-commit

Vault changes are git-committed automatically after conversations. Debounced so rapid changes collapse into one commit. Skips silently if not a git repo.

## Bundled Extensions

Pi comes pretty basic, but it is composable. Extensions can be mixed and matched to build your ideal workflow. [You can even run Doom inside it](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions/doom-overlay/). Brainkit ships with a curated set of companion extensions from the [pi ecosystem](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions):

- **Plan mode** — toggleable read-only exploration mode (`/plan` or `Ctrl+Alt+P`). The agent can search and read but can't modify anything, useful for understanding before changing.
- **Permission gate** — prompts for confirmation before running potentially dangerous bash commands (`rm -rf`, `sudo`, `chmod 777`).
- **Questionnaire** — structured tool for asking the user single or multiple-choice questions with a tab-based UI, used by the agent to clarify requirements and preferences.

These are loaded automatically when you install brainkit. No extra setup needed.

### Adding more extensions

Pi extensions are composable. You can add any pi extension alongside brainkit:

```bash
pi install git:github.com/someone/cool-extension
```

Or drop a `.ts` file into `~/.pi/agent/extensions/` for local extensions. See the [pi extension docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) for details.

## License

MIT
