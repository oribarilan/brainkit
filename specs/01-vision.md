# Vision & Principles

## What Brainkit Is

Brainkit is an OpenCode plugin that gives you a persistent, structured second brain. It's a markdown vault organized with the PARA method, with skills that teach the agent domain knowledge and a TUI that keeps you connected to your vault.

You open OpenCode anywhere, brainkit is always with you. The agent knows your vault, your conventions, your people, your accomplishments. You talk naturally — "I just shipped the API redesign" — and the agent knows to offer adding it to your bragfile, filed in the right section, formatted correctly.

## Core Principles

### 1. Discoverability

Everything should be easy to discover and understand. The user should never wonder "what can this do?"

How we implement this:

- **Header**: ASCII art with quick command reference on every session start
- **Rotating hints**: Sidebar cycles through tips every 12 seconds
- **`/setup` and `/doctor` commands**: Thin wrappers that trigger the agent — easy to discover and type
- **Skills**: Each skill includes guidance on when to proactively mention features ("Sounds like an accomplishment — want me to add it to your bragfile?")
- **Contextual suggestions**: The agent is taught (via skills) to mention relevant features when the conversation touches on them — gently, not pushily

### 2. Just Works

The user should be able to talk naturally and things happen correctly. No commands needed for common operations.

How we implement this:

- **Skills teach judgment**: Skills don't just describe formats — they teach the agent WHEN to create meeting notes, WHEN to suggest a brag entry, HOW to decide where something goes in PARA
- **Built-in tools guided by skills**: The agent uses its built-in file editing capabilities to manage vault content. Skills teach the conventions and formats so the agent writes correctly — no custom tools needed.
- **System prompt injection**: Every turn, the agent gets fresh context about the vault — user identity, enabled features, conventions, and even smart project detection (if you're in a repo that matches a PARA project, that context is injected)
- **No keyboard shortcuts required**: The agent handles everything through conversation. No need to memorize key combos.
- **Global vault access**: The plugin knows the vault path from a global config. Works from any directory, any project.

### 3. Auto-Update

Users should know when a new version of brainkit is available.

How we implement this:

- **Version check**: On session start, fetch remote `package.json` from GitHub and compare versions using semver
- **Sticky status bar**: When an update is available, a persistent status shows the available version and how to update via npm
- **Non-blocking**: The remote check is async — it never delays session start

## Design Philosophy

- **Skills-first**: Skills are the primary interface. The user talks to the agent, the agent uses skills for judgment and built-in file tools for execution. Commands exist only as thin shortcuts that trigger the agent — they contain zero logic. There is no parallel UI system competing with conversation.
- **Opinionated**: PARA is mandatory. Naming conventions are fixed. This isn't a framework — it's a system with opinions.
- **Never delete**: Content is never deleted. Always archived. The archive is the safe destination for everything.
- **Plugin + Skills**: Two complementary layers. The OpenCode server plugin handles system prompt injection, auto-brag detection, compaction hooks, and auto-commit. Skills handle domain knowledge (when to suggest a brag, how to structure meeting notes, where to file things in PARA). Neither alone is sufficient.
- **OpenCode-first, multi-harness by design**: Built primarily for OpenCode's plugin API, which provides system prompt injection, event hooks, and a TUI layer that a generic approach can't match. The architecture is designed for multi-harness extensibility — Copilot CLI support is planned as an additional harness — but OpenCode remains the recommended path for the full end-to-end agentic flow.
