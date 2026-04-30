# phase-1-shared-vault-docs

## Context

Before writing any shared-vault code beyond Phase 0's identity decoupling, we ship a **docs-only recipe** that lets motivated users try the manual workflow today. This is the validation gate: if no one uses the recipe, we do not build Phase 2.

The recipe is essentially: clone a shared git repo into your `brain_path`, edit `brainkit.toml` to disable bragfile, set up your machine identity (Phase 0), and use git manually to sync.

**Value delivered:** Validates real demand for shared vaults before any meaningful code investment. Gives early adopters a concrete path forward. Generates feedback that shapes Phase 2's design.

This phase is **not** a feature. It is a deliberate "wait and watch" gate.

## Related Files

- `docs/shared-vaults.md` — new file (the recipe).
- `docs/features.md` — add a brief "Shared Vaults (experimental — manual)" entry that links to `shared-vaults.md` and clearly labels it as not yet a first-class feature.
- `README.md` — possibly add a small mention with link, or defer to Phase 2.
- `.todo/US-shared-vaults/main.md` — update once Phase 1 ships and adoption tracking begins.

## Dependencies

- **Hard:** `phase-0-identity-decoupling.md` must be merged. The recipe relies on `~/.config/brainkit/identity.toml` to attribute the user's edits.

## Acceptance Criteria

- [ ] `docs/shared-vaults.md` exists and contains:
  - A clear preamble: "Shared vaults are experimental and not yet a first-class feature. This page describes a manual recipe. Brainkit does not currently know your vault is shared."
  - The recipe in numbered steps: (1) create or clone a git repo, (2) place it under `brain_path`, (3) ensure it has a `brainkit.toml` with `features.bragfile = false`, (4) set up `~/.config/brainkit/identity.toml` per Phase 0, (5) use `git pull` before sessions and `git push` after, (6) optionally enable auto-commit per the existing auto-commit docs.
  - An explicit list of caveats: agent will still use first-person voice; agent will not know about other contributors; agent may attempt bragfile entries in chat (skill not yet shipped); merge conflicts are your problem.
  - A "what works today / what doesn't" table.
  - A "feedback wanted" section pointing to a GitHub issue or discussion thread for users to report whether they tried it.
- [ ] `docs/features.md` lists the entry with a clear "experimental — manual recipe only" label and links to `docs/shared-vaults.md`.
- [ ] No code changes in this phase. (Verify with `git diff --stat` showing only docs.)
- [ ] A tracking issue or note exists (in the repo or `.todo/`) where Phase 1 adoption is tallied. Phase 2 is gated on ≥3 distinct users reporting they tried the recipe.

## Verification

**Ad-hoc (only verification possible — this is docs):**
- Read `docs/shared-vaults.md` end-to-end and confirm a new user could follow it without prior context.
- Confirm every command in the recipe works as written (test the recipe yourself with a throwaway repo).
- Confirm `git diff --stat` between this phase's branch and main shows only `docs/` and possibly `README.md` and `.todo/` changes — no source code.
- Confirm the link from `docs/features.md` to `docs/shared-vaults.md` resolves.

## Notes

- **Resist the urge to ship Phase 2 in the same PR.** The whole point of Phase 1 is the validation gate. Shipping code now defeats the purpose.
- The "feedback wanted" mechanism can be as simple as a pinned GitHub discussion. Don't overbuild the tracking.
- If Phase 1 sits unused for 3+ months, that is signal — pause the US and revisit whether shared vaults are worth building. The contrarian view in the council was: hypothetical demand is not demand.
- This phase is genuinely small. ~1 docs page, ~1 hour of work. Do not pad it.
