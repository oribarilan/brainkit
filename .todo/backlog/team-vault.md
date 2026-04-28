# team-vault

> **Status:** Idea, not designed. Requires brainstorming session before any spec or implementation work. Do **not** start implementing — open questions below need answers first.

## Context

Brainkit today is a single-user second brain: one local brain directory, one or more vaults, all owned by one person on one machine. Multi-vault (`specs/US-multi-vault.md`) solved the work/life split for an individual but explicitly excluded shared/team scenarios.

Teams want the same thing brainkit gives individuals — a structured PARA vault, skills, bragfile, contacts, meeting notes — but **shared across multiple people**. Use cases that motivate this:

- A small team keeping shared project notes, decisions, and meeting minutes in one place
- An engineering org maintaining shared "areas" (on-call runbooks, architectural decisions, team contacts) while each person keeps personal projects local
- Pairs/duos (founders, partners) who want one source of truth instead of two parallel brains
- Async handoffs — someone updates a project's notes, the next person picks up with full context next session

A shared vault would likely live in a git repo (GitHub/GitLab) and be cloned by each team member, with brainkit operating against the local clone. The agent reads/writes markdown; git handles sync and conflict resolution at the file level.

**Value delivered (hypothesized — to be validated in brainstorming):**

- Teams get the same agent-augmented second brain individuals get today
- Shared institutional memory survives turnover and context-switching
- Brainkit becomes useful for organizations, not just individuals — meaningfully expands the addressable use cases
- Reuses the existing PARA + skills + features stack rather than building a parallel system

## Related Files

- `specs/US-multi-vault.md` — current vault model; team vault is a sibling concept
- `core/vault.ts` — vault discovery, file ops; would need to handle a "team" vault flavor
- `core/types.ts` — `BrainkitConfig`, `BrainkitGlobalConfig`; likely need new fields
- `skills/bragfile/`, `skills/contacts/`, `skills/meeting-notes/` — features that change meaning when shared (whose bragfile? whose contacts?)
- `skills/onboarding/` — onboarding flow assumes a single user
- `core/system-prompt.ts` — currently injects single user identity; team context is different
- `docs/features.md` — would gain a new feature entry
- `specs/01-vision.md`, `specs/02-architecture.md` — vision/architecture impact

## Dependencies

- **Hard:** Multi-vault (`US-multi-vault.md`) must be merged. Team vaults are most naturally modeled as another vault flavor under `brain_path`.
- **Soft:** Auto-commit (`docs/auto-commit.md`) — already commits per session; team vaults will likely need push/pull on top.
- **Soft:** Existing-vault adoption (`specs/12-existing-vault-adoption.md`) — joining a team vault = adopting an existing vault someone else created.

## Open Questions (resolve in brainstorming)

These are the unknowns that block design. They are not acceptance criteria — they are the agenda for the brainstorming session.

### Scope & shape

- Is a "team vault" a new vault **flavor** (e.g., `brainkit.toml` declares `kind = "team"`) or just a regular vault that happens to live in a shared git repo? What's the minimum that needs to change?
- Does a user have **one team vault** alongside personal vaults, or can they belong to multiple teams?
- Is shared content the whole vault, or only certain PARA folders (e.g., shared `02_areas/`, private `01_projects/`)? Mixed-mode is powerful but complex.

### Identity

- Today `brainkit.toml` has one `[user]`. With multiple humans sharing a vault, whose identity does the agent assume? Per-machine override? Per-session prompt?
- Bragfile is intrinsically per-person — does each user get their own `bragfile.md` (e.g., `02_areas/career/bragfile.<username>.md`), or is bragfile suppressed in team vaults?
- Contacts: shared list, per-user list, or both?
- Meeting notes: who is "I" in notes the agent writes?

### Sync & conflict

- Git is the obvious sync layer. Does brainkit drive git (auto pull on launch, push on idle), or does the user own git and brainkit just reads/writes files?
- How are conflicts surfaced? File-level git conflicts in markdown are usually resolvable by a human, but the agent should probably refuse to write into a conflicted file.
- Offline edits + later sync — acceptable, or do we need stricter coordination?

### Permissions & safety

- Does brainkit need any concept of permissions (read-only areas, owner-only files), or is git/repo permissions enough?
- Auto-commit is already opt-in; for team vaults, should it be on by default with push? Or stay manual?
- Secrets / sensitive content — same risks as today, but blast radius is larger. Any new guardrails needed?

### Onboarding

- How does a new team member join an existing team vault? Clone the repo, run brainkit, point at it? Does brainkit help with the clone, or assume it's done?
- First-run Q&A is currently personal ("what's your name, what do you do"). For a team vault, is there a separate "team setup" flow run once by the founder, plus a lightweight "join" flow for everyone after?

### Agent behavior

- Should the agent know who else is on the team (read from a `team.toml` or similar) so it can write notes like "discussed with Dana" rather than "discussed with someone"?
- Does the agent need a different persona / system prompt section in team mode (e.g., "you are working in a shared vault — be conservative about overwrites")?
- Skills: do any current skills become wrong or harmful in a team context? (e.g., bragfile skill assumes the vault is yours.)

### Distribution & harness

- Any harness-specific concerns (OpenCode vs Copilot CLI vs Claude) for team vaults? Particularly around the per-machine identity.
- Does this affect the CLI surface (`brainkit --vault team-name`)? Probably reuses multi-vault selection, but worth confirming.

### Non-goals to consider

- Real-time collaboration (multiple agents writing simultaneously) — almost certainly out of scope.
- Hosted/SaaS team brain — almost certainly out of scope; brainkit stays local-first.
- Access control beyond what git/repo permissions provide — probably out of scope.

## Acceptance Criteria

Not defined yet — the brainstorming output should include:

- [ ] A 1-paragraph problem statement narrowed to a specific shape (which of the use cases above are in/out)
- [ ] Decisions (or explicit deferrals) for each open question above
- [ ] A units-of-work breakdown similar to `US-multi-vault.md`
- [ ] A list of features/skills that need updating vs. added vs. left alone
- [ ] A promotion path: when this leaves backlog and becomes `specs/US-team-vault.md`

## Verification

N/A at this stage. Once designed, verification is defined per unit of work in the resulting spec.

## Notes

- Keep it small. The biggest risk here is the same as the original work/life split: designing a sprawling cross-cutting feature that touches every layer. Look for the smallest viable team vault first (probably: one shared vault, one identity per machine via env var, git managed by the user, no shared bragfile) and grow from there.
- Reference: `specs/US-multi-vault.md` is a good model for the eventual spec — short prose, explicit "what this replaces / what's not in scope", units of work that can parallelize.
- Consider running `brainstorming` skill when picking this up.
