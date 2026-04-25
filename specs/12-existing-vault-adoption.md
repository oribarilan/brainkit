# Existing Vault Adoption

## Overview

Users may already have a markdown vault (notes, docs, a wiki) before installing brainkit. This spec covers how brainkit detects, adapts to, and onboards an existing vault — without destroying what's already there.

## Detection

### Vault state

Replace the binary `isVaultFresh()` check with a richer state detector:

```typescript
type VaultState =
  | { kind: "configured" } // has brainkit.toml — normal operation
  | { kind: "fresh" } // empty or near-empty, no brainkit.toml — standard onboarding
  | { kind: "existing" }; // has .md files or directories, no brainkit.toml — adoption flow
```

New function `detectVaultState()` in `core/vault.ts`:

1. If `brainkit.toml` exists → `"configured"`
2. If no `brainkit.toml` AND (3+ `.md` files OR subdirectories with content) → `"existing"`
3. Otherwise → `"fresh"`

The exact threshold for "existing" (currently 3+ `.md` files) can be tuned. The point is distinguishing "someone pointed brainkit at their notes folder" from "someone created an empty directory."

### System prompt integration

The current "Fresh Vault Detected" section in the system prompt becomes a more nuanced "Vault State" section:

- `"configured"` → no special section (normal operation)
- `"fresh"` → current "Fresh Vault Detected" behavior (triggers standard onboarding)
- `"existing"` → "Existing Vault Detected" section that triggers the adoption flow

When agents are enabled, only Thinker sees the vault state section — Consultant and Librarian can't act on onboarding or adoption flows. In no-agents mode, the default agent sees it.

## Adoption Flow

The adoption flow is a variant of onboarding, handled by the agent following an updated onboarding skill. It's conversational, not scripted. Five phases.

### Phase 1: Survey

Agent scans the vault to understand what exists:

- Directory structure (tree-like listing)
- File count and types
- Whether it partially follows PARA already (has `projects/` or `01_projects/`, etc.)
- Whether it's a git repo (and whether there are uncommitted changes)
- Files that look like a bragfile, contacts, or meeting notes — by name heuristics (`accomplishments.md`, `people.md`, `contacts.md`) and content heuristics (date-prefixed bullet lists, H2 headings with names)

### Phase 2: Present findings

Agent shows the user what it found:

- "Your vault has 47 markdown files across 8 directories"
- "I see a `projects/` folder that maps to PARA's `01_projects/`"
- "I found `accomplishments.md` which looks like it could be a bragfile"
- "Your files use underscores for naming — brainkit convention is kebab-case"
- "The vault is a git repo with 3 uncommitted files"

### Phase 3: Plan restructuring

Brainkit requires the full PARA directory naming (`01_projects/`, `02_areas/`, `03_resources/`, `04_archive/`). Agent proposes a restructuring plan:

- Map existing directories to PARA categories (user confirms each mapping)
- Directories that don't fit → ask user where they belong (project? area? resource? archive?)
- Root-level files → ask user where to place them
- Create missing PARA directories
- Rename directories to PARA convention

**Rules:**

- ALWAYS git commit before any structural changes (safety net)
- Never delete files — only move/rename
- Present the full plan before executing anything
- User must explicitly approve the restructuring
- If user says "don't touch my structure" → create the PARA directories alongside existing ones, but don't rename or move anything. Brainkit only manages content inside the PARA directories going forward. The user's original directories remain untouched but unmanaged — brainkit won't search, index, or reference them unless the user moves content into PARA later.

### Phase 4: Configure

Standard onboarding Q&A (name, role, expertise, tone, scope, etc.) → write `brainkit.toml`. Same as the onboarding skill's Phase 1–4.

If existing files were detected as feature files, ask:

- "I found `accomplishments.md` — should brainkit manage this as your bragfile? I'd move it to `02_areas/career/bragfile.md`"
- "I found `people.md` — should brainkit manage this as your contacts file? I'd move it to `03_resources/contacts.md`"

### Phase 5: Verify

Run doctor to confirm vault health. Report any remaining issues (naming conventions, orphaned root files, etc.).

## What Gets Preserved

- **ALL existing file content** — never modified without explicit consent
- **Git history** — commit before changes, so everything is reversible
- **Files the user doesn't want to restructure** — left in place

## What Gets Created

- `brainkit.toml` (always)
- PARA directories that don't exist (always)
- `README.md` in new PARA directories (always)
- Moved/renamed files (only with user approval)

## Edge Cases

**Vault is not a git repo.** Offer to `git init` — the safety-net commit strategy depends on git. If the user declines, proceed without git but warn that structural changes can't be easily reverted. Skip all "git commit before changes" steps. Recommend git setup for future safety.

**Vault has tool artifacts.** Users with existing vaults often use Obsidian (`.obsidian/`), Logseq (`.logseq/`), Foam, or other tools. During the survey phase, skip hidden directories and known tool config directories. Don't propose moving them into PARA. Mention their presence to the user ("I see you use Obsidian — brainkit works alongside it, no conflicts") but otherwise leave them alone.

**Vault is a git repo with uncommitted changes.** Warn the user, suggest committing or stashing first. Don't proceed with structural changes until the working tree is clean — the safety-net commit won't capture their in-progress work otherwise.

**Vault has a `brainkit.toml` from an old version.** This is a migration scenario, not adoption. `detectVaultState()` returns `"configured"` and the migration system handles version differences. Not in scope for this spec.

**Vault partially follows PARA.** Has `01_projects/` but not `02_areas/`. Create missing directories, leave existing ones alone. Don't rename or restructure directories that already match PARA conventions.

**Vault has thousands of files.** Don't try to individually categorize. Survey top-level structure only, let the user guide bulk moves by directory. "Your `notes/` folder has 200 files — where should it go as a whole?"

**User changes their mind mid-adoption.** All structural changes are git-committed incrementally, so any step can be reverted with `git revert` or `git reset`. The agent should mention this when presenting the plan.

**Vault has non-markdown files.** Images, PDFs, CSVs, etc. Leave them in place — brainkit manages markdown but doesn't need to own every file. Move them alongside their markdown files if the parent directory is being restructured.

## Implementation

### `core/vault.ts`

New `detectVaultState()` function:

```typescript
export function detectVaultState(vaultPath: string): VaultState {
  const configPath = path.resolve(vaultPath, KEY_FILES.config);

  if (fs.existsSync(configPath)) {
    return { kind: "configured" };
  }

  // Count .md files and subdirectories with content
  let mdFileCount = 0;
  let hasContentDirs = false;

  try {
    const entries = fs.readdirSync(vaultPath);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const fullPath = path.resolve(vaultPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isFile() && entry.endsWith(".md")) {
        mdFileCount++;
      } else if (stat.isDirectory()) {
        // Check if directory has any content
        const subEntries = fs.readdirSync(fullPath).filter((e) => !e.startsWith("."));
        if (subEntries.length > 0) hasContentDirs = true;
      }
    }
  } catch {
    return { kind: "fresh" };
  }

  if (mdFileCount >= 3 || hasContentDirs) {
    return { kind: "existing" };
  }

  return { kind: "fresh" };
}
```

> **Performance**: For configured vaults, `detectVaultState()` is a single `existsSync` check — negligible. The directory scan only runs when `brainkit.toml` is missing (adoption/fresh scenarios), which is a one-time flow. Safe to call per-turn in the system prompt builder.

`isVaultFresh()` remains for backward compatibility but can delegate to `detectVaultState()` internally.

### Onboarding skill

The onboarding skill (`skills/onboarding/SKILL.md`) gets a new section for existing vaults. The "When to trigger" section updates:

- System prompt says "Fresh Vault Detected" → standard onboarding (current behavior)
- System prompt says "Existing Vault Detected" → adoption flow (Phase 1–5 above)

The adoption flow reuses Phase 4 (config Q&A) and Phase 5 (verification) from standard onboarding.

### System prompt

`core/system-prompt.ts` replaces the "Fresh Vault Detected" conditional with a vault-state-aware section:

```typescript
const vaultState = detectVaultState(vaultPath);

if (vaultState.kind === "fresh") {
  sections.push(
    [
      "## Fresh Vault Detected",
      "",
      "This vault was just set up and has no content yet.",
      "Guide the user through their first entries using the onboarding skill.",
      "Be conversational and welcoming, not a checklist.",
    ].join("\n"),
  );
} else if (vaultState.kind === "existing") {
  sections.push(
    [
      "## Existing Vault Detected",
      "",
      "This vault has existing content but no brainkit configuration.",
      "The user is adopting an existing vault into brainkit.",
      "",
      "Follow the adoption flow in the onboarding skill:",
      "1. Survey the vault structure and contents",
      "2. Present your findings to the user",
      "3. Propose a restructuring plan (PARA directories required)",
      "4. Run the standard onboarding Q&A to create brainkit.toml",
      "5. Verify with doctor",
      "",
      "Important: commit all existing content to git before making structural changes.",
      "Never delete or overwrite existing files. Only move/rename with user approval.",
    ].join("\n"),
  );
}
// "configured" → no special section
```

### No new tools needed

The agent uses built-in file operations (read, write, edit, bash for `git`, `tree`, `find`) guided by the skill. No custom typed tools required.

### Interaction with migrations

The adoption flow always creates `brainkit.toml` at the latest schema version. No migration pipeline runs during first setup. If a user later updates brainkit and the schema changes, the migration system (spec 11) handles it — adoption and migration are separate concerns that don't overlap.
