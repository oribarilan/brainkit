<h1 align="center">brainkit</h1>

<p align="center"><strong>An augmentation kit for your brain.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@2brain/brainkit"><img src="https://img.shields.io/npm/v/@2brain/brainkit" alt="npm version"></a>
  <a href="https://github.com/oribarilan/brainkit/actions/workflows/check.yml"><img src="https://github.com/oribarilan/brainkit/actions/workflows/check.yml/badge.svg?branch=main" alt="CI"></a>
</p>

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

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-is-it">What is it</a> ·
  <a href="#features">Features</a> ·
  <a href="#philosophy">Philosophy</a> ·
  <a href="#your-data">Your data</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Install

```bash
npm install -g @2brain/brainkit
```

_Works on macOS, Linux, and Windows._

Brainkit is a plugin for AI coding agents. It runs on top of an existing harness (it doesn't replace one) and adds skills, system prompts, hooks, and some visualizations. It detects which harness you have, or you can pick one:

| Harness                                                     | Command            |
| ----------------------------------------------------------- | ------------------ |
| [OpenCode](https://opencode.ai)                             | `brainkit oc`      |
| [GitHub Copilot CLI](https://github.com/github/copilot-cli) | `brainkit copilot` |
| [Claude Code](https://docs.claude.com/en/docs/claude-code)  | `brainkit claude`  |

If only one harness is installed, `brainkit` with no arguments launches it directly. With multiple, it asks you to pick a default on first run.

Run `brainkit` from anywhere. It routes to your brain directory, or walks you through setting one up on first run.

Safe to try: brainkit doesn't change your existing harness config. See [Philosophy](#philosophy) for details.

### First launch with Claude Code

Two things to expect the first time you run `brainkit claude` (or the short alias `brainkit cc`):

- **Separate authentication.** Claude Code will prompt you to authenticate. This is separate from your normal `claude` authentication because brainkit uses an isolated config directory at `~/.config/brainkit/claude/`. You will need a separate Claude session under brainkit. This is intentional — brainkit never reads or writes your global `~/.claude/`.
- **Plugin marketplace fetch (~4.4 MB).** Claude Code fetches the official Anthropic plugin marketplace into `~/.config/brainkit/claude/plugins/marketplaces/` on first launch. This is one-time per fresh install and stays inside the brainkit-isolated config directory.

To remove brainkit's Claude integration: `rm -rf ~/.config/brainkit/claude/`. Your global `~/.claude/` is unaffected.

## What is it

I've kept a second brain for over 10 years. Brainkit packages my workflows and conventions as an agent plugin. Use it as-is, grab a skill or two, or just browse for ideas.

You talk to your coding agent, things happen in your vault:

- _"I just shipped the API redesign"_ → bragfile entry, right section
- _"I had a meeting with Sarah about the migration"_ → meeting notes, cross-referenced with Sarah's contact, filed under the right project
- _"Who was that engineer from the platform team?"_ → searches contacts

No commands, no formatting, no manual filing.

## Features

- [PARA vault](docs/para.md). Four directories: projects, areas, resources, archive. The agent files things where they belong.
- [Multi-vault](docs/config.md). Keep separate vaults for work and life, or just use one. Each vault has its own config, contacts, and bragfile.
- [Bragfile](docs/bragfile.md). A running log of accomplishments. The agent offers to capture them when you mention shipping something, and nudges you when it's been a while.
- [Contacts](docs/contacts.md). A people index, cross-referenced when people come up in conversation.
- [Meeting notes](docs/meeting-notes.md). Capture notes from any meeting, then process them: action items, decisions, and contacts get distributed to where they belong, and the note gets archived.
- [Onboarding](docs/onboarding.md). First run is a conversation that builds a vault matching your actual situation.
- [Auto-commit](docs/auto-commit.md). Vault changes get git-committed after conversations.
- [Doctor](docs/doctor.md). Checks vault health: missing structure, naming violations, whether your GitHub repo is private. Fixes what it can.
- [TUI](docs/tui.md). Custom terminal UI for OpenCode with vault stats sidebar, rotating tips, and rose-pink theme.

## Philosophy

**For both life and work.** Pick which vault to open with `--vault`, or let brainkit auto-select when there's only one.

**Everything goes in.** Food recipes, feedback from your manager, notes from a doctor appointment, architecture decisions from a sprint review. If it's worth remembering, it belongs in the vault. The whole point is that you actually use it, so it has to be low friction.

**Store where you'll search, not where you found it.** Meeting notes get processed: action items go to the project, accomplishments go to the bragfile, new people go to contacts. The original note gets archived. Information should live where you'll look for it later.

**Convention over configuration.** I prefer battle-tested patterns. [PARA](https://fortelabs.com/blog/para/) for organization, a bragfile for tracking accomplishments, etc. Brainkit wires them together and teaches an agent to maintain them.

**Your harness config stays untouched.** Brainkit doesn't touch your normal OpenCode, Copilot CLI, or Claude Code setup. It runs your harness with its own config, so a regular `opencode`, `copilot`, or `claude` in another terminal keeps working fine while brainkit is open. Stop using brainkit whenever, nothing about your harness changes.

## Your data

- **No telemetry, no data collection.** Brainkit doesn't phone home. The only outbound request it makes is a version check against the GitHub releases API.
- **Plain files in a directory you choose.** Your vault is markdown and TOML on your disk. No database, no cloud, no account. OneDrive, Google Drive, Dropbox, a plain folder — all work.
- **Git is optional.** Brainkit asks during setup whether you want version history. Say yes and it inits a repo with a `.gitignore`; say no and everything still works. Pair it with a private git repo for backup if you want. `brainkit doctor` warns you if your remote is public.

## Contributing

Contributions welcome. Open an issue first to talk through the problem before writing code. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
