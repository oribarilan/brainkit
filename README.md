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

I've been maintaining a second brain for over 10 years. Brainkit is the collection of my opinionated workflows and practices, packaged as a coding agent plugin. You can use it as-is if you like how I do things, pick a skill or two to add a specific workflow to your own setup, or just browse for ideas.

If you have something that fits brainkit's philosophy, contributions are welcome. Open an issue first to talk through the problem you're solving before writing code.

## Philosophy

**Personal use, for both life and work.** A brain directory holds one or more vaults — you might have `work` and `life`, or just a single vault. Each vault is independent with its own config, contacts, and bragfile. Choose which vault to open at launch with `--vault`, or let brainkit auto-select when there's only one.

**Everything goes in.** Food recipes, feedback from your manager, notes from a doctor appointment, architecture decisions from a sprint review. If it's worth remembering, it belongs in the vault. The whole point is that you actually use it, so it has to be low friction.

**Common best practices over custom systems.** I prefer battle-tested conventions. [PARA](https://fortelabs.com/blog/para/) for file organization, a bragfile for tracking accomplishments, etc. Brainkit just wires them together and teaches an AI agent to maintain them.

## What it does

You talk to your coding agent, things happen in your vault:

- _"I just shipped the API redesign"_ → adds it to your bragfile, in the right section
- _"I had a meeting with Sarah about the migration"_ → creates meeting notes, cross-references Sarah from contacts, files it under the right project
- _"Who was that engineer from the platform team?"_ → searches your contacts

No commands, no formatting, no manual filing.

## Features

- [**PARA vault**](docs/para.md) — four directories: projects, areas, resources, archive. The agent figures out where things go.
- [**Bragfile**](docs/bragfile.md) — a running log of professional accomplishments. The agent offers to capture them when you mention shipping something. Reminds you when it's been a while.
- [**Contacts**](docs/contacts.md) — a people index. The agent cross-references people when they come up and suggests adding new ones.
- [**Meeting notes**](docs/meeting-notes.md) — structured notes from any meeting, filed under the right PARA directory with attendees, decisions, and action items.
- [**Onboarding**](docs/onboarding.md) — first run is a conversation that builds a vault matching your actual life, not an empty template.
- [**Auto-commit**](docs/auto-commit.md) — vault changes get git-committed automatically after conversations.
- [**Doctor**](docs/doctor.md) — checks vault health: missing structure, naming violations, whether your GitHub repo is private. Fixes what it can.
- [**TUI**](docs/tui.md) — custom terminal UI for OpenCode: vault stats sidebar, rotating tips, rose-pink theme.

## Quick start

No install needed -- run it directly with npx:

```bash
npx @2brain/brainkit
```

This launches [OpenCode](https://opencode.ai) with the brainkit plugin loaded. On first run, the agent walks you through a getting-to-know-you conversation and creates a vault that matches your actual situation.

Requires OpenCode on your `$PATH`.

## Install

For regular use, install globally:

```bash
npm install -g @2brain/brainkit
```

Then launch with:

```bash
brainkit            # OpenCode (default)
brainkit copilot    # GitHub Copilot CLI
```

[![npm version](https://img.shields.io/npm/v/@2brain/brainkit)](https://www.npmjs.com/package/@2brain/brainkit)

## License

MIT
