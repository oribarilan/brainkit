# US-wl-9: Docs update

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-2, US-wl-3
**Unblocks:** nothing

## Goal

Update all feature docs and README to reflect the dual sub-vault structure, scoped agents, and new path conventions.

## Changes

### `docs/para.md`

- Describe the dual PARA tree structure (`work/` and `life/` each with full PARA)
- Update vault structure diagrams
- Note that PARA paths in the docs are relative to the sub-vault

### `docs/bragfile.md`

- Update path from `02_areas/career/bragfile.md` to `work/02_areas/career/bragfile.md`
- Note that bragfile exists only in the work sub-vault
- Document that brag detection is suppressed in the life agent

### `docs/contacts.md`

- Update path from `03_resources/contacts.md` to `work/contacts.md` and `life/contacts.md`
- Explain two separate contacts files
- Document `"all"` scope behavior (search merges both files)

### `docs/meeting-notes.md`

- Update example paths to show sub-vault context
- Note that meeting notes go into the sub-vault matching the agent's scope

### `docs/doctor.md`

- Document dual-level health checks (root validation + per-sub-vault PARA validation)
- Update expected vault structure in diagnostics examples

### `docs/onboarding.md`

- Document dual sub-vault creation
- Remove scope question from onboarding flow
- Update phase routing (Phase 2 → work/, Phase 3 → life/)

### `docs/auto-commit.md`

- Note that auto-commit operates on the whole vault regardless of active scope

### `docs/tui.md`

- Document three agents (bk, work, life) and how to switch between them
- Update sidebar stats description (scoped vs aggregate)

### `docs/config.md`

- Remove `user.scope` field documentation
- Note that scope is now determined by agent selection

### `README.md`

- Update vault structure example if shown
- Mention the three agents if the README covers usage

## Acceptance criteria

- [ ] All 8 feature docs updated with sub-vault paths
- [ ] No doc references `03_resources/contacts.md` (old path)
- [ ] No doc references `config.user.scope` (removed)
- [ ] Agent selection documented in TUI docs
- [ ] Config docs reflect scope removal
