# Vision & Principles

## What Brainkit Is

Brainkit is a pi coding agent extension that gives you a persistent, structured second brain. It's a markdown vault organized with the PARA method, with typed tools for programmatic operations and skills that teach the agent domain knowledge.

You open pi anywhere, brainkit is always with you. The agent knows your vault, your conventions, your people, your accomplishments. You talk naturally — "I just shipped the API redesign" — and the agent knows to offer adding it to your bragfile, filed in the right section, formatted correctly.

## Core Principles

### 1. Discoverability

Everything should be easy to discover and understand. The user should never wonder "what can this do?"

How we implement this:
- **Header**: Rose ASCII art with quick command reference on every session start
- **Rotating hints**: Status bar cycles through tips every 12 seconds
- **`/help` command**: Full reference panel for all commands and tools
- **`/brain` command**: Dashboard with vault stats and quick actions
- **Skills**: Each skill includes guidance on when to proactively mention features ("Sounds like an accomplishment — want me to add it to your bragfile?")
- **Tool descriptions**: Every tool has clear descriptions so the agent knows when to use them
- **Contextual suggestions**: The agent is taught (via skills) to mention relevant features when the conversation touches on them — gently, not pushily

### 2. Just Works

The user should be able to talk naturally and things happen correctly. No commands needed for common operations.

How we implement this:
- **Skills teach judgment**: Skills don't just describe formats — they teach the agent WHEN to create meeting notes, WHEN to suggest a brag entry, HOW to decide where something goes in PARA
- **Typed tools**: Operations like adding a brag entry are programmatic — the tool finds the right section, creates it if missing, appends in the right format. No LLM interpretation of formatting rules.
- **System prompt injection**: Every turn, the agent gets fresh context about the vault — user identity, enabled features, conventions, and even smart project detection (if you're in a repo that matches a PARA project, that context is injected)
- **No keyboard shortcuts required**: The agent handles everything through conversation. No need to memorize key combos.
- **Global vault access**: The extension knows the vault path from a global config. Works from any directory, any project.

### 3. Auto-Update (TBD)

Brainkit should be aware when a new version is available and surface this to the user.

Planned behavior:
- On session start, check for newer version
- If update available, notify the user with what's new
- User chooses whether to update
- Implementation details to be decided (npm registry check, GitHub releases, etc.)

## Design Philosophy

- **Skills-first**: Skills are the primary interface. The user talks to the agent, the agent uses skills for judgment and tools for execution. Commands exist only as thin shortcuts that trigger the agent — they contain zero logic. There is no parallel UI system competing with conversation.
- **Opinionated**: PARA is mandatory. Naming conventions are fixed. This isn't a framework — it's a system with opinions.
- **Never delete**: Content is never deleted. Always archived. The archive is the safe destination for everything.
- **Extension + Skills**: Two complementary layers. Tools handle deterministic operations (typed parameters, programmatic file manipulation). Skills handle domain knowledge (when to suggest a brag, how to structure meeting notes, where to file things in PARA). Neither alone is sufficient.
- **Pi-native**: Built specifically for pi's extension API. Not a generic tool that works with any agent. This trade-off gives us typed tools, system prompt injection, and event hooks that a generic approach can't match.
