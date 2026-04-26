# US-wl-1: Path abstraction + scope type

**Parent:** [US-work-life-split](./US-work-life-split.md)
**Depends on:** nothing
**Unblocks:** US-wl-2, US-wl-3, US-wl-6

## Goal

Introduce the `VaultScope` type and `resolveVaultPath()` function so all downstream work has a single, tested path resolution layer to build on.

## Changes

### `core/types.ts`

Add the scope type:

```typescript
export type VaultScope = "all" | "work" | "life";
```

### `core/vault.ts`

Add `resolveVaultPath()`:

```typescript
export function resolveVaultPath(vaultPath: string, scope: VaultScope, relativePath: string): string {
  if (scope === "all") {
    throw new Error(
      "Cannot resolve a single path for scope 'all'. Use scope-specific reads or iterate both sub-vaults.",
    );
  }
  return path.resolve(vaultPath, scope, relativePath);
}
```

Also add a helper for operations that need to iterate both sub-vaults:

```typescript
export const SUB_VAULTS = ["work", "life"] as const;
export type SubVault = (typeof SUB_VAULTS)[number];
```

Export `resolveVaultPath`, `SUB_VAULTS`, and `SubVault` from `core/index.ts`.

### No changes to existing operations yet

Existing vault operations (`readBragfile`, `readContacts`, etc.) continue using `KEY_FILES` directly. They gain scope parameters in US-wl-2. This US only adds the foundation.

## Tests

File: `core/__tests__/vault.test.ts` (add to existing file or create if needed)

- `resolveVaultPath("work", "02_areas/career/bragfile.md")` returns `<vault>/work/02_areas/career/bragfile.md`
- `resolveVaultPath("life", "contacts.md")` returns `<vault>/life/contacts.md`
- `resolveVaultPath("all", "anything")` throws with descriptive error
- Path traversal attempt: `resolveVaultPath("work", "../life/contacts.md")` — the resolved path must stay within the expected sub-vault (validate or document as out-of-scope for this US)

## Acceptance criteria

- [ ] `VaultScope` type exported from `core/types.ts` and `core/index.ts`
- [ ] `resolveVaultPath()` exported from `core/vault.ts` and `core/index.ts`
- [ ] `SUB_VAULTS` constant exported
- [ ] All tests pass
- [ ] No existing tests broken
