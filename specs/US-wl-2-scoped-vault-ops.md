# US-wl-2: Scoped vault operations

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** US-wl-1
**Unblocks:** US-wl-7, US-wl-9

## Goal

Update all vault operations (bragfile, contacts, health checks, vault state detection) to use scope-aware paths via `resolveVaultPath()`.

## Changes

### `core/vault.ts`

**Bragfile operations** gain a `scope` parameter (default `"work"` since bragfile is work-only):

- `readBragfile(vaultPath, scope?: SubVault)` — defaults to `"work"`, resolves `KEY_FILES.bragfile` through `resolveVaultPath`
- `appendBragEntry(vaultPath, entry, scope?: SubVault)` — same pattern
- `getBragStats(vaultPath, scope?: SubVault)` — delegates to `readBragfile`

**Contact operations** gain a `scope` parameter:

- `readContacts(vaultPath, scope: VaultScope)` — `"work"` or `"life"` reads one file; `"all"` reads both and concatenates
- `addContact(vaultPath, contact, scope: SubVault)` — must be `"work"` or `"life"`, not `"all"`
- `searchContacts(contacts, query)` — no change (pure function, operates on already-loaded data)
- `parseContacts(content)` — no change (pure parser)

Contacts file path changes from `KEY_FILES.contacts` (`03_resources/contacts.md`) to `contacts.md` (at sub-vault root). Update `KEY_FILES` accordingly:

```typescript
export const KEY_FILES = {
  bragfile: "02_areas/career/bragfile.md",
  contacts: "contacts.md",  // was 03_resources/contacts.md
  config: "brainkit.toml",
} as const;
```

**Health checks** — `runHealthChecks(vaultPath)`:

- Validate root structure: only `brainkit.toml`, `AGENTS.md`, `README.md`, `work/`, `life/` allowed at vault root
- For each sub-vault (`work/`, `life/`): validate PARA dirs exist, validate sub-vault-specific key files (`contacts.md` in both, `bragfile.md` only in `work/`)
- Return results tagged with which sub-vault they came from

**Vault state** — `detectVaultState(vaultPath)` and `isVaultFresh(vaultPath)`:

- Check for `brainkit.toml` at vault root (unchanged)
- `isVaultFresh` checks both sub-vaults for content

### `core/vault.ts` — `allowedRootEntries`

Update from:

```typescript
const allowedRootEntries = new Set([...Object.values(PARA), KEY_FILES.config, "README.md", "AGENTS.md"]);
```

To:

```typescript
const allowedRootEntries = new Set([...SUB_VAULTS, KEY_FILES.config, "README.md", "AGENTS.md"]);
```

## Tests

File: `core/__tests__/vault.test.ts`

**Bragfile:**
- `readBragfile(vaultPath)` reads from `work/02_areas/career/bragfile.md` by default
- `readBragfile(vaultPath, "work")` reads from `work/02_areas/career/bragfile.md`
- `appendBragEntry` writes to the correct scoped path

**Contacts:**
- `readContacts(vaultPath, "work")` reads `work/contacts.md`
- `readContacts(vaultPath, "life")` reads `life/contacts.md`
- `readContacts(vaultPath, "all")` reads both and concatenates
- `addContact(vaultPath, contact, "work")` appends to `work/contacts.md`

**Health checks:**
- Valid dual-vault structure passes
- Missing PARA dir in one sub-vault reported with sub-vault context
- Unexpected file at vault root (e.g., stray `notes.md`) reported
- `work/` has bragfile check, `life/` does not

**Vault state:**
- `isVaultFresh` returns true when both sub-vaults are empty
- `isVaultFresh` returns false when either sub-vault has content

## Acceptance criteria

- [ ] All vault operations use `resolveVaultPath()` for path resolution
- [ ] `KEY_FILES.contacts` updated to `contacts.md`
- [ ] `readContacts` with `"all"` scope merges both files
- [ ] Health checks validate both sub-vaults independently
- [ ] `allowedRootEntries` reflects new vault root structure
- [ ] All existing tests updated and passing
- [ ] New scoped operation tests passing
