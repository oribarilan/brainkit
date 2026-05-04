import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { spawnHarness } from "./spawn.js";
import { findPackageRoot } from "./package-root.js";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  buildSystemPrompt,
  buildOnboardingPrompt,
  getConfigDir,
  getCopilotConfigDir,
} from "../core/index.js";
import { installSkills } from "./install-skills.js";
import { version } from "./version.js";
import * as p from "@clack/prompts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum Copilot CLI version where `COPILOT_HOME` redirection is honored
 * (smoke-tested 2026-04-28). Below this, brainkit's prompt and skills may not
 * load. Bump this constant when re-validating against newer floors.
 */
export const MIN_COPILOT_VERSION = "1.0.37";

const MIGRATION_MARKER_FILENAME = ".migration-v1";

const BRAINKIT_AGENTSMD_SENTINEL = "<!-- brainkit:generated -->";
const BRAINKIT_AGENTSMD_LEGACY_PREAMBLE = "Brainkit is a personal second brain";

const GITIGNORE_BLOCK_LINES = [
  "# brainkit — generated files",
  ".agents/skills/brainkit/",
  ".github/hooks/",
  ".github/copilot/",
];

const COMPANY_ANNOUNCEMENTS = [
  "mention an accomplishment and I'll offer to capture it",
  "I can create meeting notes from any conversation",
  "ask me about your vault stats",
  "I can search your vault for anything",
  "I organize using the PARA method",
  "I'll remind you if your bragfile gets stale",
  "ask me to check vault health",
];

/**
 * Prefix on `description` field of brainkit-managed hook entries. The merge
 * uses this to identify and replace stale brainkit hook entries on re-launch
 * while preserving user-added entries under the same hook event.
 */
const BRAINKIT_HOOK_DESCRIPTION_PREFIX = "brainkit:";

/**
 * Exact descriptions used by brainkit hook entries in versions BEFORE the
 * `brainkit:` prefix was introduced. The merge strips entries matching any
 * of these too, so users upgrading from older brainkit versions don't end up
 * with duplicate auto-commit hooks (vault committed twice per agent turn).
 *
 * Do NOT add new brainkit descriptions here — only legacy strings that
 * shipped in earlier versions and could exist in users' settings.json today.
 */
const LEGACY_BRAINKIT_HOOK_DESCRIPTIONS: ReadonlySet<string> = new Set([
  "Auto-commit vault changes after agent turns",
  "Commit any remaining vault changes on session end",
]);

/**
 * Top-level keys in `settings.json` that brainkit owns and may overwrite on
 * launch. Any key NOT in this list is preserved verbatim across launches —
 * including keys Copilot CLI writes itself (e.g. `mcpServers`, `theme`,
 * approved-tools entries).
 */
const BRAINKIT_OWNED_SETTINGS_KEYS = ["companyAnnouncements", "statusLine", "hooks"] as const;
const BRAINKIT_OWNED_SETTINGS_KEY_SET: ReadonlySet<string> = new Set(BRAINKIT_OWNED_SETTINGS_KEYS);

const AUTO_COMMIT_SCRIPT = `#!/usr/bin/env node
const { execSync } = require("child_process");
try { execSync("git rev-parse --git-dir", { stdio: "pipe" }); } catch { process.exit(0); }
const status = execSync("git status --porcelain", { stdio: "pipe" }).toString().trim();
if (!status) process.exit(0);
try {
  const date = new Date().toISOString().slice(0, 10);
  execSync("git add -A", { stdio: "pipe" });
  execSync(\`git commit -m "brainkit: auto-save \${date}"\`, { stdio: "pipe" });
} catch { /* commit failed — skip silently */ }
`;

// ---------------------------------------------------------------------------
// `--config-dir` rejection
// ---------------------------------------------------------------------------

/**
 * Detects `--config-dir <value>` or `--config-dir=<value>` in args. Per Copilot
 * docs, `--config-dir` takes precedence over `COPILOT_HOME`, which would defeat
 * brainkit's isolation.
 */
export function hasConfigDirArg(args: string[]): boolean {
  return args.some((a) => a === "--config-dir" || a.startsWith("--config-dir="));
}

// ---------------------------------------------------------------------------
// Copilot CLI version check
// ---------------------------------------------------------------------------

/** Compare semver strings. Returns -1 / 0 / 1. Permissive — only the first three numeric segments matter. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
    if (m === null) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  if (a3 !== b3) return a3 < b3 ? -1 : 1;
  return 0;
}

/**
 * Best-effort: run `copilot --version`, parse, and warn if below MIN_COPILOT_VERSION.
 * Skipped on any error (parse failure, binary missing, etc.) — version check is
 * defensive, not gating.
 */
export function checkCopilotVersion(): void {
  let output: string;
  try {
    output = execFileSync("copilot", ["--version"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch {
    return; // can't check, don't block
  }
  const match = /(\d+\.\d+\.\d+)/.exec(output);
  if (match === null) return;
  const found = match[1] as string;
  if (compareVersions(found, MIN_COPILOT_VERSION) < 0) {
    p.log.warn(
      `brainkit requires Copilot CLI ≥ v${MIN_COPILOT_VERSION} for proper isolation. You are on v${found}. ` +
        `brainkit's prompt and skills may not load. Upgrade with \`npm install -g @github/copilot\`.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Legacy file migration
// ---------------------------------------------------------------------------

/** rmdir that swallows ENOTEMPTY / ENOENT. Used for "leave alone if non-empty" cleanup. */
function tryRmdir(target: string): void {
  try {
    fs.rmdirSync(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "ENOENT" || code === "EEXIST") return;
    throw err;
  }
}

/**
 * Symlink-aware delete. If `target` is a symlink, removes the link only (never
 * traverses). If it's a regular file or directory, removes recursively. Returns
 * `false` if the path does not exist; `true` if something was removed. Throws
 * on permission / I/O errors.
 *
 * This is the load-bearing safety wrapper around all destructive vault operations
 * — `fs.rmSync({ recursive: true })` follows symlinks, which would let a vault
 * containing `<vault>/.agents/skills/brainkit -> ~/Documents` traverse into and
 * destroy the symlink target.
 */
function safeRemove(target: string): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target); // remove the link, never follow
  } else if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true, force: false });
  } else {
    fs.unlinkSync(target);
  }
  return true;
}

/**
 * Write `content` to `target` only if the existing file's content differs.
 * Returns `true` if a write occurred, `false` if skipped. Creates parent
 * directories implicitly via `fs.writeFileSync`'s default behavior — caller
 * is responsible for `mkdirSync` of the directory if it may not exist.
 *
 * Used to avoid per-launch I/O rewriting unchanged brainkit-managed files.
 */
export function writeIfChanged(target: string, content: string): boolean {
  try {
    const existing = fs.readFileSync(target, "utf-8");
    if (existing === content) return false;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.writeFileSync(target, content, "utf-8");
  return true;
}

/**
 * True if AGENTS.md content is brainkit-generated. Two gates:
 * 1. **Sentinel** (preferred, primary gate going forward): contains
 *    `<!-- brainkit:generated -->` anywhere. Emitted as the first line of every
 *    brainkit-generated system prompt by `buildSystemPrompt` in core/.
 * 2. **Legacy preamble** (fallback for vaults from versions before the sentinel
 *    was emitted): the preamble appears within the **first 400 code units** of
 *    the file. Anchoring to the top prevents false positives where a user's
 *    `AGENTS.md` mentions or quotes the brainkit preamble in the middle of a
 *    longer doc. Legacy brainkit-generated `AGENTS.md` always opened with the
 *    preamble in the first H2 section (~24 bytes in).
 */
function isBrainkitAgentsMd(content: string): boolean {
  if (content.includes(BRAINKIT_AGENTSMD_SENTINEL)) return true;
  const head = content.slice(0, 400);
  return head.includes(BRAINKIT_AGENTSMD_LEGACY_PREAMBLE);
}

/** Strip the contiguous brainkit `.gitignore` block. Returns new content or null if no contiguous block found. */
export function stripBrainkitGitignoreBlock(content: string): string | null {
  // Normalize line endings for matching, but remember if input was CRLF
  const isCrlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  // Find the four-line block as a contiguous sub-sequence
  for (let i = 0; i <= lines.length - GITIGNORE_BLOCK_LINES.length; i++) {
    let matches = true;
    for (let j = 0; j < GITIGNORE_BLOCK_LINES.length; j++) {
      if (lines[i + j] !== GITIGNORE_BLOCK_LINES[j]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    // Strip the four lines + one trailing blank if present
    const before = lines.slice(0, i);
    let afterStart = i + GITIGNORE_BLOCK_LINES.length;
    if (lines[afterStart] === "") afterStart++;
    const after = lines.slice(afterStart);

    const result = [...before, ...after].join("\n");
    return isCrlf ? result.replace(/\n/g, "\r\n") : result;
  }
  return null;
}

/**
 * Slim mechanical migration: removes brainkit-namespaced paths unconditionally,
 * content-gates `AGENTS.md`, strips the contiguous `.gitignore` block. Returns
 * the list of vault-relative paths actually removed. Throws on partial failure
 * (caller aborts launch and skips marker write).
 *
 * Symlink-safe: every delete goes through `safeRemove` which checks `lstat`
 * before recursing, so a symlinked brainkit-namespaced path removes only the
 * link, never the target.
 */
export function migrateLegacyVaultFiles(vaultPath: string): string[] {
  const removed: string[] = [];

  // 1. Brainkit-namespaced dirs — delete unconditionally (symlink-safe).
  const brainkitSkillsDir = path.join(vaultPath, ".agents", "skills", "brainkit");
  if (safeRemove(brainkitSkillsDir)) removed.push(".agents/skills/brainkit/");

  const githubHooksDir = path.join(vaultPath, ".github", "hooks");
  if (safeRemove(githubHooksDir)) removed.push(".github/hooks/");

  const githubCopilotDir = path.join(vaultPath, ".github", "copilot");
  if (safeRemove(githubCopilotDir)) removed.push(".github/copilot/");

  // 2. AGENTS.md — content-gated. Read via lstat-aware path: if AGENTS.md is a
  //    symlink, we still want to read the content (the link points at the
  //    actual brainkit-generated file in many setups). On match, unlink the
  //    *link*, not the target. `safeRemove` handles both cases.
  const agentsMdPath = path.join(vaultPath, "AGENTS.md");
  try {
    const content = fs.readFileSync(agentsMdPath, "utf-8");
    if (isBrainkitAgentsMd(content)) {
      safeRemove(agentsMdPath);
      removed.push("AGENTS.md");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // 3. .gitignore — strip contiguous brainkit block.
  const gitignorePath = path.join(vaultPath, ".gitignore");
  try {
    const original = fs.readFileSync(gitignorePath, "utf-8");
    const stripped = stripBrainkitGitignoreBlock(original);
    if (stripped !== null && stripped !== original) {
      fs.writeFileSync(gitignorePath, stripped, "utf-8");
      removed.push(".gitignore (brainkit block)");
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // 4. Cleanup empty parent dirs (best-effort, never recursive).
  tryRmdir(path.join(vaultPath, ".agents", "skills"));
  tryRmdir(path.join(vaultPath, ".agents"));
  tryRmdir(path.join(vaultPath, ".github"));

  return removed;
}

/**
 * Returns true if the vault has any of the legacy brainkit-namespaced paths
 * present, OR an AGENTS.md that would match the content gate. Used to gate the
 * "no git repo" abort: we only block on missing git when the migration would
 * actually delete something.
 */
export function vaultHasLegacyBrainkitFiles(vaultPath: string): boolean {
  const candidates = [
    path.join(vaultPath, ".agents", "skills", "brainkit"),
    path.join(vaultPath, ".github", "hooks"),
    path.join(vaultPath, ".github", "copilot"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return true;
  }
  try {
    const agents = fs.readFileSync(path.join(vaultPath, "AGENTS.md"), "utf-8");
    if (isBrainkitAgentsMd(agents)) return true;
  } catch {
    // ENOENT or read failure → not a brainkit AGENTS.md
  }
  return false;
}

/**
 * True iff `vaultPath` is inside a git working tree. Uses `git rev-parse
 * --is-inside-work-tree` (run with `cwd: vaultPath`) so we correctly accept:
 * - vault is the repo root (`.git/` directly inside vault)
 * - vault is a subdirectory of a tracked repo (monorepo / parent-tracked)
 * - vault is a worktree (`<vault>/.git` is a file, not a dir)
 * - vault is a submodule
 *
 * Returns `false` if `git` isn't on PATH, the vault doesn't exist, or any
 * other failure — the safe default (caller will abort migration if there are
 * legacy files to delete, since we can't guarantee `git restore` recovery).
 */
function vaultIsGitRepo(vaultPath: string): boolean {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: vaultPath,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .trim();
    return out === "true";
  } catch {
    return false;
  }
}

/**
 * Run migration if marker is absent. Writes marker on success (including
 * clean-vault no-op). Aborts via thrown error on partial failure (no marker
 * written → safe retry on next launch).
 *
 * **Refuses to run on a non-git vault if there are legacy files to delete.**
 * Without git, `git restore` recovery doesn't work — we'd silently destroy
 * user data. Clean vaults pass through untouched (marker is still written so
 * we don't re-check forever).
 */
function runMigrationIfNeeded(vaultPath: string): void {
  const copilotHome = getCopilotConfigDir();
  const markerPath = path.join(copilotHome, MIGRATION_MARKER_FILENAME);
  // Gate strictly on "marker exists AND is a regular file". Defends against
  // a stray directory at the marker path, a broken symlink, etc. — those
  // states should not silently skip the migration.
  try {
    if (fs.statSync(markerPath).isFile()) return;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Pre-flight: if there's something to delete and no git, abort with a strong
  // notice. Recovery story collapses without git.
  if (vaultHasLegacyBrainkitFiles(vaultPath) && !vaultIsGitRepo(vaultPath)) {
    p.log.error(
      `Brainkit needs to remove legacy files from your vault (${vaultPath}), but the vault is not a git repository. ` +
        `Without git, deletions cannot be auto-recovered. Initialize git first:\n\n` +
        `  cd ${vaultPath}\n  git init && git add -A && git commit -m "pre-brainkit-migration snapshot"\n\n` +
        `Then re-run \`brainkit copilot\`. The migration will proceed once recovery is possible.`,
    );
    process.exit(1);
  }

  let removed: string[];
  try {
    removed = migrateLegacyVaultFiles(vaultPath);
  } catch (err) {
    p.log.error(
      `brainkit migration failed: ${err instanceof Error ? err.message : String(err)}\n` +
        `Run \`git status\` to see what was removed before the failure; \`git restore <path>\` to recover. ` +
        `Re-run \`brainkit copilot\` after fixing the underlying issue (the migration will retry).`,
    );
    throw err;
  }

  // Success → ensure copilot home exists, write marker.
  fs.mkdirSync(copilotHome, { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString() + "\n", "utf-8");

  if (removed.length > 0) {
    p.log.info(
      `Brainkit moved Copilot config to ~/.config/brainkit/copilot/. Removed ${String(removed.length)} legacy file(s) from your vault: ${removed.join(", ")}. ` +
        `Run \`git status\` to review; \`git restore <path>\` to recover.`,
    );
  }
}

// ---------------------------------------------------------------------------
// $COPILOT_HOME setup
// ---------------------------------------------------------------------------

export function writeCopilotInstructions(
  copilotHome: string,
  config: ReturnType<typeof readVaultConfigSimple>,
  vaultPath: string,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });
  const prompt = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  writeIfChanged(path.join(copilotHome, "copilot-instructions.md"), prompt + "\n");
}

export function installCopilotHooks(copilotHome: string): string {
  const scriptsDir = path.join(copilotHome, "hooks", "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptPath = path.join(scriptsDir, "auto-commit.js");
  writeIfChanged(scriptPath, AUTO_COMMIT_SCRIPT);
  return scriptPath;
}

// ---------------------------------------------------------------------------
// settings.json merge (preserves user / Copilot-runtime additions)
// ---------------------------------------------------------------------------

interface HookEntry {
  command: string;
  description?: string;
}

/**
 * Merge brainkit-owned settings into existing settings.json content.
 *
 * Behavior:
 * - All keys NOT in `BRAINKIT_OWNED_SETTINGS_KEYS` are preserved verbatim
 *   from `existing` (preserves `mcpServers`, `theme`, etc. that Copilot CLI
 *   may write at runtime). They appear FIRST in the output object, in their
 *   existing insertion order.
 * - `companyAnnouncements`, `statusLine`, `hooks` are appended in that fixed
 *   order at the END of the output object. Replace-wholesale for the first
 *   two; per-event merge for `hooks` (see below).
 * - `hooks` is merged per-event:
 *   - For each event key in `brainkitOwned.hooks`: strip entries identified
 *     as brainkit-owned (description starts with
 *     `BRAINKIT_HOOK_DESCRIPTION_PREFIX` OR matches an entry in
 *     `LEGACY_BRAINKIT_HOOK_DESCRIPTIONS`) from the existing array, then
 *     append brainkit's fresh entries. Preserves user entries; idempotent
 *     across N launches; safe across upgrades from prior brainkit versions
 *     that used unprefixed descriptions.
 *   - User-added event keys not present in `brainkitOwned.hooks` are
 *     preserved untouched.
 *   - If existing event value is not an array (malformed), brainkit
 *     overwrites it.
 *
 * **Canonical key order is load-bearing:** `JSON.stringify` preserves
 * insertion order, and the skip-on-unchanged check is byte-equality based.
 * If the output key order varied across launches, the file would be
 * rewritten on every launch even when content was semantically identical.
 *
 * Pure function — no I/O. Pass `null` for `existing` when the file doesn't
 * exist or was unparseable.
 */
export function mergeCopilotSettings(
  existing: Record<string, unknown> | null,
  brainkitOwned: {
    companyAnnouncements: string[];
    statusLine: { command: string };
    hooks: Record<string, HookEntry[]>;
  },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // 1. Carry over all non-brainkit-owned keys from existing FIRST, preserving
  //    their insertion order.
  if (existing !== null) {
    for (const [key, value] of Object.entries(existing)) {
      if (!BRAINKIT_OWNED_SETTINGS_KEY_SET.has(key)) {
        result[key] = value;
      }
    }
  }

  // 2. Brainkit-owned scalar keys: replace wholesale, fixed order.
  result["companyAnnouncements"] = brainkitOwned.companyAnnouncements;
  result["statusLine"] = brainkitOwned.statusLine;

  // 3. Hooks: per-event merge.
  const existingHooks: Record<string, unknown> =
    existing !== null && typeof existing["hooks"] === "object" && existing["hooks"] !== null
      ? (existing["hooks"] as Record<string, unknown>)
      : {};
  const mergedHooks: Record<string, HookEntry[]> = {};

  // 3a. Carry over user-only event keys (not managed by brainkit).
  for (const [event, entries] of Object.entries(existingHooks)) {
    if (!(event in brainkitOwned.hooks) && Array.isArray(entries)) {
      mergedHooks[event] = entries as HookEntry[];
    }
  }

  // 3b. Per brainkit-managed event: strip brainkit-owned, append fresh.
  for (const [event, brainkitEntries] of Object.entries(brainkitOwned.hooks)) {
    const existingEntries = existingHooks[event];
    const userEntries: HookEntry[] = Array.isArray(existingEntries)
      ? (existingEntries as HookEntry[]).filter((entry) => !isBrainkitOwnedHookEntry(entry))
      : [];
    mergedHooks[event] = [...userEntries, ...brainkitEntries];
  }

  result["hooks"] = mergedHooks;
  return result;
}

/**
 * True if a hook entry is brainkit-owned (current `brainkit:` prefix or any
 * legacy exact-match description from prior versions).
 */
function isBrainkitOwnedHookEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const desc = (entry as { description?: unknown }).description;
  if (typeof desc !== "string") return false;
  if (desc.startsWith(BRAINKIT_HOOK_DESCRIPTION_PREFIX)) return true;
  if (LEGACY_BRAINKIT_HOOK_DESCRIPTIONS.has(desc)) return true;
  return false;
}

export function generateCopilotSettings(
  copilotHome: string,
  statusScriptPath: string,
  autoCommitScriptPath: string,
): void {
  fs.mkdirSync(copilotHome, { recursive: true });
  // Schema verified 2026-04-28 against Copilot CLI v1.0.37 (event-keyed inline hooks).
  const settings = {
    companyAnnouncements: COMPANY_ANNOUNCEMENTS,
    statusLine: {
      command: `node ${statusScriptPath.replace(/\\/g, "/")}`,
    },
    hooks: {
      agentStop: [
        {
          command: `node ${autoCommitScriptPath.replace(/\\/g, "/")}`,
          description: "Auto-commit vault changes after agent turns",
        },
      ],
      sessionEnd: [
        {
          command: `node ${autoCommitScriptPath.replace(/\\/g, "/")}`,
          description: "Commit any remaining vault changes on session end",
        },
      ],
    },
  };
  fs.writeFileSync(path.join(copilotHome, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Onboarding workspace (unchanged)
// ---------------------------------------------------------------------------

export function ensureOnboardingWorkspace(configDir: string): string {
  const onboardingDir = path.join(configDir, "onboarding");
  fs.mkdirSync(onboardingDir, { recursive: true });

  const prompt = buildOnboardingPrompt("copilot");
  fs.writeFileSync(path.join(onboardingDir, "AGENTS.md"), prompt + "\n", "utf-8");

  return onboardingDir;
}

export function cleanupOnboardingWorkspace(configDir: string): void {
  // The onboarding workspace at $CONFIG_DIR/onboarding/ is shared across all
  // brainkit harnesses (Copilot's AGENTS.md, Claude's CLAUDE.md, etc.).
  // Wiping the whole directory is intentional: it removes any leftover from a
  // prior partial onboarding session, regardless of which harness ran it.
  // Narrow concurrent-onboarding race accepted as a known limitation per spec.
  const onboardingDir = path.join(configDir, "onboarding");
  try {
    fs.rmSync(onboardingDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Launch orchestrator
// ---------------------------------------------------------------------------

export function launchCopilot(args: string[], selectedVaultPath?: string): void {
  const configDir = getConfigDir();
  let vaultPath = selectedVaultPath;

  if (vaultPath === undefined) {
    const globalConfig = readGlobalConfig();
    if (globalConfig === null || !globalConfig.brain_path) {
      // No vault configured — launch onboarding (unchanged path).
      const onboardingDir = ensureOnboardingWorkspace(configDir);

      p.outro("Starting onboarding...");
      // Order matters: `-i, --interactive <prompt>` consumes the next token as
      // its value. `--allow-all` must come BEFORE `-i`, and the prompt string
      // must immediately follow `-i`. Putting `--allow-all` between them makes
      // Copilot treat `--allow-all` as the prompt and the actual prompt as a
      // stray positional → "error: too many arguments. Expected 0 arguments
      // but got 1."
      const child = spawnHarness("copilot", ["--allow-all", "-i", "Let's set up my first brainkit vault!", ...args], {
        stdio: "inherit",
        cwd: onboardingDir,
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    vaultPath = globalConfig.brain_path;
  }

  // Reject --config-dir before any other side effect.
  if (hasConfigDirArg(args)) {
    p.log.error(
      "brainkit manages Copilot's config dir; the --config-dir flag is not supported when launching Copilot via brainkit.",
    );
    process.exit(1);
  }

  // Defensive version check (warns, doesn't abort).
  checkCopilotVersion();

  // Clean up onboarding workspace from a previous first run.
  cleanupOnboardingWorkspace(configDir);

  const config = readVaultConfigSimple(vaultPath);
  const copilotHome = getCopilotConfigDir();
  fs.mkdirSync(copilotHome, { recursive: true });

  // Populate $COPILOT_HOME *first*, before any destructive vault operation.
  // If any of these fail, the vault is still intact and the user can re-run.
  // If we deleted from the vault first and then population failed, the user
  // would lose brainkit context everywhere until re-run.
  const packageRoot = findPackageRoot();
  const skillsSourceDir = path.join(packageRoot, "skills");
  const targetDir = path.join(copilotHome, "skills", "brainkit");
  installSkills({ skillsSourceDir, targetDir, version });
  writeCopilotInstructions(copilotHome, config, vaultPath);
  const autoCommitScriptPath = installCopilotHooks(copilotHome);
  const statusScriptPath = path.join(packageRoot, "dist", "cli", "copilot-status.js");
  generateCopilotSettings(copilotHome, statusScriptPath, autoCommitScriptPath);

  // Now that $COPILOT_HOME is fully populated, run the one-shot legacy-file
  // migration (gated by marker; throws on partial failure; refuses to run on a
  // non-git vault if there's anything to delete).
  runMigrationIfNeeded(vaultPath);

  // Spawn copilot with COPILOT_HOME isolation and BRAINKIT_VAULT_PATH for status script.
  const env = {
    ...process.env,
    COPILOT_HOME: copilotHome,
    BRAINKIT_VAULT_PATH: vaultPath,
  };
  const child = spawnHarness("copilot", args, { stdio: "inherit", cwd: vaultPath, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
