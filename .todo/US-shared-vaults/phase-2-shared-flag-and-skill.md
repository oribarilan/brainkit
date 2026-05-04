# phase-2-shared-flag-and-skill

## Context

Phase 1 validated demand by having ≥3 distinct users try the manual recipe and report back. Phase 2 promotes shared-vaults from "manual recipe" to a first-class (but minimal) feature.

The mechanism is: a single feature flag `features.shared = true` in `brainkit.toml`, conditional skill loading, and branched prompt sections. No new vault type, no member registry, no sync logic.

**Value delivered:** The agent finally _knows_ it's in a shared vault and behaves correctly: attributes contributions, suppresses personal-only features (especially the bragfile auto-detection that today fires unconditionally), uses neutral/attributed voice, and warns about shared-context pitfalls.

This is the "real" feature. Everything before this phase is plumbing or validation.

## Related Files

### Code

- `core/types.ts` — add `shared?: boolean` to `BrainkitFeatures`.
- `core/vault.ts` — `readVaultConfig` parses the new flag; `runHealthChecks` adds shared-vault-specific checks.
- `core/prompt-sections.ts` — branch `buildIdentity`, `buildConventions`, `buildBragReminder`, `buildProfileNudge`, `buildOnboarding` on `features.shared`.
- `core/system-prompt.ts` — load `shared-vault` skill when `features.shared === true`; skip personal-only skills accordingly.
- `opencode/server.ts:88-103` — gate the `session.idle` brag detector on `features.bragfile === true && features.shared !== true`.
- Equivalent harness hooks in `claude/` and the Copilot launcher path — same gating rule.

### Skills (client-side)

- `skills/shared-vault/SKILL.md` — **new.** Attribution rules, no first-person voice, no personal data, conflict hygiene, what NOT to put here, manual git workflow.
- `skills/bragfile/SKILL.md` — append a "Not in shared vaults" note redirecting personal accomplishments to the user's personal vault.
- `skills/meeting-notes/SKILL.md` — append shared-vault conventions: named recorder/attendees, no `self`, owners on action items.
- `skills/contacts/SKILL.md` — append: in shared vaults, contacts are a team directory (role, team, timezone, relevant projects); avoid personal relationship fields.
- `skills/onboarding/SKILL.md` — branch: if `features.shared`, skip the personal Q&A; only prompt for machine identity if Phase 0's `identity.toml` is unset.

### Tests

- `core/__tests__/vault.test.ts` — coverage for parsing `features.shared`, health checks, missing identity hard-fail.
- `core/__tests__/prompt-sections.test.ts` — coverage for each branched section.
- `opencode/__tests__/server.test.ts` (if exists) — coverage for the gated brag detector.

### Docs

- `docs/shared-vaults.md` — promote from "experimental manual recipe" to "first-class feature." Replace recipe with: "set `features.shared = true` and brainkit handles the rest."
- `docs/features.md` — promote the Shared Vaults entry; remove "experimental" qualifier.

## Dependencies

- **Hard:** `phase-0-identity-decoupling.md` merged. The shared-vault skill mandates machine identity; Phase 2 must hard-fail when missing.
- **Hard:** `phase-1-shared-vault-docs.md` merged AND validation gate met (≥3 distinct users tried the recipe and gave feedback).
- **Soft:** auto-commit (already opt-in). Recommend enabling it in shared-vaults docs but do not change defaults.

## Acceptance Criteria

### Config + types

- [ ] `BrainkitFeatures` in `core/types.ts` gains optional `shared?: boolean` (default `false`).
- [ ] `readVaultConfig` parses `features.shared` correctly. Backward compatible: missing field = `false`.
- [ ] **No `kind` field is added.** This is the locked-in architectural decision per the US main.md.

### System prompt branching

- [ ] `buildIdentity` in shared mode: names the vault as a shared resource, names the resolved current human (from `resolveAgentIdentity`), warns about personal data. In personal mode: unchanged.
- [ ] `buildConventions` in shared mode: replaces "use first person" with "use neutral or attributed voice; name people explicitly when relevant."
- [ ] `buildBragReminder` returns empty string when `features.shared === true`, regardless of `features.bragfile`.
- [ ] `buildProfileNudge` skips personal fields (work description, personal description, etc.) in shared mode.
- [ ] `buildOnboarding` in shared mode: if machine identity unset, prompt only for that; do not run personal Q&A.

### Skill loading

- [ ] `skills/shared-vault/SKILL.md` exists with attribution rules, voice guidance, personal-data exclusion list, git hygiene, and conflict guidance ("on conflict, stop and surface to the user; never auto-resolve").
- [ ] `skills/shared-vault/SKILL.md` is conditionally loaded only when `features.shared === true` (verified across OpenCode, Copilot CLI, Claude Code where applicable).
- [ ] `skills/bragfile/SKILL.md` is **not** loaded when `features.shared === true`.
- [ ] Existing skills (`meeting-notes`, `contacts`, `onboarding`) have their shared-vault appendices added and are tested for the conditional behavior.

### Brag suppression

- [ ] `opencode/server.ts` brag detector at lines ~88–103 is gated on `features.bragfile === true && features.shared !== true`. Verified by test or manual trigger.
- [ ] Equivalent gating exists in any other harness's brag-detection hook.

### Health checks

- [ ] `runHealthChecks` warns if `features.shared === true` and a `bragfile.md` is found at any conventional path.
- [ ] `runHealthChecks` errors if `features.shared === true` and the vault is not a git repo with a remote.
- [ ] `runHealthChecks` warns if `features.shared === true` and `[user]` block is present in `brainkit.toml` (likely a copy-paste from a personal vault).
- [ ] The existing GitHub privacy check (`vault.ts:656-689`) is demoted from error to warn when `features.shared === true` (public OSS knowledge bases are valid).

### Identity hard-fail

- [ ] When `features.shared === true` and `resolveAgentIdentity` returns source `'none'`, the session refuses to start (or surfaces a clear, prompt-level error: "Shared vault requires a machine identity. Set `~/.config/brainkit/identity.toml` or `BRAINKIT_IDENTITY_NAME`.").

### Cross-cutting

- [ ] No new runtime dependencies.
- [ ] No new subcommand or CLI surface.
- [ ] Harness config isolation preserved (no writes outside `~/.config/brainkit/` and the vault).
- [ ] CI passes including Windows job.

## Verification

**Automated (preferred):**

- New tests in `core/__tests__/` for: parsing `features.shared`, every branched prompt section, every new health check, identity hard-fail.
- New test for the brag-detector gate (mock the session.idle event and assert no brag toast in shared mode).
- `just check` passes (lint + format + test).

**Ad-hoc end-to-end:**

1. Create a throwaway git repo with `brainkit.toml` containing `features.shared = true`. Clone to two paths simulating two machines (or use `BRAINKIT_IDENTITY_NAME=Alice` and `=Bob` overrides).
2. Run `just dev` against vault as Alice. Have the agent write a meeting note. Inspect — confirm attribution to Alice, no first-person.
3. Switch identity to Bob. Run again. Have the agent add an entry. Confirm attribution to Bob.
4. Mention an accomplishment ("I shipped X today") in the agent chat. Confirm **no** brag toast appears (gating works).
5. Remove identity. Try to start a session. Confirm hard-fail with clear message.
6. Run brainkit doctor. Confirm new health checks fire correctly (test each: no remote, bragfile present, `[user]` present, public repo demoted to warn).

## Notes

- The biggest risk is scope creep. The council was unanimous: resist `if (isShared)` branches anywhere outside the three places listed (system prompt sections, skill loading, brag detector). Every other behavior should be unchanged.
- The skill is load-bearing. Spend real time on `skills/shared-vault/SKILL.md` — it's the contract with the agent. Keep it under ~150 lines (skills compete for context window).
- Test the full system-prompt output for a shared vault (snapshot test if possible) to catch regressions in section composition.
- Document explicitly in `specs/US-shared-vaults.md` (Finalize phase) what was deferred and why — so future contributors can refuse "while we're at it" feature requests with a citation.
