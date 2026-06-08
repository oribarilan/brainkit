# US-non-git-vaults

## Goal

Make brainkit work cleanly with vaults that aren't git repos. A user whose vault lives in a OneDrive or Google Drive folder (or any plain directory) should get a correct experience. Git users keep the same experience they have today. During onboarding, offer git init as an option — don't assume it.

## Background

The vault architecture is already git-agnostic: discovery, config, file I/O, bragfile, and contacts all use plain filesystem operations. Git only surfaces in two functional areas:

1. **Auto-commit** (`core/auto-commit.ts`, Copilot inline script, Claude script) — already soft-fails when the vault isn't a git repo. No changes needed.
2. **Health checks** (`runHealthChecks` in `core/vault.ts`) — GitHub privacy check is wrapped in try/catch and silently skips for non-git vaults. No changes needed. (The Copilot launcher in `cli/copilot.ts` also has git-dependent migration logic that correctly requires git for recovery — also unchanged.)

The problem is two hardcoded strings that tell the agent "your vault is backed by git" regardless of reality:

- `core/prompt-sections.ts` — `buildPreamble` says "The vault is backed by git and lives at `{path}`."
- `core/onboarding-prompt.ts` — instructs the agent to `git init` new brain directories unconditionally.

## Design

### New shared utility: `core/git.ts`

Extract `isGitRepo()` from `core/auto-commit.ts` into a new `core/git.ts` module. This is a general-purpose utility, not an auto-commit concern. `auto-commit.ts` imports from it. The copy in `cli/copilot.ts` has different error semantics (guards a destructive migration with `execFileSync` + `--is-inside-work-tree`) — leave it alone.

Use `execFileSync` (no shell invocation) for cross-platform safety, per AGENTS.md guidance on `child_process`:

```typescript
// core/git.ts
import { execFileSync } from "node:child_process";

export function isGitRepo(dirPath: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: dirPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}
```

Note: `isGitRepo` returns `false` both when the directory has no `.git` and when `git` isn't installed at all. Both cases are valid for the target user. It also returns `true` for directories inside a parent git repo (e.g. `~/Documents` is tracked and the vault is at `~/Documents/brain/`). That's technically accurate and not worth solving.

Not exported from `core/index.ts` — only used internally by `auto-commit.ts` and `system-prompt.ts`.

### System prompt: `buildSystemPrompt` owns git detection

`buildSystemPrompt` in `core/system-prompt.ts` calls `isGitRepo(vaultPath)` internally and sets `isGit` on the context it builds. Callers don't need to know about git detection — same signature, no public type change.

Add `isGit?: boolean` (optional) to `SectionContext` so custom prompt composition via `joinSections` can still override it. `buildSystemPrompt` always fills it in; direct `SectionContext` constructors default to `undefined` (treated as `false` by `buildPreamble`).

`buildPreamble` behavior:

- `isGit` is truthy: "The vault is backed by git and lives at `{path}`." (current behavior)
- `isGit` is falsy/absent: "The vault lives at `{path}`." (git mention dropped)

### Onboarding prompt (`core/onboarding-prompt.ts`)

Replace the current unconditional `git init` directive (line 141) with git-as-option text. Exact replacement:

**Current text:**

> The brain directory should be initialized as a git repo (`git init`) if it isn't already AND it's a brand-new dir (Scenario A). Don't `git init` existing dirs.

**New text:**

> For new brain directories (Scenario A), ask the user if they'd like to use git for version history. Git adds version history — diffs, rollback, change tracking — and complements cloud sync setups like OneDrive or Google Drive. If they say yes, run `git init` and seed a `.gitignore` with common OS and cloud-sync noise (`.DS_Store`, `Thumbs.db`, `desktop.ini`, `~$*`, `*.tmp`). Don't push — if they decline, move on. Don't `git init` existing dirs (Scenario C) without asking.

No cloud-sync path detection. The agent frames git the same way regardless of where the vault lives — the user decides.

### `.gitignore` seeding

When the agent runs `git init` during onboarding, it should also create a `.gitignore` at the brain root with entries for common OS and cloud-sync artifacts:

```
# OS artifacts
.DS_Store
Thumbs.db
desktop.ini

# Office temp/lock files
~$*
*.tmp
```

This prevents `git status` and auto-commit from picking up noise. The `.gitignore` lives at the brain directory level (alongside vault subdirectories), not inside individual vaults.

Note: the `.gitignore` content is agent-generated from prompt instructions, not a programmatic template. The exact output may vary slightly between LLM runs — that's acceptable.

### What does NOT change

- Vault discovery (`discoverVaults`, `readVaultConfig`, `readGlobalConfig`) — no git dependency
- Config types (`BrainkitConfig`, `BrainkitGlobalConfig`) — no git fields
- Bragfile operations — pure file I/O
- Contact operations — pure file I/O
- Auto-commit — already handles non-git gracefully (imports shared `isGitRepo` from `core/git.ts` instead of its own copy)
- Health checks — already skip for non-git. Inline `execSync("git rev-parse --git-dir")` stays as-is because it's inside a larger try/catch that also runs `git remote` and `gh api` — extracting just the first call would require nested control flow for no functional benefit.
- Copilot migration in `cli/copilot.ts` — git-dependent by design, unchanged (uses `execFileSync` with `--is-inside-work-tree`, different semantics)
- Skills — no git references
- Copilot auto-commit script — already exits cleanly for non-git
- Claude auto-commit script — already exits cleanly for non-git

## Definition of done

- [x] `isGitRepo()` lives in `core/git.ts` (using `execFileSync`) and is imported by `auto-commit.ts`
- [x] `SectionContext` has an optional `isGit?: boolean` field
- [x] `buildSystemPrompt` calls `isGitRepo(vaultPath)` internally and sets `isGit` on the context — no caller changes
- [x] System prompt says "backed by git" only when `isGit` is true; otherwise just states the path
- [x] Onboarding prompt treats git init as optional, asks the user before running it
- [x] Onboarding prompt instructs the agent to seed a `.gitignore` when running `git init`
- [x] Existing tests pass (`just test`)
- [x] New test: `buildPreamble` output with `isGit: true` includes "backed by git"
- [x] New test: `buildPreamble` output with `isGit: false` omits "backed by git" and still includes vault path
- [x] New test: `buildSystemPrompt` output reflects git status (mock `isGitRepo`)
- [x] New test: onboarding prompt contains "ask" language around git init, not unconditional directive
- [x] New test: `isGitRepo` returns false for a temp directory without `.git`
- [x] New test: `isGitRepo` returns true for a temp directory after `git init`

## Cross-cutting concerns

- **No new dependencies.** `isGitRepo` uses `execFileSync("git", ["rev-parse", "--git-dir"])`, already used elsewhere.
- **Cross-platform.** `execFileSync` avoids shell invocation. `git rev-parse` works the same on Windows, macOS, and Linux.
- **Performance.** `isGitRepo` runs once inside `buildSystemPrompt`, ~2ms, once per session.
- **Backward compatibility.** Git-backed vaults get the exact same prompt as before. Non-git vaults get a cleaner prompt. No public API changes.
- **`git` not installed.** `isGitRepo` returns `false` via try/catch. The non-git path handles this correctly — no special case needed.
