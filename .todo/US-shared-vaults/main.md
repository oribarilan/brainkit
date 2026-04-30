# US-shared-vaults

> **Origin:** This US replaces and supersedes `.todo/backlog/team-vault.md`. The original "team vault" framing was deliberately rejected after a council review (see Decisions below). The chosen direction is "shared vaults" as a vault property, not a vault type, and the unit of design is shared-co-edited markdown — applicable to teams, OSS maintainers, founders, couples, etc.

## Goal

Enable brainkit to be used safely and usefully against a vault that is **co-edited by multiple humans via a shared git repo**, without diluting the single-user value prop or building team-management features.

The end state: a brainkit user can clone a shared git repo, point brainkit at it, and the agent behaves correctly — attributing contributions to the right human, suppressing personal-only features (bragfile), avoiding first-person ambiguity, and respecting the shared-context conventions taught by a dedicated skill.

The mechanism is a single boolean (`features.shared = true`) plus per-machine identity decoupling. No new CLI, no subcommand, no `kind` discriminator, no member registry, no sync engine.

## Definition of Done

The user story is done when **all three phases below have shipped, in order**, and:

- [ ] A user with multiple machines can run brainkit against the same vault on each machine and have the agent attribute contributions to distinct humans (Phase 1 — identity decoupling — fully verified end-to-end).
- [ ] A user can clone a shared git repo, set `features.shared = true` in `brainkit.toml`, and the agent (across all three harnesses: OpenCode, Copilot CLI, Claude Code) loads the `shared-vault` skill, suppresses bragfile auto-detection, and uses attributed/neutral voice (Phase 3 verified end-to-end on at least one harness; documented behavior on the others).
- [ ] No new runtime dependencies were added.
- [ ] No subcommand or separate CLI was introduced.
- [ ] Harness config isolation is preserved (no writes to user's global harness config).
- [ ] `docs/features.md` includes a "Shared Vaults" entry.
- [ ] A `specs/US-shared-vaults.md` exists capturing the final spec, non-goals, and the explicit list of deferred items so future contributors can refuse scope creep with a citation.
- [x] `.todo/backlog/team-vault.md` is deleted (this US supersedes it — done at creation time).

## Task Priority

The phasing is **gated** — do not skip ahead. Each phase ships independent value.

1. **`phase-0-identity-decoupling.md`** — first, always. Adds `~/.config/brainkit/identity.toml` + `BRAINKIT_IDENTITY` env var + identity resolution function. Independently valuable for personal multi-machine users (the "work laptop + personal laptop, same vault" case). Ships even if Phases 2/3 never happen.
2. **`phase-1-shared-vault-docs.md`** — only after Phase 0 is merged AND at least one real user has asked. Ships a docs page describing the manual recipe (clone repo, disable bragfile, use identity override, run git manually). No code changes. This is the validation gate before any shared-vault code.
3. **`phase-2-shared-flag-and-skill.md`** — only after Phase 1 has been used by ≥3 distinct users with concrete feedback. Adds `features.shared = true`, conditionally loads `skills/shared-vault/SKILL.md`, gates bragfile auto-detection on `!shared`, branches the relevant prompt sections. This is the "real" feature.
4. **`finalize-spec-and-supersede-backlog.md`** — last. Writes `specs/US-shared-vaults.md`, updates `docs/features.md`, deletes the obsolete `.todo/backlog/team-vault.md`, and confirms the story-level Definition of Done.

## Cross-Cutting Concerns

### Architectural decisions (locked in — do not relitigate per task)

These were decided in council review. Captured here so each task can reference them and so future PRs can be rejected with a citation.

- **Property, not type.** Use `features.shared = true` (a boolean feature flag), **never** `kind = "team"` (a vault type discriminator). This prevents `if (isTeam)` branches from proliferating across the codebase and keeps the change additive.
- **Word "team" is banned in code, config, and skill names.** Use "shared." Rationale: "team" implies orchestration (members, roles, permissions, onboarding flows for joiners) that we explicitly will not build. "Shared" describes the actual property: this vault is co-edited.
- **Identity is per-machine, not per-vault.** Identity lives in `~/.config/brainkit/identity.toml` (under brainkit's owned config dir, preserving harness isolation). The vault knows *about* people via a `shared-vault` skill convention; it does not *own* an identity.
- **Identity resolution order:** (1) `BRAINKIT_IDENTITY_*` env vars → (2) `~/.config/brainkit/identity.toml` → (3) personal vault's `[user].name` (only for non-shared vaults) → (4) `git config user.name` as last-resort fallback.
- **Git is the sync layer. Brainkit is not.** No auto-pull, no auto-push, no merge UI, no conflict resolution, no permissions. Document the manual git workflow in the `shared-vault` skill.
- **No subcommand. No separate CLI.** Brainkit deliberately has no subcommands today; this US does not introduce one. No `teamkit`, no `brainkit team`, no `brainkit share`.
- **Suppress bragfile auto-detection in shared vaults.** The current `session.idle` handler in `opencode/server.ts:88-103` runs unconditionally. In Phase 2 it must be gated on `features.bragfile === true && features.shared !== true`. This is the single highest-value behavioral change.
- **Hard-fail on missing identity.** When `features.shared === true` and no machine identity is resolvable, refuse to start the session (or load the agent with a clear error in the system prompt). Silent attribution drift is worse than a hard error.

### Non-goals (write these into `specs/US-shared-vaults.md` to refuse scope creep)

- Real-time collaboration / multiple agents writing simultaneously
- Hosted/SaaS shared brain
- Access control beyond what the underlying git host provides
- Member registries, roles, RACI, org charts
- Auto-pull, auto-push, conflict resolution UX
- Onboarding flows for "joining a team" (cloning a repo + setting `features.shared = true` is the flow)
- Per-vault identity overrides (per-machine is the only level we support)
- Project-as-submodule reframing (interesting but out of scope; revisit if shared-vaults adoption stalls)

### Constraints carried from `AGENTS.md`

- Cross-platform (Win/Mac/Linux). Identity file path uses `os.homedir()` + `path.join`.
- No new runtime dependencies.
- Harness config isolation: identity.toml lives under `~/.config/brainkit/`, never in the harness's own config dirs.
- Path traversal protection on all vault file operations (unchanged).

### Skills affected (Phase 2)

- **New:** `skills/shared-vault/SKILL.md` — attribution rules, no first-person, no personal data, conflict hygiene, what NOT to put here.
- **Modified:** `skills/bragfile/SKILL.md` — append: "Bragfile is structurally absent in shared vaults; redirect personal accomplishments to the user's personal vault."
- **Modified:** `skills/meeting-notes/SKILL.md` — append: "In shared vaults, prefix notes with the recording human's name from machine identity. Use named attendees, not `self`."
- **Modified:** `skills/contacts/SKILL.md` — append: "In shared vaults, contacts are a team directory: role, team, timezone, relevant projects. Avoid personal relationship fields."
- **Modified:** `skills/onboarding/SKILL.md` — branch: if `features.shared === true`, skip personal Q&A; ask only for machine identity if not yet set.

### System prompt sections affected (Phase 2)

In `core/prompt-sections.ts`:
- `buildIdentity` — branch on `features.shared`. Shared mode reads from machine identity, names the vault's purpose, names other contributors if discoverable, warns about personal data.
- `buildConventions` — shared mode replaces "use first person" with "use neutral or attributed voice; name people explicitly".
- `buildBragReminder` — return empty string when shared.
- `buildProfileNudge` — skip personal fields when shared.
- `buildOnboarding` — branch to a minimal "set machine identity" prompt when shared and identity unset.

### Health checks (Phase 2)

In `runHealthChecks`:
- If `features.shared === true`, warn if a `bragfile.md` exists at any conventional path (likely a leftover from a personal vault).
- If `features.shared === true`, error if the vault is not a git repo with a remote.
- Demote the existing GitHub privacy check (`vault.ts:656-689`) from error to warn when shared (deliberately-public OSS knowledge bases are valid).
- Verify `[user]` is absent from a shared vault's `brainkit.toml` (or warn if present — likely a copy-paste from a personal vault).

## Validation gates between phases

- **Phase 0 → Phase 1:** at least one user (yourself counts) has used `identity.toml` for ≥1 week without bugs.
- **Phase 1 → Phase 2:** at least 3 distinct users have tried the manual recipe and provided concrete feedback. If no one tries, do not build Phase 2 — the demand isn't there.
- **Phase 2 → Finalize:** Phase 2 has shipped, been used in at least one real shared-vault scenario, and surfaced no architectural surprises.

If a gate fails (e.g., no one uses Phase 1), pause the US and revisit. Do not push through.
