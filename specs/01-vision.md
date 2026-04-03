# Vision & Philosophy

## What is Brainkit

Brainkit is an opinionated CLI tool that helps users bootstrap and maintain a GitHub repository as their personal "second brain." It is built on the conviction that plain markdown files in a git-backed repo, guided by well-crafted agent skills, are the best foundation for a personal knowledge management system.

Brainkit is **not** a note-taking app, a task manager, or an editor. It is a **skill distribution system** — it installs agent skills and conventions into a vault so that any AI coding agent (Copilot, Claude Code, Cursor, OpenCode, Gemini CLI, etc.) knows how to work with the user's second brain effectively.

## Core Principles

### Simple

- Markdown files, raw text, standard folders.
- No databases, no proprietary formats, no build steps.
- The vault is readable and usable without brainkit or any agent.

### Mine

- No vendor lock-in. The vault is a plain directory or git repo.
- Store wherever you want: GitHub, OneDrive, iCloud, local disk.
- Use any AI agent you want. Brainkit generates multi-provider agent instructions.
- Compliant by default — no cloud dependencies, no data leaves the user's control.

### Powerful

- PARA is the mandatory organizational backbone — every brainkit vault uses Projects, Areas, Resources, and Archive.
- Agent skills turn a folder of markdown into an intelligent system.
- The AI agent becomes a partner that can capture, organize, retrieve, and synthesize knowledge.
- Personalized to the user's role, tone, and workflow.

### Progressive

- PARA is always present as the foundation. Progressive adoption applies to features built on top of it: bragfile, contacts, meeting notes, etc.
- Start with just the PARA backbone and add more features over time.
- Re-run brainkit at any point to adopt new features.
- Auto-update awareness: brainkit tells you when new features are available.

## What Brainkit Is Not

- **Not a note-taking app.** It doesn't provide an editor or viewer. Use your IDE, Obsidian, or any editor you like.
- **Not a task manager.** The second brain captures knowledge, not todos.
- **Not a collaboration tool.** This is a personal vault — no sharing, commenting, or multi-user features.
- **Not a sync service.** Users manage their own git workflow or cloud sync.
- **Not an expert knowledge system.** It's for personal recall and productivity, not team documentation.

## The Second Brain Concept

A second brain is a system for capturing, organizing, and retrieving information outside your biological brain. The three core functions:

1. **Capture** — A frictionless place to store ideas, meeting notes, articles, and anything worth remembering.
2. **Organize** — Systematic structure for retrieval, not storage. Organize by "where will I look for this?" not "where did I capture it."
3. **Retrieve** — Tap into your digital memory whenever you need it. AI agents supercharge this.

Brainkit is opinionated about the organizing and retrieval layers. Capture is left to the user (IDE, mobile apps, Telegram bots, etc.).

## Why This Exists (Honest Differentiation)

Tools like Obsidian, Logseq, Notion, and Dendron already manage plain-markdown knowledge bases. Brainkit's differentiation is:

1. **Agent-first design.** The vault is designed to be operated by AI agents, not just read by them. Skills encode workflows (processing meeting notes, maintaining a brag file, querying contacts) as executable agent instructions.
2. **Progressive feature adoption.** You don't adopt a whole system on day one. Start with one concept, add more as the habit forms.
3. **Multi-provider.** Skills work across all major AI coding agents via the Agent Skills specification.
4. **Opinionated conventions.** Instead of maximum flexibility, brainkit ships battle-tested patterns (PARA, brag documents, contacts) with clear rules the agent follows.

## Inspiration

- **Tiago Forte's "Building a Second Brain"** and the PARA method — the organizational foundation.
- **[Impeccable](https://github.com/pbakaus/impeccable)** — the distribution model. Impeccable installs design skills into repos for AI agents. Brainkit does the same for personal knowledge management.
- **The Agent Skills specification (agentskills.io)** — the interoperability standard for skill files.
