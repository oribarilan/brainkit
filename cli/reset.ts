import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as p from "@clack/prompts";
import { getConfigDir } from "../core/index.js";

const RESET_PROMPT = `Remove all brainkit config from this machine?

This deletes:
  • Vault location (you'll re-onboard on next launch)
  • Brainkit-managed harness configs (regenerated on next launch)
  • Copilot auth and conversation history (you'll re-authenticate Copilot)
  • Onboarding workspace

This does NOT touch your vaults or your global harness configs
(~/.config/opencode/, ~/.copilot/).`;

/**
 * Removes the entire brainkit config dir (`getConfigDir()`), including
 * brainkit-managed harness configs and Copilot's isolated `$COPILOT_HOME`
 * (auth tokens, conversation history, MCP cache).
 *
 * Vaults and the user's global harness configs (`~/.config/opencode/`,
 * `~/.copilot/`) are never touched — `getConfigDir()` is the boundary.
 *
 * Defensive guard: refuses to delete `/`, `os.homedir()`, or an empty path.
 * `getConfigDir()` should never return these in practice; the guard exists
 * so a future bug in `getConfigDir` cannot escalate to data loss. Note we
 * intentionally allow paths outside `$HOME` — `BRAINKIT_CONFIG_DIR` may
 * point at a tmp dir (used by tests) or any other location the user picks.
 *
 * @throws if the resolved config dir fails the safety guard
 */
export function resetBrainkitConfig(): void {
  const raw = getConfigDir();
  if (raw === "") {
    throw new Error("Refusing to delete: getConfigDir() returned empty string.");
  }
  const configDir = path.resolve(raw);
  const home = path.resolve(os.homedir());
  const root = path.parse(configDir).root;

  if (configDir === root || configDir === home) {
    throw new Error(`Refusing to delete ${configDir}: resolves to filesystem root or home directory.`);
  }

  fs.rmSync(configDir, { recursive: true, force: true });
}

/**
 * Interactive `brainkit reset` orchestration: shows the user what will be
 * removed, confirms, calls {@link resetBrainkitConfig}, and reports the
 * outcome via @clack/prompts. Calls `process.exit` on cancellation or
 * helper failure.
 */
export async function factoryReset(): Promise<void> {
  p.intro("brainkit reset");

  p.note(RESET_PROMPT, "What will be removed");

  const shouldReset = await p.confirm({
    message: "Continue?",
  });

  if (p.isCancel(shouldReset) || !shouldReset) {
    p.cancel("Reset cancelled.");
    process.exit(0);
  }

  try {
    resetBrainkitConfig();
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  p.log.success("Brainkit config removed.");
  p.outro("Run `brainkit` to start fresh.");
}
