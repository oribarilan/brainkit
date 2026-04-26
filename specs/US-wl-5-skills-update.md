# US-wl-5: Skills update

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-3
**Unblocks:** nothing

## Goal

Update skills to work with the dual sub-vault structure. Most skills stay scope-relative (their paths don't change). Only the root brainkit skill needs structural updates.

## Strategy

Skills describe PARA paths relative to the sub-vault (e.g., `02_areas/career/bragfile.md`). The system prompt (updated in US-wl-3) establishes which sub-vault the agent is operating in, so skills don't need absolute paths like `work/02_areas/career/bragfile.md`.

This means most skill files need **no path changes**. The paths they reference (`02_areas/`, `03_resources/`, etc.) remain correct within any sub-vault.

## Changes

### `skills/brainkit/SKILL.md`

Update the vault structure overview to show the dual sub-vault layout:

```
vault/
  brainkit.toml
  work/
    01_projects/
    02_areas/
      career/
        bragfile.md
    03_resources/
    04_archive/
    contacts.md
  life/
    01_projects/
    02_areas/
    03_resources/
    04_archive/
    contacts.md
```

Add a note explaining the agent-scope relationship: "The active agent determines which sub-vault you're operating in. Paths in these skills are relative to the current sub-vault."

Update any mentions of `03_resources/contacts.md` to `contacts.md` (contacts moved to sub-vault root).

### `skills/para/SKILL.md`

Update the contacts path reference from `03_resources/contacts.md` to `contacts.md`.

### `skills/contacts/SKILL.md`

Update path references from `03_resources/contacts.md` to `contacts.md`.

### `skills/bragfile/SKILL.md`

No path changes needed. `02_areas/career/bragfile.md` is correct relative to the `work/` sub-vault.

### `skills/meeting-notes/SKILL.md`

No path changes needed. Meeting note paths (`01_projects/<name>/`, `02_areas/<area>/`) are already relative.

### `skills/maintenance/SKILL.md`

Update the contacts path reference. Add a note that health checks now validate both sub-vaults.

### `skills/onboarding/SKILL.md`

Update to reflect dual sub-vault creation. Phase 2 (professional) populates `work/`, Phase 3 (personal) populates `life/`.

## Tests

No automated tests for skill content (markdown files). Manual verification:

- Grep all SKILL.md files for `03_resources/contacts.md` — should return zero matches after update
- Grep for hardcoded `work/` or `life/` prefixes in skills other than brainkit — should return zero (skills are scope-relative)

## Acceptance criteria

- [ ] `skills/brainkit/SKILL.md` shows dual sub-vault structure
- [ ] All contacts path references updated from `03_resources/contacts.md` to `contacts.md`
- [ ] No skill (except brainkit root) contains hardcoded `work/` or `life/` prefixes
- [ ] Onboarding skill describes dual sub-vault setup
