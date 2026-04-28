# external-brain-reference-skill

> **Status:** Idea, not designed. Requires brainstorming session before any spec or implementation work. Do **not** start implementing — open questions below need answers first.

## Context

Brainkit today only "knows" about the user's second brain when the agent is running **inside** a brainkit-launched harness session (via `brainkit oc`, `brainkit cc`, etc.). The system prompt, skills, and vault path are injected by the launcher.

But the user also works on **other repositories** — regular software projects, side projects, client work — where they launch their harness directly (plain `opencode`, `claude`, `copilot`) without going through brainkit. In those sessions the agent has **no idea the brain exists**, let alone where it lives. So the agent can't:

- Suggest writing a meeting note, contact, or brag entry into the brain
- Pull context from the brain (e.g., "what did we decide about X last quarter?")
- Cross-reference a project in the current repo with its PARA entry in the brain
- Even mention the brain as an option

The idea: ship a **standalone, installable skill** (or set of files) that lives outside the brainkit-launched context — installed once into the user's global agent config — that teaches any agent session "the user has a brainkit second brain at `<path>`, and here's how to refer to it." The skill would be **personalized at install time** with the user's actual `brain_path` so the agent always knows where to look.

This is essentially a "brain pointer" for non-brainkit sessions — a thin, read-aware reference that doesn't replicate brainkit functionality but bridges arbitrary projects to the brain.

**Value delivered (hypothesized — to be validated in brainstorming):**

- The brain becomes useful from **everywhere**, not just inside brainkit-launched sessions
- Reduces friction for "I should put this in my brain" moments during regular project work
- Makes the brain a first-class context source the agent can pull from when relevant
- Lightweight — doesn't require running brainkit's full plugin in every project

## Related Files

- `core/system-prompt.ts` — how brainkit-launched sessions learn about the brain today; reference for what minimum context an external skill would need
- `core/vault.ts` — vault discovery + config; the install flow would read `~/.config/brainkit/config.toml` to learn the user's `brain_path`
- `skills/brainkit/` — root client-side skill; some of its content might be the basis for the external skill
- `cli/launch.ts`, `cli/copilot.ts`, `cli/claude.ts` — launcher patterns; an `install-external-skill` command would live alongside these or as a subcommand
- `specs/US-claude-code.md` — Claude Code skill format reference (`.claude-plugin`, `skills/<name>/SKILL.md`)
- `specs/10-copilot-cli.md` — Copilot CLI skill install pattern (`.agents/skills/`)
- `specs/05-skills.md` — current skills architecture; external skill is a new category outside this

## Dependencies

- **Soft:** Multi-vault — if the user has multiple vaults, which one does the external skill point at? (Probably the default, or all of them.)
- **Soft:** Harness-isolation rule (AGENTS.md) — installing into the user's global harness config arguably violates this. Needs explicit carve-out or a different install location.
- **Soft:** Team vaults (`.todo/backlog/team-vault.md`) — shares the "remote brain" problem space. Brainstorm together; see Open Questions → Remote brains.
- **Hard:** A working `brain_path` in `~/.config/brainkit/config.toml` — the skill is meaningless without one (unless remote-brain support lands first, in which case the requirement shifts to "a working brain reference, local or remote").

## Open Questions (resolve in brainstorming)

These are the unknowns that block design. They are not acceptance criteria — they are the agenda for the brainstorming session.

### Scope & shape

- Is this **one** generic skill ("the user has a brain at `<path>`, here's its structure") or **many** thin wrappers that mirror brainkit's existing skills (bragfile, contacts, meeting-notes) but in read/write-via-path mode?
- Read-only, write-only, or full read/write from arbitrary project directories? Read-only is safest; full read/write is most useful.
- Does the agent get the **full** PARA structure docs, or just enough to know "the brain exists at `<path>`, look there if you need second-brain content"?

### Distribution

- How is the skill installed? `brainkit install-external-skill <harness>`? Auto-installed on first `brainkit` run? Manual copy from docs?
- One skill per harness (Claude / OpenCode / Copilot), or a single skill format that works everywhere?
- Where does it live? `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.agents/skills/`? This **directly conflicts** with brainkit's harness-isolation rule, which says brainkit must never write to the user's global harness config. Resolve before designing.
- Is there a way to deliver it without writing to the user's global harness config — e.g., as a plugin/MCP the user manually enables, or as a snippet they add to their own `AGENTS.md`/`CLAUDE.md`?

### Personalization

- The skill needs to know **where the brain is** (`brain_path`). How is that injected?
  - Generated at install time with the path baked in?
  - Read from `~/.config/brainkit/config.toml` at runtime by the agent?
  - Env var (`BRAINKIT_VAULT_PATH`) the user sets globally?
- What happens if the user changes their `brain_path` later? Auto-regenerate, or stale until reinstalled?
- Multi-vault: list all vaults, or just the default? How does the agent pick the right one?

### Auto-update

- Every `brainkit` invocation (any harness, any subcommand that launches a session) should ensure the externally-installed skill is **up to date** before the session starts. Stale skills = wrong brain path, wrong PARA structure, wrong feature list.
- What does "up to date" mean? Two axes:
  - **Content drift** — brainkit shipped a new version of the skill template (new PARA conventions, new features, bug fixes in the agent guidance).
  - **Personalization drift** — the user's `brain_path`, vault list, identity, or features changed since last install.
- Detection mechanism — version marker file in the installed skill dir (`.brainkit-version` like the Claude staging pattern in `US-claude-code.md`), plus a hash/mtime of the source config. If either differs, regenerate.
- Failure mode — if auto-update fails (permissions, disk full, harness config dir missing), do we block the launch, warn loudly, or silently continue with the stale skill? Probably warn + continue, since the user explicitly invoked brainkit and a stale pointer is better than no launch.
- Cost — auto-update runs on every launch and must be **fast** (sub-100ms in the no-op case). Use the `.brainkit-version` + config-hash short-circuit, only do real work when something changed. Mirrors the Claude plugin staging fast-path.
- Uninstall — if the user removes their brain (`brain_path` no longer exists or is unset), should auto-update **remove** the external skill, or leave it pointing at a missing path? Probably remove, with a one-line notice.
- Scope — does auto-update touch **only** the brainkit-installed external skill, or could it accidentally clobber user edits in the same skill dir? Must be scoped to files brainkit owns (manifest of installed files, like the Copilot pattern).
- Multi-harness — if the user has the skill installed for OpenCode **and** Claude **and** Copilot, does invoking `brainkit oc` update only the OpenCode copy, or all three? Updating all three is more correct but slower; updating only the active harness is faster but lets the others drift.

### Opt-out — power users may want to pin the skill to a specific brainkit version or edit it locally. Provide an opt-out (`auto_update_external_skill = false` in `~/.config/brainkit/config.toml` or a `.brainkit-pin` marker in the skill dir).

### Remote brains

- Today brainkit assumes `brain_path` is a **local filesystem path**. The external-skill idea inherits that assumption — the agent gets a local path and reads/writes through normal fs tools.
- But a user's brain might live **remotely**: a git repo on GitHub/GitLab they haven't cloned to this machine, a synced cloud drive (iCloud, Dropbox, Syncthing) that may or may not be mounted, an SSH-accessible host, an object store, or eventually a hosted brainkit service.
- Shapes to consider:
  - **Cloned-on-demand** — skill knows the remote URL; if `brain_path` doesn't exist locally, agent (or skill) clones it on first use. Closest to current model.
  - **Pure remote, no local clone** — agent reads/writes via API (git protocol, HTTP, SSH). Big departure; probably needs an MCP server or a shim CLI.
  - **Mounted/synced** — the brain is "remote" conceptually but appears as a local path via Dropbox/iCloud/Syncthing. Brainkit just needs to handle "path exists but might be partially synced / locked / conflicted."
- Identity & auth — remote brains need credentials (SSH key, GitHub token, API key). Where do those live? Brainkit currently has zero credential management.
- Latency & offline — local fs is instant; remote is slow and may be unavailable. Does the agent degrade gracefully (cache, read-only mode, defer writes), or hard-fail?
- Conflict resolution — multi-machine + remote = same file edited from two places. Same problem as team vaults (see below). Probably the same solution.
- **Strong overlap with team vaults** — `.todo/backlog/team-vault.md` already brainstorms shared brains for multiple humans. A team brain almost certainly lives remotely (git repo). The two ideas should be brainstormed **together** because:
  - Both need a remote-source-of-truth model
  - Both need conflict/sync semantics
  - Both raise the same auth/credential questions
  - Both affect the external skill's "where is the brain?" answer (a remote team brain might have multiple valid paths, or no local path at all)
- Action: when this leaves backlog, coordinate the brainstorm with `team-vault.md`. Likely outputs are: a unified "remote brain" abstraction underneath both single-user-remote and multi-user-shared cases, or an explicit decision that they're separate features with different mechanisms.

### Identity & content

- Does the skill include the user's identity (name, role) or just the path? Identity makes the agent more useful but is more invasive in non-brainkit projects.
- Does it explain PARA, features, conventions — or is it just a pointer with "look here, read what you need"?

### Agent behavior

- When should the agent reach into the brain unprompted? Never, on accomplishment-detection-like signals, or only when the user asks?
- Should the agent be allowed to **write** to the brain from a project it doesn't own (e.g., add a brag entry while the user is mid-coding)? Permission model?
- How does the skill compose with brainkit's actual launched sessions — does it deactivate / get superseded when running under `brainkit oc`?

### Conflicts & isolation

- **Hard:** AGENTS.md says "never modify the user's normal harness configuration." Installing skills into the user's global config dir is exactly that. Either revise the rule with a carved-out exception for opt-in external skills, or find a non-violating delivery mechanism (e.g., a documented manual snippet, a brainkit-launched "external mode" the user toggles per-project).
- If a project already has an `AGENTS.md`/`CLAUDE.md`, does the brain pointer get appended, ignored, or replace it? Probably appended via skill, but TBD.

### Non-goals to consider

- Replicating brainkit's full TUI / sidebar / status outside brainkit sessions — out of scope.
- Auto-launching brainkit from inside another harness session — out of scope.
- Two-way sync between project repos and the brain — out of scope; brain stays the source of truth.

## Acceptance Criteria

Not defined yet — the brainstorming output should include:

- [ ] A 1-paragraph problem statement narrowed to a specific shape (one skill vs many; read-only vs read/write; which harnesses)
- [ ] Decisions (or explicit deferrals) for each open question above, especially the harness-isolation conflict
- [ ] A delivery mechanism that either honors the harness-isolation rule or carves an explicit, justified exception
- [ ] A units-of-work breakdown similar to `US-multi-vault.md`
- [ ] A promotion path: when this leaves backlog and becomes `specs/US-external-brain-reference.md`

## Verification

N/A at this stage. Once designed, verification is defined per unit of work in the resulting spec.

## Notes

- The hardest part of this is probably **not** the skill content — it's reconciling "install into the user's global harness config" with brainkit's hard rule against doing exactly that. Brainstorming should probably lead with that question.
- Smallest viable version: a single read-only skill, one harness, single-vault users only, install via explicit `brainkit install-external-skill <harness>` (so the user opts in, sidestepping some of the isolation concern).
- Consider running the `brainstorming` skill when picking this up.
