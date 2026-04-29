import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import { spawnHarness } from "./spawn.js";
import { findPackageRoot } from "./package-root.js";
import {
  readGlobalConfig,
  readVaultConfigSimple,
  buildSystemPrompt,
  buildOnboardingPrompt,
  getConfigDir,
  installSkillsCore,
  type BuildSkillContentArgs,
} from "../core/index.js";
import { isOlderThan } from "./version-utils.js";
import { version } from "./version.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum Claude Code version where brainkit's plugin model + theme path are
 * smoke-validated. Below this, brainkit may not load correctly. Currently
 * tested against Claude Code 2.1.109. Bump when re-validating against newer
 * floors.
 */
export const MIN_CLAUDE_VERSION = "2.1.109";

/**
 * Single tip surfaced via `companyAnnouncements`. Per smoke test Q4, Claude
 * always shows entry 0 — extra entries are wasted. Keep it punchy and
 * action-oriented; matches the shape used by Copilot's COMPANY_ANNOUNCEMENTS.
 */
const CLAUDE_COMPANY_ANNOUNCEMENT = "mention an accomplishment and I'll offer to capture it";

const PLUGIN_VERSION_MARKER = ".brainkit-version";

/**
 * Brand theme written to `$CLAUDE_CONFIG_DIR/themes/brainkit.json` on every
 * launch. Per smoke test Q3, only the `claude` token has visible effect in the
 * tested Claude version; the other tokens are included as forward-compatible
 * hints but may not paint until Claude exposes them. Palette source is
 * `opencode/brainkit.json` (`rose: "#E8A0BF"`).
 */
const CLAUDE_THEME = {
  name: "brainkit",
  base: "dark",
  overrides: {
    claude: "#E8A0BF",
    error: "#E85050",
    success: "#50E880",
    warning: "#E8C850",
  },
} as const;

// ---------------------------------------------------------------------------
// Claude version check
// ---------------------------------------------------------------------------

/**
 * Best-effort: run `claude --version`, parse, and warn if below
 * `MIN_CLAUDE_VERSION`. Skipped on any error (parse failure, binary missing,
 * etc.) — version check is defensive, not gating.
 *
 * Mirrors `cli/copilot.ts`'s `checkCopilotVersion()`. Reuses `isOlderThan`
 * from `cli/version-utils.ts` so we don't reinvent semver comparison.
 */
export function checkClaudeVersion(): void {
  let output: string;
  try {
    output = execFileSync("claude", ["--version"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  } catch {
    return; // can't check, don't block
  }
  const match = /(\d+\.\d+\.\d+)/.exec(output);
  if (match === null) return;
  const found = match[1] as string;
  if (isOlderThan(found, MIN_CLAUDE_VERSION)) {
    p.log.warn(
      `brainkit requires Claude Code ≥ v${MIN_CLAUDE_VERSION} for proper isolation. You are on v${found}. ` +
        `brainkit's prompt and skills may not load. Upgrade with \`npm install -g @anthropic-ai/claude-code\`.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Plugin staging
// ---------------------------------------------------------------------------

/**
 * Read the version marker at `<stagingDir>/.brainkit-version`. Returns the
 * trimmed contents, or `null` if the marker is missing or unreadable.
 */
function readStagingVersionMarker(stagingDir: string): string | null {
  try {
    return fs.readFileSync(path.join(stagingDir, PLUGIN_VERSION_MARKER), "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Copy `<pkgRoot>/claude/` into `<stagingDir>` if the version marker is stale
 * or missing. The package's `claude/` tree is read-only at runtime (lives
 * inside `node_modules` for npm installs), so all writes — including the
 * skill installer — must target the staging dir.
 *
 * `fs.cpSync({ recursive: true, force: true })` preserves exec bits on Unix
 * so `scripts/*.mjs` remain runnable. On Windows the exec bit is meaningless.
 */
export function stagePluginIfNeeded(packageRoot: string, stagingDir: string, pkgVersion: string): boolean {
  const existing = readStagingVersionMarker(stagingDir);
  if (existing === pkgVersion) return false;

  fs.mkdirSync(path.dirname(stagingDir), { recursive: true });
  // Wipe stale staging tree to drop files that may have been removed in this
  // version (the cp below is overlay-merge, not clean-and-copy).
  fs.rmSync(stagingDir, { recursive: true, force: true });

  const sourceDir = path.join(packageRoot, "claude");
  fs.cpSync(sourceDir, stagingDir, { recursive: true, force: true });

  // Sync the staged plugin.json's `version` field with brainkit's package
  // version. The shipped plugin.json has a hardcoded version that drifts on
  // every release; rewriting it here at staging time keeps it in lockstep
  // with `cli/version.ts` and avoids `claude /plugin` reporting a stale
  // version after upgrade.
  rewriteStagedPluginVersion(stagingDir, pkgVersion);

  return true;
}

function rewriteStagedPluginVersion(stagingDir: string, pkgVersion: string): void {
  const manifestPath = path.join(stagingDir, ".claude-plugin", "plugin.json");
  try {
    const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
    content["version"] = pkgVersion;
    fs.writeFileSync(manifestPath, JSON.stringify(content, null, 2) + "\n", "utf-8");
  } catch {
    // Best-effort: if the manifest is unreadable for any reason, the staged
    // copy still works (`enabledPlugins` keys off the bare name, not the
    // version). Logging here would just spam non-actionable output to the
    // user before they even open Claude.
  }
}

/**
 * Frontmatter transform for the per-dir skill layout consumed by Claude.
 *
 * Claude expects:
 * - `name` — skill identifier
 * - `description` — used by Claude's skill picker; preserved from source
 * - `disable-model-invocation` — `true` for sub-skills (user-invoked only),
 *   `false` for the root brainkit skill (always loaded).
 *
 * Source skills currently have `description` (and sometimes `name`) only —
 * we extract the description and emit Claude-native frontmatter.
 */
export function buildClaudeSkillContent(args: BuildSkillContentArgs): string {
  const { name, sourceContent, isRoot } = args;
  const description = extractDescriptionFromFrontmatter(sourceContent) ?? `Brainkit ${name} skill`;
  const body = stripFrontmatter(sourceContent);
  // JSON.stringify produces a valid double-quoted YAML scalar (YAML is a JSON
  // superset for flow-style strings). Defends against descriptions containing
  // `:`, `#`, leading `>`/`|`/`[`/`{`, etc., which would otherwise produce
  // malformed YAML and cause Claude to silently drop the skill.
  const frontmatter = [
    "---",
    `name: ${JSON.stringify(name)}`,
    `description: ${JSON.stringify(description)}`,
    `disable-model-invocation: ${isRoot ? "false" : "true"}`,
    "---",
  ].join("\n");
  return frontmatter + "\n\n" + body.trimStart();
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("---", 3);
  if (end === -1) return content;
  return content.slice(end + 3).trimStart();
}

function extractDescriptionFromFrontmatter(content: string): string | null {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("---", 3);
  if (end === -1) return null;
  const fm = content.slice(3, end);
  // Match either `description: foo` or `description: >\n  foo bar` (YAML folded).
  const folded = /description:\s*>[^\n]*\n((?:\s+[^\n]*\n?)+)/.exec(fm);
  if (folded !== null) {
    const lines = (folded[1] ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return lines.join(" ");
  }
  const single = /description:\s*(.+)/.exec(fm);
  if (single !== null) return (single[1] ?? "").trim();
  return null;
}

// ---------------------------------------------------------------------------
// $CLAUDE_CONFIG_DIR setup
// ---------------------------------------------------------------------------

export function writeClaudeSystemPrompt(
  claudeConfigDir: string,
  config: ReturnType<typeof readVaultConfigSimple>,
  vaultPath: string,
): void {
  fs.mkdirSync(claudeConfigDir, { recursive: true });
  const prompt = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  fs.writeFileSync(path.join(claudeConfigDir, "system-prompt.txt"), prompt + "\n", "utf-8");
}

export function writeClaudeTheme(claudeConfigDir: string): void {
  const themesDir = path.join(claudeConfigDir, "themes");
  fs.mkdirSync(themesDir, { recursive: true });
  fs.writeFileSync(path.join(themesDir, "brainkit.json"), JSON.stringify(CLAUDE_THEME, null, 2) + "\n", "utf-8");
}

/**
 * Write `~/.config/brainkit/claude/settings.json` consumed by Claude when
 * launched with `CLAUDE_CONFIG_DIR` pointed here. Always regenerated each
 * launch so any stale config from a prior brainkit version is overwritten.
 *
 * Schema notes (verified by smoke test against Claude Code 2.1.109):
 * - `theme: "brainkit"` references the launcher-written `themes/brainkit.json`.
 * - `companyAnnouncements` always shows entry 0 only (Q4) — ship one tip.
 * - `enabledPlugins` keys use bare plugin names (Q2), not `name@source`.
 * - `statusLine.command` must be an absolute path; backslashes are normalized
 *   to forward slashes for portability across platforms.
 */
export function generateClaudeSettings(claudeConfigDir: string, statusScriptPath: string): void {
  fs.mkdirSync(claudeConfigDir, { recursive: true });
  const settings = {
    theme: "brainkit",
    statusLine: {
      type: "command",
      command: `node ${statusScriptPath.replace(/\\/g, "/")}`,
    },
    companyAnnouncements: [CLAUDE_COMPANY_ANNOUNCEMENT],
    enabledPlugins: {
      brainkit: true,
    },
  };
  fs.writeFileSync(path.join(claudeConfigDir, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Onboarding workspace
// ---------------------------------------------------------------------------

/**
 * Onboarding workspace is shared with Copilot at `$CONFIG_DIR/onboarding/`.
 * Different filenames per harness (`CLAUDE.md` vs `AGENTS.md`) avoid
 * conflicts. Narrow race exists if both onboardings run concurrently in two
 * terminals — accepted as a known limitation per spec.
 */
export function ensureClaudeOnboardingWorkspace(configDir: string): string {
  const onboardingDir = path.join(configDir, "onboarding");
  fs.mkdirSync(onboardingDir, { recursive: true });

  const prompt = buildOnboardingPrompt("claude");
  // Claude reads CLAUDE.md from cwd automatically (per-project memory).
  fs.writeFileSync(path.join(onboardingDir, "CLAUDE.md"), prompt + "\n", "utf-8");

  return onboardingDir;
}

export function cleanupClaudeOnboardingWorkspace(configDir: string): void {
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

/**
 * Launch Claude Code with brainkit's plugin and isolated config directory.
 *
 * @param args - User-supplied CLI args passed through to claude verbatim
 *   (e.g. `--model sonnet`, `--dangerously-skip-permissions`). Appended after
 *   brainkit's own `--plugin-dir` and `--append-system-prompt-file` flags.
 * @param selectedVaultPath - Optional vault path. When provided (e.g. by the
 *   multi-vault selector in `cli/launch.ts`), skips the global-config lookup.
 *   When undefined, falls back to `readGlobalConfig().brain_path`. If both are
 *   absent, enters the onboarding flow.
 *
 * Always runs the version check, plugin staging, and settings/theme/prompt
 * regeneration in that order. Spawns `claude` with isolated `CLAUDE_CONFIG_DIR`
 * so the user's `~/.claude/` is never touched.
 *
 * - Onboarding (no vault): spawns Claude in a workspace under
 *   `$CONFIG_DIR/onboarding/` with a generated `CLAUDE.md`. No plugin, no
 *   custom system prompt — keeps the first-run experience minimal.
 * - Main: stages `<pkgRoot>/claude/` into
 *   `$CONFIG_DIR/claude/plugin/`, generates skills into the staging dir,
 *   writes theme + settings + system-prompt files, and spawns `claude` with
 *   `CLAUDE_CONFIG_DIR` pointed at brainkit's isolated config.
 *
 * Per smoke test Q1, the plugin model is supported. Per AGENTS.md § Harness
 * Config Isolation, brainkit must NEVER read or write `~/.claude/`.
 *
 * Note on `--config-dir` rejection: Claude Code (as of 2.1.x) has no
 * `--config-dir` flag — `CLAUDE_CONFIG_DIR` is the only redirection mechanism
 * and is honored unconditionally. No flag rejection is needed.
 */
export function launchClaude(args: string[], selectedVaultPath?: string): void {
  const configDir = getConfigDir();
  let vaultPath = selectedVaultPath;

  if (vaultPath === undefined) {
    const globalConfig = readGlobalConfig();
    if (globalConfig === null || !globalConfig.brain_path) {
      const onboardingDir = ensureClaudeOnboardingWorkspace(configDir);
      p.outro("Starting onboarding...");
      // No --plugin-dir or --append-system-prompt-file in onboarding: the
      // user has no vault yet, the generated CLAUDE.md in cwd carries the
      // setup instructions, and Claude reads it automatically.
      const child = spawnHarness("claude", args, { stdio: "inherit", cwd: onboardingDir });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }
    vaultPath = globalConfig.brain_path;
  }

  // Defensive version check (warns, doesn't abort).
  checkClaudeVersion();

  // Clean up onboarding workspace from a previous first run.
  cleanupClaudeOnboardingWorkspace(configDir);

  const config = readVaultConfigSimple(vaultPath);
  const claudeConfigDir = path.join(configDir, "claude");
  const stagingDir = path.join(claudeConfigDir, "plugin");
  fs.mkdirSync(claudeConfigDir, { recursive: true });

  // 1. Stage the plugin tree (fast-path skip if version marker matches).
  const packageRoot = findPackageRoot();
  const staged = stagePluginIfNeeded(packageRoot, stagingDir, version);

  // 2. Generate skills into the staging dir using per-dir layout.
  //    Hand-authored doctor/ skill survives because it was just copied over
  //    by the cp step; the installer adds the others alongside it.
  const skillsSourceDir = path.join(packageRoot, "skills");
  const skillsTargetDir = path.join(stagingDir, "skills");
  installSkillsCore({
    layout: "per-dir",
    skillsSourceDir,
    targetDir: skillsTargetDir,
    version,
    buildSkillContent: buildClaudeSkillContent,
  });

  // 3. Write the brand theme (always regenerated — cheap, deterministic).
  writeClaudeTheme(claudeConfigDir);

  // 4. Write the system prompt (always regenerated — vault state changes).
  writeClaudeSystemPrompt(claudeConfigDir, config, vaultPath);

  // 5. Write user settings (always regenerated).
  const statusScriptPath = path.join(stagingDir, "scripts", "statusline.mjs");
  generateClaudeSettings(claudeConfigDir, statusScriptPath);

  // Mark fresh staging by writing the version marker AFTER skill generation
  // so a partial failure leaves the marker stale and the next launch retries.
  if (staged) {
    fs.writeFileSync(path.join(stagingDir, PLUGIN_VERSION_MARKER), version + "\n", "utf-8");
  }

  const systemPromptPath = path.join(claudeConfigDir, "system-prompt.txt");
  const launchArgs = ["--plugin-dir", stagingDir, "--append-system-prompt-file", systemPromptPath, ...args];

  // BRAINKIT_VAULT_PATH is set so hook scripts (auto-commit, precompact)
  // — which don't receive Claude's JSON payload — can locate the vault.
  // Statusline can use Claude's `cwd` field per smoke test Q5.
  // BRAINKIT_PACKAGE_ROOT is consumed by claude/scripts/precompact.mjs and
  // claude/scripts/statusline.mjs at runtime to dynamically import
  // dist/core/index.js. See those scripts' top-of-file comments for the contract.
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: claudeConfigDir,
    BRAINKIT_VAULT_PATH: vaultPath,
    BRAINKIT_PACKAGE_ROOT: packageRoot,
  };
  const child = spawnHarness("claude", launchArgs, { stdio: "inherit", cwd: vaultPath, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
