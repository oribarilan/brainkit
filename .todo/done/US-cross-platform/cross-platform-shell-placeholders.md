# cross-platform-shell-placeholders

## Context

The TUI shell placeholders in `opencode/tui.tsx:36-41` use Unix commands and paths:

```ts
shell: [
  "grep -r 'action item' ~/second-brain/01_projects/",
  "cat ~/second-brain/02_areas/career/bragfile.md",
  "find ~/second-brain -name '*.md' -mtime -7",
  "wc -l ~/second-brain/03_resources/contacts.md",
],
```

These commands (`grep`, `cat`, `find`, `wc`) and `~/` paths are non-functional and confusing on Windows.

**Value delivered**: TUI shows relevant, functional shell examples on all platforms.

## Related Files

- `opencode/tui.tsx:25-42` — `brainkitPlaceholders` const (module-scope)

## Dependencies

- None (cosmetic, lowest priority)

## Acceptance Criteria

- [x] Shell placeholders show platform-appropriate commands on Windows (e.g., PowerShell equivalents like `Select-String`, `Get-Content`, `Get-ChildItem`, or simply an empty array if shell commands aren't useful on Windows)
- [x] Shell placeholders show platform-appropriate paths (no `~/` on Windows)
- [x] macOS/Linux placeholders are unchanged
- [x] No runtime errors on either platform

## Verification

- **Ad-hoc**: Run `just dev` on macOS and visually confirm placeholders are unchanged

## Notes

`brainkitPlaceholders` is a `const` at module scope (line 25). Two approaches:

1. **Ternary at definition** — simplest, keeps it as a `const`:

```ts
const brainkitPlaceholders = {
  normal: [ ... ],  // same on all platforms
  shell: process.platform === "win32"
    ? [
        'Select-String -Path "$env:USERPROFILE\\brain\\01_projects\\*" -Pattern "action item"',
        'Get-Content "$env:USERPROFILE\\brain\\02_areas\\career\\bragfile.md"',
        // ...
      ]
    : [
        "grep -r 'action item' ~/second-brain/01_projects/",
        "cat ~/second-brain/02_areas/career/bragfile.md",
        // ...
      ],
};
```

2. **Empty array on Windows** — if OpenCode doesn't support shell mode on Windows, or if PowerShell examples aren't useful, just use `[]`:

```ts
shell: process.platform === "win32" ? [] : [ ... ],
```

Option 2 is simpler and avoids maintaining a parallel set of Windows-specific examples that may not even be useful. Since this is a TUI component running under bun, `process.platform` is available at module load time.
