# external-brain-reference-skill

> **Status:** Idea, not designed. This file is structured in two parts: **WHAT first, HOW second.** The HOW (distribution mechanism, isolation-rule reconciliation, lifecycle) is a real and important topic, but a prior council review collapsed the entire conversation into HOW debates and never engaged the strategic question. The next review should take a stance on the WHAT first, then engage the HOW with that stance in hand.

## The core idea (one sentence)

**Any agent the user talks to — in any repo, any harness, any surface — should know the user has a brainkit second brain and be able to interact with it.**

Today, that knowledge only exists inside brainkit-launched sessions (`brainkit oc`, `brainkit cc`, `brainkit copilot`). Outside those sessions, the brain is invisible. This idea reframes brainkit from **an app the user goes to** into **a layer that follows the user across surfaces**.

## Why this matters (the strategic framing)

### Brainkit-as-app vs. brainkit-as-layer

Brainkit today is closer to an app: the user opens it (`brainkit oc`), works in it, closes it. The brain is a destination.

The idea here is that a second brain is supposed to be a **layer** over your work, not a destination. Tiago Forte's PARA / "Building a Second Brain" thesis is explicitly about ambient capture and retrieval — the brain _with_ you, not _waited on_. Brainkit's current model only partially delivers that.

External brain awareness is the shift from app to layer.

### The compounding-value argument

A 6-month-old brain with 200 entries is dramatically more valuable when accessible **everywhere** than when accessible only in dedicated sessions. The value gradient steepens over time:

- Week 1: tiny brain, low loss from being session-bound
- Month 6: rich brain, every inaccessible moment is a lost retrieval/capture opportunity
- Year 2: brain is a meaningful long-term memory layer; session-bound access becomes the dominant friction point

Tools that are always-on become indispensable. Tools you context-switch into stay optional. Brainkit's long-term value depends on closing this gap.

### What the layer actually unlocks

1. **Ambient capture across surfaces.** Brag-worthy moments, contact mentions, decisions worth recording — these happen _during_ coding, conversation, planning, debugging. Today they're only captured if the user happens to be in a brainkit session. With external awareness, any agent the user is talking to can offer to capture them.

2. **Cross-repo continuity / long-term memory.** "We decided X about auth last quarter" — the agent can pull from the user's `02_areas/` or `04_archive/` from inside any unrelated project. The brain becomes queryable long-term memory for _every_ agent interaction, not just brainkit ones.

3. **Project ↔ PARA linkage.** Agent in `~/code/acme-redesign/` recognizes this maps to `02_areas/clients/acme/` in the brain and surfaces relevant prior context unprompted.

4. **Friction removal.** "I should put this in my brain" today: open another terminal → run `brainkit oc` → navigate → write → context-switch back. With external awareness: agent offers, user says yes, done. The friction reduction is small per-instance but high-frequency, and frequency is what makes a tool indispensable.

### Where the idea genuinely shines vs. where it's marginal

**Shines:**

- **Capture** triggered by code work (shipped feature → brag entry; mentioned a colleague → contact; made a decision → note).
- **Retrieval of durable knowledge** (decisions, conventions, prior art on areas the user owns long-term).
- **Linking active projects to their PARA records.**

**Marginal or risky:**

- Pulling random brain content into unrelated client repos (real privacy concern — see Risks).
- Replicating brainkit's full skill behavior outside brainkit (probably better solved by a `--cwd` flag on the launcher; that's a different feature).

### The reframe a contrarian review surfaced

Most "I should brain this" moments aren't triggered by code work — they're triggered by Slack, calendar, conversation, voice. If true, "agent in a coding harness knows about the brain" only captures a slice of the real opportunity.

The bigger principle: **the brain should be addressable by any agent the user talks to**, not only coding-harness agents. Coding harnesses are one instance — the strategic target is "brainkit isn't trapped inside its own launcher."

This widens the surface area of the idea considerably:

- Coding harnesses outside brainkit launches (Claude Code, OpenCode, Copilot CLI run plain)
- Non-coding agent surfaces (Claude Desktop, ChatGPT, Cursor, voice assistants, future agent platforms)
- Anything that speaks the right protocol

Which raises the strategic question the next review should chew on:

> **Is the right long-term answer a per-harness skill/snippet, or a harness-agnostic interface to the brain (most likely an MCP server) that any agent ecosystem can consume?**

The skill/snippet/pointer ideas are tactical bridges. MCP (or whatever cross-tool agent protocol wins) is the strategic answer to brainkit-as-layer.

## Open questions about the WHAT (next review's agenda)

These are about the **idea**, not the implementation. The previous review skipped past these.

### Is the problem real and worth pursuing?

- How often, in real usage, does the "I'm in a non-brainkit session and want my brain" moment actually occur? Validate before designing.
- Is the value distribution skewed (a few high-value moments per week) or flat (many small moments per day)? Different shapes justify different investment.
- What fraction of "I should brain this" moments happen in coding contexts vs. non-coding contexts (Slack, calendar, conversation)? If non-coding dominates, this feature targets the smaller slice and the strategic priority should arguably be a different surface entirely.
- Is there a cohort effect? Does this matter more for users with mature, large brains (year 2+) than for new users (week 2)? If so, is brainkit even at the point where this is the right next investment?

### Is the brain-as-layer thesis the right strategic direction for brainkit?

- Does brainkit want to be an **app** (a destination users open) or a **layer** (ambient context across surfaces)? The current architecture is an app; this idea is a layer. The product implication is significant.
- If layer: which surfaces matter most, in priority order? Coding harnesses? Desktop assistants? Voice? Future agent platforms?
- Does the layer thesis change what brainkit's _core_ value proposition is? Today it's "structured second brain with agent-aware skills." Layer-thesis: "your brain, present in every conversation."
- What does a year-2 brainkit user's daily flow look like under each thesis? Which is more compelling?

### Capture vs. retrieval — which direction is the bigger win?

- **Outbound (capture):** agent in any session offers to write to the brain. Lower-risk, well-scoped, clear value.
- **Inbound (retrieval):** agent in any session pulls from the brain. Higher-value when it works, but real privacy/leak risks (especially in client repos).
- Should v1 do only one direction? Both? Capture-only is a meaningfully smaller and safer feature; retrieval is where the "long-term memory" magic lives.
- What does "the agent reads from the brain" look like in practice — proactive (agent decides), reactive (user asks), or hybrid (agent suggests, user confirms)?

### What is the brain-shaped contract the agent needs?

- What's the minimum the agent needs to know to be useful? Just `(brain_path, "it's PARA")`? Or richer (features, identity, conventions, current projects)?
- Is there an analogy to follow — how do other "ambient context" tools work? (e.g., shell history, git, knowledge graphs in IDEs)
- Does the agent need _interface_ knowledge (how to read/write) or _content_ knowledge (what's actually in there) or both?

### Surfaces and protocols

- **Per-harness skills/snippets** (today's framing) — works for harnesses brainkit knows, doesn't extend to the broader agent ecosystem.
- **MCP server** — harness-agnostic, future-proof, reaches non-coding surfaces; bigger investment, requires brainkit to ship and maintain a server.
- **A standard "brain pointer" format** that any agent could be taught to consume — interesting but requires ecosystem adoption.
- Which of these is the right strategic bet given where agent tooling is heading? Is it worth waiting for the ecosystem to converge, or moving early?

### What is the brain becoming?

- Today the brain is a single-user, local markdown vault.
- A "layer" brain implies it needs to be addressable from multiple machines, possibly multiple agents simultaneously, possibly remote.
- This pulls in adjacent ideas (remote brains, team vaults — see `.todo/backlog/team-vault.md`). Are they prerequisites for the layer thesis, or separate?
- Does the layer thesis force brainkit toward a hosted/sync model eventually, or can it stay local-first?

## Risks of the WHAT (independent of mechanism)

These are risks of the **idea itself**, not of any particular delivery mechanism.

- **Privacy leakage in mixed contexts.** Agent in a client repo reads from the user's personal brain → personal/other-client content surfaces in client commits, PRs, code review, transcripts. This is a property of "brain visible everywhere" regardless of how that visibility is delivered.
- **Capture in the wrong context.** Agent in a client repo writes to the personal brain about something it shouldn't have captured (client-confidential phrasing, identifying details). The brain absorbs context it shouldn't.
- **Always-on attention drag.** A brain that's always present in the agent's context might cause the agent to over-reference it, derailing focused work. "Brain-everywhere" risks "brain-too-much."
- **Identity bleed.** If the brain pointer carries the user's identity, that identity leaks into client-context agent transcripts.
- **Trust shape.** Brainkit-as-layer makes brainkit a more pervasive presence in the user's tooling. Users' threshold for trusting a layer is higher than for trusting an app.
- **Feature gravity.** Once the brain is a layer, every adjacent feature wants to plug into it. Scope discipline becomes harder.

## Non-goals (explicitly)

- Replicating brainkit's full TUI / sidebar / launcher inside non-brainkit sessions.
- Auto-launching brainkit from inside another agent session.
- Two-way sync between arbitrary project repos and the brain — brain stays source of truth.

## Related work and dependencies

- **Soft:** Multi-vault — if the user has multiple vaults, which one is "the brain" the layer exposes?
- **Soft:** Team vaults (`.todo/backlog/team-vault.md`) — shares the "brain present in multiple contexts" problem space; coordinate.
- **Soft:** Remote brains — the layer thesis probably accelerates the case for non-local brains.
- **Hard:** A working `brain_path` exists — the layer is meaningless without a brain to expose.
- **Reference:** `core/system-prompt.ts` — what brainkit-launched sessions tell the agent today; informs what minimum context the layer needs to convey.

---

# Part 2: The HOW (secondary — engage only after the WHAT lands)

> The HOW matters, but it's downstream. A previous review collapsed the entire conversation into install mechanics and the harness-isolation rule, never engaging the strategic question. **Do not re-litigate the HOW until the WHAT has a stance.** Once the WHAT is decided, the HOW questions below become first-class.

## The mechanism space

Roughly ordered from tactical/cheap to strategic/heavy:

### 1. User-pasted snippet (`brainkit print-pointer`)

Brainkit prints a personalized markdown block to stdout. The user pastes it into their own `~/.claude/CLAUDE.md`, `~/.config/opencode/AGENTS.md`, project-level `AGENTS.md`, or wherever they want the brain to be visible. Brainkit never writes to global harness config.

- **Honors isolation rule:** yes (user owns the change).
- **Reach:** every harness/surface that respects user-edited instruction files.
- **Lifecycle:** user re-runs command on changes; no auto-update machinery.
- **Best for:** validating demand cheaply, opt-in users, per-project scoping.

### 2. Brainkit-installed skill in global harness config

`brainkit install-external-skill <harness>` writes a personalized skill into `~/.claude/skills/`, `~/.config/opencode/skills/`, etc. Auto-update on every brainkit launch keeps it fresh.

- **Honors isolation rule:** no (this is exactly what the rule forbids; explicit user opt-in is consent-washing, not isolation).
- **Reach:** harnesses brainkit knows about.
- **Lifecycle:** brainkit owns install/update/uninstall — significant surface area (version markers, drift detection, multi-harness coordination, opt-out flags).
- **Best for:** if validation proves demand and the isolation rule is deliberately revised.

### 3. MCP server (or equivalent harness-agnostic protocol)

Brainkit ships a `brainkit-mcp` server. The user enables it through their own harness/agent config (still a config edit, but they did it). Server exposes read (and possibly write) tools over the brain.

- **Honors isolation rule:** yes (user-enabled, brainkit doesn't write the config).
- **Reach:** broadest — any agent ecosystem that speaks MCP, including non-coding surfaces (Claude Desktop, Cursor, future agent platforms).
- **Lifecycle:** brainkit ships and maintains a server; updates flow through normal package updates.
- **Best for:** the layer thesis at strategic scale.

### 4. A documented "brain pointer" file convention (e.g., `~/.brainkit-pointer`)

A standardized location/format that any agent could be taught to look for. Requires either ecosystem adoption or per-harness teaching (which loops back to mechanism #1 or #2).

- **Honors isolation rule:** depends on how agents are taught.
- **Reach:** ambitious but speculative without ecosystem buy-in.

### 5. Per-project opt-in

The user adds a brainkit pointer to specific project repos where they want brain awareness. Solves the privacy problem (§Risks) by default — brain isn't visible in repos where it shouldn't be.

- **Honors isolation rule:** yes.
- **Reach:** narrow but precise.
- **Best for:** the privacy-conscious case where "everywhere" is too much.

## Open questions about the HOW

Engage these **after** the WHAT is decided. The shape of the WHAT determines which mechanism makes sense.

### The isolation-rule tension

- AGENTS.md says brainkit must never modify the user's normal harness configuration. This is a load-bearing trust property.
- Mechanism #2 directly violates this. Mechanisms #1, #3, #5 do not (the user owns the config edit).
- If the WHAT requires brainkit to install into global config, the rule must be deliberately revised (with a written exception clause), not silently bent. Is the WHAT important enough to justify revising the rule?
- Is there an opt-in pattern that genuinely respects user agency (clear consent, easy uninstall, no surprise behavior) — or is "explicit opt-in" just consent-washing?

### Distribution per harness vs. universal

- One mechanism per harness (Claude / OpenCode / Copilot — each with its own skill format)?
- Or one universal mechanism (MCP, snippet) that works across all of them?
- If per-harness: maintenance multiplies; drift between implementations is inevitable.
- If universal: probably MCP, which is the strategic answer but heavier to build.

### Personalization

- How does the mechanism learn `brain_path`? Generated at install with the path baked in? Read at runtime from `~/.config/brainkit/config.toml`? Env var (`BRAINKIT_VAULT_PATH`)?
- Runtime read is more resilient (no stale-pointer rot when the user moves the vault), but requires the agent to perform a runtime lookup.
- Multi-vault: list all, pick default, or prompt? Depends on what the WHAT says about multi-vault for this feature.

### Lifecycle (only relevant if mechanism owns installed files)

- Auto-update on every brainkit launch: detection (version marker + config hash), failure mode, performance budget, multi-harness coordination, uninstall on `brain_path` removal, scope to brainkit-owned files only.
- Alternative: lazy `brainkit doctor` check that surfaces drift but requires user action.
- Opt-out for power users who want to pin or hand-edit (`auto_update_external_skill = false`, `.brainkit-pin` marker).
- Honest question: how much of this lifecycle complexity disappears entirely if the mechanism is #1 (snippet) or #3 (MCP)?

### Composition with brainkit-launched sessions

- If the user runs `brainkit oc` and the global mechanism is also active, what wins? Duplicated context? Supersede? Deactivate?
- The mechanism's content should probably defer to a brainkit-launched session when one is active.

### Identity in the mechanism

- Should the mechanism carry the user's identity (name, role) for richer agent behavior, or just the path?
- Identity in non-brainkit contexts risks bleeding into client-context transcripts. Probably path-only as default.

### Remote brains and team vaults

- Today `brain_path` is local. Mechanisms that bake a path assume locality. Mechanisms that read at runtime can adapt to whatever brainkit's brain abstraction becomes.
- Strong overlap with `.todo/backlog/team-vault.md` and the unwritten remote-brain story. Coordinate when both leave backlog.

### Reach beyond coding harnesses

- Mechanisms #1 and #2 reach only harnesses brainkit knows about.
- Mechanism #3 (MCP) reaches the broader agent ecosystem (desktop assistants, voice, future platforms).
- If the WHAT endorses the broader brain-as-layer thesis, the HOW probably needs to include MCP eventually — even if not first.

## What this file is NOT

- Not an implementation spec.
- Not a final decision — it's the framing for the next review.
- Not a debate about the harness-isolation rule **at the WHAT stage** (engage that debate only when discussing the HOW).

## Acceptance criteria for the next review

The next review should produce, **in order**:

**On the WHAT (primary):**

- [ ] A clear stance on whether the brain-as-layer thesis is the right strategic direction for brainkit.
- [ ] An opinion on capture vs. retrieval — which direction to invest in first, and why.
- [ ] An opinion on which surfaces matter most (coding harnesses only, or also desktop/voice/non-coding agents).
- [ ] An honest assessment of the privacy and trust risks inherent in "brain visible everywhere."
- [ ] A recommendation on whether this idea should be promoted, deferred, reshaped, or killed.

**On the HOW (secondary, only if the WHAT is endorsed):**

- [ ] A stance on per-harness vs. harness-agnostic (MCP-like) as the strategic target, even if the tactical first step is different.
- [ ] A recommended mechanism for v1 (likely the cheapest validation path) and a recommended strategic mechanism for v2+.
- [ ] A position on the harness-isolation rule: honor it (constrain the HOW), revise it (justify the carve-out), or sidestep it (mechanism the user owns).
- [ ] A view on lifecycle complexity (auto-update, drift, opt-out) — necessary or accidental, and how much of it goes away under different mechanism choices.

## Notes

- A previous review correctly identified that `brainkit <harness> --cwd <path>` is a much smaller, higher-leverage tactical feature that solves the "I'm in another repo and want brainkit" case. That feature is worth doing on its own merits regardless of what happens to this idea — it should likely be split into its own backlog item.
- This idea (brain-as-layer) is bigger than the `--cwd` feature: it's about reaching agent surfaces brainkit doesn't and won't ever launch directly.
- Consider running the `brainstorming` skill when this is picked up.
