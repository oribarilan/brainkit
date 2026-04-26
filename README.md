# brainkit

**An augmentation kit for your brain.**

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

[![npm version](https://img.shields.io/npm/v/@2brain/brainkit)](https://www.npmjs.com/package/@2brain/brainkit)

## Install

```bash
npm install -g @2brain/brainkit
```

Brainkit is a plugin for AI coding agents. It detects which harness you have, or you can pick one:

| Harness                                                     | Command            |
| ----------------------------------------------------------- | ------------------ |
| [OpenCode](https://opencode.ai)                             | `brainkit oc`      |
| [GitHub Copilot CLI](https://github.com/github/copilot-cli) | `brainkit copilot` |

If only one harness is installed, `brainkit` with no arguments launches it directly. With multiple, it asks you to pick a default on first run.

Run `brainkit` from anywhere. It routes to your brain directory, or walks you through setting one up on first run.

## What is it

I've kept a second brain for over 10 years. Brainkit packages my workflows and conventions as an agent plugin. Use it as-is, grab a skill or two, or just browse for ideas.

You talk to your coding agent, things happen in your vault:

- _"I just shipped the API redesign"_ → bragfile entry, right section
- _"I had a meeting with Sarah about the migration"_ → meeting notes, cross-referenced with Sarah's contact, filed under the right project
- _"Who was that engineer from the platform team?"_ → searches contacts

No commands, no formatting, no manual filing.

## Features

- [**PARA vault**](docs/para.md) -- projects, areas, resources, archive. The agent files things where they belong.
- [**Bragfile**](docs/bragfile.md) -- a running log of accomplishments. The agent offers to capture them when you mention shipping something, and nudges you when it's been a while.
- [**Contacts**](docs/contacts.md) -- a people index. Cross-referenced when people come up in conversation.
- [**Meeting notes**](docs/meeting-notes.md) -- structured notes filed under the right PARA directory with attendees, decisions, and action items.
- [**Onboarding**](docs/onboarding.md) -- first run is a conversation that builds a vault matching your actual situation.
- [**Auto-commit**](docs/auto-commit.md) -- vault changes get git-committed after conversations.
- [**Doctor**](docs/doctor.md) -- checks vault health: missing structure, naming violations, whether your GitHub repo is private. Fixes what it can.
- [**TUI**](docs/tui.md) -- custom terminal UI for OpenCode with vault stats sidebar, rotating tips, and rose-pink theme.

## Philosophy

**For both life and work.** A brain directory holds one or more vaults. You might have `work` and `life`, or just one. Each vault is independent with its own config, contacts, and bragfile. Pick which vault to open with `--vault`, or let brainkit auto-select when there's only one.

**Everything goes in.** Food recipes, feedback from your manager, notes from a doctor appointment, architecture decisions from a sprint review. If it's worth remembering, it belongs in the vault. The whole point is that you actually use it, so it has to be low friction.

**Convention over configuration.** I prefer battle-tested patterns. [PARA](https://fortelabs.com/blog/para/) for organization, a bragfile for tracking accomplishments, etc. Brainkit wires them together and teaches an agent to maintain them.

## Contributing

Contributions welcome. Open an issue first to talk through the problem before writing code. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
