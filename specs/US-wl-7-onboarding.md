# US-wl-7: Onboarding for dual vaults

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-2
**Unblocks:** nothing

## Goal

Update the onboarding flow to create both sub-vault PARA structures and route professional/personal setup content to the correct sub-vault.

## Changes

### Onboarding creates dual PARA trees

When the agent sets up a fresh vault, it creates:

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

### Phase routing

The onboarding flow has phases. Content from each phase routes to the correct sub-vault:

- **Phase 2 (professional life):** Projects, areas, and contacts go into `work/`. The bragfile is created at `work/02_areas/career/bragfile.md`.
- **Phase 3 (personal life):** Projects, areas, and contacts go into `life/`.

### `core/vault.ts` — helper function (if needed)

If onboarding currently calls utility functions to create the PARA structure, those functions need to accept a scope parameter to create the structure within a sub-vault:

```typescript
function createParaStructure(vaultPath: string, scope: SubVault): void {
  for (const dir of Object.values(PARA)) {
    fs.mkdirSync(resolveVaultPath(vaultPath, scope, dir), { recursive: true });
  }
}
```

### `skills/onboarding/SKILL.md`

Already addressed in US-wl-5, but specifically:
- Remove the "professional, personal, or both" scope question
- Update the phase descriptions to mention `work/` and `life/` sub-vaults
- Update example paths to show sub-vault-relative structure

### Error handling

If vault creation fails partway (e.g., `work/` created but `life/` fails):
- The `isVaultFresh()` check should still detect the vault as partially set up
- The onboarding flow should be able to resume and create missing structure
- Do not leave the vault in a broken state — if creation fails, surface a clear error

## Tests

File: `core/__tests__/vault.test.ts`

- `createParaStructure("work")` creates all 4 PARA dirs inside `work/`
- `createParaStructure("life")` creates all 4 PARA dirs inside `life/`
- Full onboarding creates both sub-vaults with expected structure
- Partial creation recovery: if `work/` exists but `life/` doesn't, onboarding detects and creates `life/`

## Acceptance criteria

- [ ] Fresh vault setup creates both `work/` and `life/` PARA trees
- [ ] Bragfile created only in `work/02_areas/career/bragfile.md`
- [ ] Contacts files created at `work/contacts.md` and `life/contacts.md`
- [ ] Phase 2 content routes to `work/`, Phase 3 to `life/`
- [ ] Scope question removed from onboarding
- [ ] Partial creation is recoverable
- [ ] Tests pass
