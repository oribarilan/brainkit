import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readGlobalConfig, readVaultConfigSimple, buildSystemPrompt } from "../core/index.js";
import { installSkills } from "./install-skills.js";
import { version } from "./version.js";

// ---------------------------------------------------------------------------
// Package root resolution
// ---------------------------------------------------------------------------

function findPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    try {
      const content = JSON.parse(fs.readFileSync(candidate, "utf-8")) as { name?: string };
      if (content.name === "@oribish/brainkit") return dir;
    } catch {
      // not found or not parseable, keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not find @oribish/brainkit package root");
    dir = parent;
  }
}

// ---------------------------------------------------------------------------
// Gitignore
// ---------------------------------------------------------------------------

const GITIGNORE_ENTRIES = [
  "# brainkit — generated files",
  ".agents/skills/brainkit/",
  ".github/hooks/",
  ".github/copilot/",
];

export function updateGitignore(vaultPath: string): void {
  const gitignorePath = path.join(vaultPath, ".gitignore");

  let existing = "";
  try {
    existing = fs.readFileSync(gitignorePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const linesToAdd = GITIGNORE_ENTRIES.filter((entry) => !existing.includes(entry));
  if (linesToAdd.length === 0) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n\n" : existing.length > 0 ? "\n" : "";
  const block = linesToAdd.join("\n") + "\n";

  fs.writeFileSync(gitignorePath, existing + separator + block, "utf-8");
}

// ---------------------------------------------------------------------------
// Copilot settings
// ---------------------------------------------------------------------------

const COMPANY_ANNOUNCEMENTS = [
  "mention an accomplishment and I'll offer to capture it",
  "I can create meeting notes from any conversation",
  "ask me about your vault stats",
  "I can search your vault for anything",
  "I organize using the PARA method",
  "I'll remind you if your bragfile gets stale",
  "ask me to check vault health",
];

export function generateCopilotSettings(vaultPath: string, statusScriptPath: string): void {
  const settingsDir = path.join(vaultPath, ".github", "copilot");
  fs.mkdirSync(settingsDir, { recursive: true });

  const settings = {
    companyAnnouncements: COMPANY_ANNOUNCEMENTS,
    statusLine: {
      command: `node ${statusScriptPath}`,
    },
  };

  fs.writeFileSync(path.join(settingsDir, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Copilot hooks
// ---------------------------------------------------------------------------

const HOOKS_CONFIG = {
  hooks: [
    {
      event: "agentStop",
      command: ".github/hooks/scripts/auto-commit.sh",
      description: "Auto-commit vault changes after agent turns",
    },
    {
      event: "sessionEnd",
      command: ".github/hooks/scripts/auto-commit.sh",
      description: "Commit any remaining vault changes on session end",
    },
  ],
};

const AUTO_COMMIT_SCRIPT = `#!/usr/bin/env bash
# Only commit if this is a git repo with uncommitted changes
git rev-parse --git-dir > /dev/null 2>&1 || exit 0
[ -z "$(git status --porcelain 2>/dev/null)" ] && exit 0
git add -A 2>/dev/null || exit 0
git commit -m "brainkit: auto-save $(date +%Y-%m-%d)" > /dev/null 2>&1 || true
`;

export function installCopilotHooks(vaultPath: string): void {
  const hooksDir = path.join(vaultPath, ".github", "hooks");
  const scriptsDir = path.join(hooksDir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });

  fs.writeFileSync(path.join(hooksDir, "hooks.json"), JSON.stringify(HOOKS_CONFIG, null, 2) + "\n", "utf-8");

  const scriptPath = path.join(scriptsDir, "auto-commit.sh");
  fs.writeFileSync(scriptPath, AUTO_COMMIT_SCRIPT, "utf-8");
  fs.chmodSync(scriptPath, 0o755);
}

// ---------------------------------------------------------------------------
// AGENTS.md generation
// ---------------------------------------------------------------------------

function writeAgentsMd(vaultPath: string, config: ReturnType<typeof readVaultConfigSimple>): void {
  const prompt = buildSystemPrompt(config, vaultPath, { mode: "cli" });
  fs.writeFileSync(path.join(vaultPath, "AGENTS.md"), prompt + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Launch orchestrator
// ---------------------------------------------------------------------------

export function launchCopilot(args: string[], selectedVaultPath?: string): void {
  let vaultPath = selectedVaultPath;

  if (vaultPath === undefined) {
    const globalConfig = readGlobalConfig();
    if (globalConfig === null || !globalConfig.brain_path) {
      console.error("  [brainkit] No vault configured. Run brainkit with OpenCode first to set up your vault.");
      process.exit(1);
    }
    vaultPath = globalConfig.brain_path;
  }
  const config = readVaultConfigSimple(vaultPath);

  // Install skills
  const packageRoot = findPackageRoot();
  const skillsSourceDir = path.join(packageRoot, "skills");
  const targetDir = path.join(vaultPath, ".agents", "skills", "brainkit");
  installSkills({ skillsSourceDir, targetDir, version });

  // Generate AGENTS.md
  writeAgentsMd(vaultPath, config);

  // Install hooks
  installCopilotHooks(vaultPath);

  // Write Copilot settings
  const statusScriptPath = path.join(packageRoot, "dist", "cli", "copilot-status.js");
  generateCopilotSettings(vaultPath, statusScriptPath);

  // Update .gitignore
  updateGitignore(vaultPath);

  // Spawn copilot with BRAINKIT_VAULT_PATH for status script
  const env = { ...process.env, BRAINKIT_VAULT_PATH: vaultPath };
  const child = spawn("copilot", args, { stdio: "inherit", cwd: vaultPath, env });
  child.on("exit", (code) => process.exit(code ?? 0));
}
