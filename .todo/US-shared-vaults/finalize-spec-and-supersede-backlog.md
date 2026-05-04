# finalize-spec-and-supersede-backlog

## Context

After Phases 0–2 ship and Phase 2 has been used in at least one real shared-vault scenario, this task closes the user story by writing the canonical spec, updating feature docs, and removing the obsolete backlog entry that this US replaced.

**Value delivered:** A durable architectural record (`specs/US-shared-vaults.md`) that future contributors can cite when rejecting scope creep. Removes the ambiguity of having both `.todo/backlog/team-vault.md` and `.todo/US-shared-vaults/` floating around.

## Related Files

- `specs/US-shared-vaults.md` — **new.** The canonical spec.
- `docs/features.md` — promote Shared Vaults entry to its final form (drop "experimental" qualifier if still present).
- `.todo/backlog/team-vault.md` — **delete.** Superseded.
- `.todo/US-shared-vaults/main.md` — final review; check off story-level Definition of Done.
- Possibly `specs/01-vision.md` and `specs/02-architecture.md` — minor updates if shared-vaults changes the elevator pitch.

## Dependencies

- **Hard:** `phase-0-identity-decoupling.md`, `phase-1-shared-vault-docs.md`, `phase-2-shared-flag-and-skill.md` all merged and verified in production-like usage.
- **Hard:** at least one real shared-vault has been used in practice (you, a collaborator, or an external user) and surfaced no architectural surprises.

## Acceptance Criteria

- [ ] `specs/US-shared-vaults.md` exists, modeled on `specs/US-multi-vault.md`. Contains:
  - A 1-paragraph problem statement narrowed to the actual shipped shape ("shared vaults are git-backed markdown repos with `features.shared = true`; identity is per-machine; no team-management features").
  - The architectural decisions made in council, explicitly stated (property-not-type, no subcommand, no sync engine, etc.).
  - The full **non-goals** list from `main.md`'s Cross-Cutting Concerns, copied verbatim — this is the citation reference for future scope-creep rejections.
  - A "what was deferred and why" section summarizing the deferrals from each phase's task file.
  - A "what we'd do differently if starting over" section, populated from real usage feedback.
  - Cross-references to `specs/US-multi-vault.md` (the prior vault-flavor precedent).
- [ ] `docs/features.md` Shared Vaults entry is in its final form: no "experimental" qualifier, links to `specs/US-shared-vaults.md` for the design rationale, links to `docs/shared-vaults.md` for the user-facing recipe.
- [x] `.todo/backlog/team-vault.md` is deleted (done at US creation time — superseded by this US).
- [ ] `.todo/US-shared-vaults/main.md` story-level Definition of Done items are all checked.
- [ ] Phase 0/1/2 task files have been moved to `.todo/done/US-shared-vaults/` per the tasks skill workflow.
- [ ] After this task is verified, `main.md` itself moves to `.todo/done/US-shared-vaults/` and `.todo/US-shared-vaults/` is removed.

## Verification

**Ad-hoc:**

- Read `specs/US-shared-vaults.md` end-to-end. Confirm it captures every locked-in decision from the council and the non-goals list. Confirm a future contributor reading only this spec could understand both _what_ was built and _what was deliberately not built_.
- `ls .todo/backlog/team-vault.md` returns "no such file."
- `ls .todo/US-shared-vaults/` returns empty (or only files that need to also move).
- `ls .todo/done/US-shared-vaults/` contains `main.md` and all four phase task files.
- The links in `docs/features.md` resolve.

## Notes

- This is bookkeeping with teeth. The spec file is the single most important deliverable for the long-term health of this feature — without it, the next "let's add team member roles" PR has no anchor to be rejected against.
- If real usage in Phase 2 surfaced surprises that diverged from the original plan, the spec must reflect what was _actually built_, not what was _originally planned_. Be honest about deviations.
- Do not write the spec earlier (e.g., during Phase 2). Specs written before usage are speculation; specs written after are documentation. We want documentation.
