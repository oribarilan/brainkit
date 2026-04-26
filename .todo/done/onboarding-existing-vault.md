# Task: Support Onboarding Into an Existing Vault

## Context

Brainkit currently assumes every vault is created from scratch via `npx @2brain/brainkit`. There is **zero support** for adopting an existing markdown vault (e.g., an Obsidian vault, a plain notes folder, or a previously hand-maintained PARA structure). No code, skills, or specs address this scenario.

This is a real user need: many people already have a notes vault and want to layer brainkit on top of it rather than starting over. The current init flow would silently overwrite their `brainkit.toml` and ignore any existing content structure.

**Value delivered**: Users with existing markdown vaults can adopt brainkit without losing content or being forced to restructure everything upfront.

## Related Files

- `cli/init.ts` — Interactive CLI setup (always overwrites `brainkit.toml`)
- `cli/index.ts` — CLI entry point, routes init vs update
- `cli/install.ts` — Skill distribution, AGENTS.md generation, `.gitignore` management
- `extensions/vault.ts` — Vault discovery, config, PARA constants, health checks, `isVaultFresh()`
- `extensions/system-prompt.ts` — Fresh vault detection, onboarding trigger
- `skills/onboarding/SKILL.md` — First-run Q&A (assumes fresh vault)
- `skills/brainkit/SKILL.md` — Root skill (setup flow assumes fresh vault)
- `specs/07-decisions.md` — Architecture decisions (currently 23; #24 will document adoption)

## Dependencies

- None

## Investigation Findings

### What Already Works for Existing Vaults

- **PARA dir creation** — `mkdirSync({ recursive: true })` is safe; won't destroy existing dirs
- **Bragfile & contacts creation** — Guarded by `!fs.existsSync()` checks; won't overwrite
- **README.md in PARA dirs** — Guarded by existence checks in `cli/init.ts`
- **`.gitignore` updates** — Appends only, never overwrites existing entries
- **Health checks** — Report-only; never delete or overwrite content
- **Hook guards** — All hooks null-check vault/config before acting
- **Obsidian `.obsidian/` dir** — Already ignored by health checks (dotfile filter on line 525). Auto-commit will track it, which is fine (vault settings worth tracking). Works out of the box.
- **`update()` flow** — Routes when `brainkit.toml` exists (`cli/index.ts:41-44`). Re-installs skills and AGENTS.md but does not modify config values. No changes needed for adoption — `adopted = true` in config is preserved across updates.

### What Breaks or Is Problematic

1. **`brainkit.toml` always overwritten** (`cli/init.ts:120`) — `init()` unconditionally writes a fresh config. Note: the CLI router (`cli/index.ts:41-44`) prevents `init()` from running when `brainkit.toml` exists (routes to `update()` instead), so the real-world risk is limited to programmatic calls bypassing the router. Still worth guarding defensively inside `init()`.
2. **`isVaultFresh()` false positives** (`vault.ts:373-408`) — checks bragfile empty + contacts empty + no project dirs; adopted vault has none of these brainkit-specific files but plenty of content → triggers onboarding as if brand new. Also doesn't check `02_areas/` or `03_resources/` content (only checks contacts file existence, not other area/resource files).
3. **Onboarding skill assumes blank slate** (`skills/onboarding/SKILL.md`) — 5-phase Q&A creates everything from scratch with no awareness of existing content
4. **`init()` doesn't detect existing content** — running `npx @2brain/brainkit` in a directory full of `.md` files proceeds silently with no awareness that content exists
5. **Orphan file warnings noisy** (`vault.ts:521`) — health checks flag anything outside PARA dirs; existing vaults will have tons of "orphans" initially (non-destructive, tolerable for P0)
6. **Naming convention warnings noisy** (`vault.ts:487-519`) — kebab-case check will flag every existing file with spaces/underscores (non-destructive, tolerable for P0)

### Design Decisions Made

- **CLI is a thin distribution layer.** The CLI only detects existing content, sets `adopted = true`, and prints a notice. All real adoption work — backup verification, content exploration, PARA mapping, file moves — lives in the vault-adoption skill and is handled by the user's coding agent. This follows the same pattern as the rest of brainkit: CLI distributes, agent does the work (Decision #18).
- **Auto-detection over explicit flags.** `init()` detects existing `.md` files and sets `adopted = true` automatically. No `--adopt` flag, no separate CLI path, no separate `adopt()` function. Edge-case false positives (e.g., a stray `.md` file) are harmless — the agent politely asks about existing content, which is the right behavior regardless. Two clean CLI paths remain: `init` (no `brainkit.toml`) and `update` (has `brainkit.toml`).
- **Dedicated vault-adoption skill over modifying onboarding.** Single responsibility: the onboarding skill handles fresh vaults, a new `vault-adoption` skill handles existing vaults. The adoption skill is invoked once during the first session after adoption, then becomes inert. No conditional branching in the onboarding skill, no dead code paths.
- **Backup safety lives in the skill, not the CLI.** The CLI doesn't touch existing files — it only adds new ones (PARA dirs, config, skills). The real risk is when the agent moves files during PARA adoption. The vault-adoption skill handles this: it checks git status, warns about uncommitted/unpushed changes, and refuses to move files without a clean revert point.
- **No content migration tooling — teach the agent via skills instead.** The PARA skill already has the decision framework. The agent has `brain_read`/`brain_write`/`brain_list`. This is exactly what Decision #18 (skills-first architecture) was designed for.
- **No vault-inside-larger-repo support yet.** Auto-commit, health checks, and path resolution all assume vault = repo root. Supporting a subdirectory vault means scoping every git operation and changing path resolution. If users ask: "Brainkit expects its own repo."
- **Gradual PARA adoption.** PARA dirs are created alongside existing content on day one. Content mapping is agent-assisted and user-approved, at whatever pace the user wants. Decision #2 ("no PARA = no brainkit") is honored — PARA is the destination, but the path is gradual.

## Plan

### P0 — Make Adoption Safe (this task)

7 changes, focused on "don't destroy things":

| #   | Change                                                                                 | Where                                                    | Risk if skipped                             |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| 1   | Guard `brainkit.toml` in `init()` — if exists, read + update version, skip Q&A         | `cli/init.ts`                                            | Defensive guard (router already protects)   |
| 2   | Auto-detect existing `.md` files in `init()` — set `adopted = true`, print notice      | `cli/init.ts`                                            | Can't distinguish adopted vs fresh vaults   |
| 3   | Extract `findUserContent()` — shared detection logic for `init()` and `isVaultFresh()` | `extensions/vault.ts`                                    | Divergent exclusion lists cause subtle bugs |
| 4   | Fix `isVaultFresh()` — use `findUserContent()` to check for non-brainkit `.md` files   | `extensions/vault.ts`                                    | Onboarding runs on populated vault          |
| 5   | Add `adopted?: boolean` to config schema                                               | `extensions/vault.ts` types                              | Can't distinguish adopted vs fresh          |
| 6   | Create `vault-adoption` skill + wire in `system-prompt.ts`                             | `skills/vault-adoption/` + `extensions/system-prompt.ts` | Agent treats adopted vault as blank         |
| 7   | Tests for `findUserContent()`, `isVaultFresh()`, and `init()` adoption detection       | `extensions/__tests__/`                                  | Regressions in critical detection logic     |

#### Implementation Notes

- **`findUserContent(vaultPath)` helper** (new, in `vault.ts`): Recursively glob `**/*.md` from vault root. Exclude dotfolders (`.obsidian/`, `.github/`, etc.) to avoid false negatives from tool metadata. Exclude known brainkit-generated files: `README.md` in each PARA root dir, `bragfile.md`, `contacts.md`, `AGENTS.md`. Returns the list of remaining `.md` file paths. Both `init()` and `isVaultFresh()` consume this — single source of truth for "what is user content."
- **`isVaultFresh()` algorithm**: Call `findUserContent()`. If any files returned → vault is not fresh. Keep existing checks (empty bragfile, empty contacts, no project dirs) as the positive freshness signal.
- **`init()` adoption detection**: Call `findUserContent()`. If any files returned → set `adopted = true` in config, print notice with file count. No git checks, no confirmation prompts — the CLI only adds new files alongside existing content, which is non-destructive. The agent handles backup safety in the skill.
- **Spec decision entry**: Add Decision #24 to `specs/07-decisions.md` documenting the existing-vault adoption design.

### Vault-Adoption Skill Specification

The `vault-adoption` skill needs the same level of detail as the onboarding skill. Structure:

#### When to trigger

The system prompt includes "Adopted Vault Detected" when `config.brainkit.adopted === true`. This triggers automatically on first conversation after adoption.

#### Phase 1: Safety check

Before doing anything else:

- Check git status using a shell command (`git status --porcelain` and `git log @{u}..HEAD`)
- If uncommitted or unpushed changes → "I see you have uncommitted/unpushed changes. Please commit and push first so you have a clean revert point. I'll wait."
- If no git repo → "This vault isn't tracked by git. I strongly recommend initializing a repo (`git init && git add -A && git commit -m 'pre-brainkit snapshot'`) before we reorganize anything. Want me to do that for you?"
- If clean → "Your files are tracked in git with a clean state — you can always revert if you don't like any changes I make."
- **Do not proceed to Phase 2 until the user has a safety net** (clean git state or explicit "proceed anyway")

#### Phase 2: Explore

- Use `brain_list` to scan the full vault structure
- Summarize what exists: "I see N files across M directories. Here's what I found: [brief summary of top-level structure and themes]"
- Note any existing structure that already resembles PARA categories

#### Phase 3: Propose

- Present a PARA mapping proposal: "Based on what I see, here's how I'd suggest organizing your content:"
  - `01_projects/` — [files that look like active projects]
  - `02_areas/` — [files that look like ongoing responsibilities]
  - `03_resources/` — [files that look like reference material]
  - `04_archive/` — [files that look like completed/inactive items]
  - "Leave in place" — [files I'm unsure about]
- Always include a "leave in place" category — don't force everything into PARA
- Ask: "Want me to proceed with this mapping, adjust it, or skip organizing for now?"

#### Phase 4: Execute (only with approval)

- Move files one PARA category at a time, not all at once
- After each batch: "Moved N files to [category]. Want to continue with [next category]?"
- If the user says stop at any point → stop immediately, summarize what was done

#### Phase 5: Wrap up

- Summarize what was organized and what remains
- "You can always ask me to reorganize more files later, or just add new content to the right PARA category going forward."

#### Rules

- **NEVER move, rename, or delete a file without explicit user approval**
- **NEVER modify file contents** — only move files between directories
- Present proposals as suggestions, not actions
- If the user wants to skip organizing entirely, respect that immediately
- Tone: helpful but cautious — this is someone else's content, treat it with care

### Known Rough Edge: `adopted = true` is Permanent

The `adopted` flag has no automatic off-ramp in P0. The system prompt will show "Adopted Vault Detected" and load the vault-adoption skill every session, even after all content is organized into PARA.

**Why this is tolerable for P0:**

- The skill's Phase 2 (explore) will see content already in PARA and the proposal in Phase 3 will say "everything looks organized already — nothing to do"
- The system prompt overhead is a few lines of text — negligible
- No incorrect behavior, just slightly redundant context

**P1 fix:** Clear the `adopted` flag automatically when a health check shows no orphaned files and all content is in PARA directories. Or add a `/clear-adoption` command.

### P1 — Deferred (separate tasks)

- **Health check noise suppression** — relax orphan/naming warnings when `adopted = true`
- **Vault-inside-larger-repo** — scope git ops, change path resolution, add vault-root config
- **Obsidian-specific support** — already works passively; active support (plugin awareness, etc.) not needed yet
- **Auto-clear `adopted` flag** — once all content is in PARA, clear the flag automatically

### Adoption Flow

**CLI** (`npx @2brain/brainkit` in any directory without `brainkit.toml`):

1. Runs normal identity Q&A
2. Detects existing `.md` files via `findUserContent()` (excluding dotfolders and brainkit-generated files)
3. If any found → sets `adopted = true` in config, prints: "Detected N existing markdown files. Your files are untouched — the agent can help you organize them into PARA when you're ready."
4. If none found → writes normal config (no `adopted` flag)
5. Creates PARA dirs alongside existing content (idempotent)
6. Creates bragfile/contacts (guarded by `existsSync`)
7. Installs skills + AGENTS.md

**Agent** (first session after adoption):

1. System prompt shows "Adopted Vault Detected" (via `config.brainkit.adopted` check in `system-prompt.ts`)
2. System prompt tells agent to use the `vault-adoption` skill
3. Skill Phase 1: safety check — verify git status, ensure user has a revert point before any file moves
4. Skill Phase 2: explore existing content with `brain_list`
5. Skill Phase 3: propose PARA mapping
6. Skill Phase 4: execute with per-category approval
7. Skill Phase 5: summarize and hand off

## Acceptance Criteria

- [ ] `brainkit.toml` is never silently overwritten — `init()` checks for existence first
- [ ] `findUserContent(vaultPath)` exists in `vault.ts` — globs `**/*.md`, excludes dotfolders and brainkit-generated files, returns list of user content paths. Used by both `init()` and `isVaultFresh()`.
- [ ] `init()` calls `findUserContent()` and sets `adopted = true` in config when user content is found, prints notice with file count
- [ ] `BrainkitConfig` type includes `adopted?: boolean` in the `brainkit` section
- [ ] `isVaultFresh()` calls `findUserContent()` — returns `false` when user content exists
- [ ] New `skills/vault-adoption/SKILL.md` exists with 5-phase structure: safety check (git status, backup verification) → explore → propose → execute with approval → wrap up
- [ ] Vault-adoption skill Phase 1 blocks all file moves until user has a clean git state or explicitly opts to proceed without one
- [ ] `system-prompt.ts` has an "Adopted Vault Detected" section that triggers when `config.brainkit.adopted === true` and references the `vault-adoption` skill (instead of the fresh vault onboarding)
- [ ] Onboarding skill (`skills/onboarding/SKILL.md`) is NOT modified — stays focused on fresh vaults
- [ ] Existing files are NEVER deleted, moved, or modified without explicit user confirmation
- [ ] Decision #24 in `specs/07-decisions.md` documents the existing-vault adoption design
- [ ] Tests cover: `findUserContent()` (empty vault, vault with user content, vault with only brainkit-generated files, vault with dotfolder `.md` files), `isVaultFresh()` (fresh vault, adopted vault with content), `init()` adoption detection (sets `adopted = true` when user content exists, omits it when clean)

## Scope Estimate

Medium

## Notes

- Decision #2 in `specs/07-decisions.md` states "A user who doesn't want PARA doesn't want brainkit" — adoption must lead to PARA eventually, but the path is gradual
- `isVaultFresh()` change must not break the fresh-vault flow — the two heuristics are: (1) non-brainkit content exists → not fresh, (2) brainkit content is empty → fresh
- Health check noise (orphans, naming) is tolerable for P0 since it's non-destructive and report-only
- `AGENTS.md` overwrite during init is acceptable — it's generated from config and the CLI already warns during `update`. No change needed for P0
- `update()` preserves `adopted = true` — it re-installs skills and AGENTS.md but doesn't modify config values, so no adoption-specific changes needed in `update()`
- False positives from auto-detection are harmless — the agent asks about existing content, which is appropriate behavior even for a stray `.md` file
- The CLI deliberately has no git checks, confirmation prompts, or backup warnings — it only adds new files alongside existing content (non-destructive). All safety gates live in the vault-adoption skill where the real risk is (file moves).
