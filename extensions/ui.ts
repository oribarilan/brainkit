import * as path from "node:path";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import type { BrainkitConfig } from "./vault.js";

export function setupUI(
  pi: ExtensionAPI,
  getVaultPath: () => string | null,
  getConfig: () => BrainkitConfig | null,
): void {
  // -------------------------------------------------------------------------
  // Hints — rotate in the status bar
  // -------------------------------------------------------------------------
  const HINTS = [
    "/setup to configure your vault",
    "/doctor to check vault health",
    "ask me about your vault stats",
    "mention an accomplishment and I'll offer to capture it",
    "brain_search to find anything in your vault",
    "brain_add_brag to log accomplishments",
    "brain_query_contacts to look up people",
    "I can create meeting notes from any conversation",
  ];

  let hintIndex = 0;
  let hintTimer: ReturnType<typeof setInterval> | null = null;
  let currentTheme: Theme | null = null;

  function formatStatus(theme: Theme): string {
    const vaultPath = getVaultPath();
    const hint = theme.fg("dim", HINTS[hintIndex % HINTS.length]);
    if (vaultPath) {
      const dirName = path.basename(vaultPath);
      return theme.fg("accent", `[brainkit]`) + " " + theme.fg("success", dirName) + theme.fg("dim", " · ") + hint;
    }
    return theme.fg("warning", "[brainkit] no vault") + theme.fg("dim", " · ") + hint;
  }

  // -------------------------------------------------------------------------
  // Custom header — rose + quick reference
  // -------------------------------------------------------------------------
  pi.on("session_start", async (_event, ctx) => {
    currentTheme = ctx.ui.theme;

    if (ctx.hasUI) {
      ctx.ui.setHeader((_tui, theme) => {
        return {
          render(_width: number): string[] {
            const accent = (s: string) => theme.fg("accent", s);
            const dim = (s: string) => theme.fg("dim", s);
            const muted = (s: string) => theme.fg("muted", s);
            return [
              "",
              accent("        _---~~(~~-_."),
              accent("      _{        )   )"),
              accent("    ,   ) -~~- ( ,-' )_"),
              accent("   (  `-,_..`., )-- '_,)"),
              accent("  ( ` _)  (  -~( -_ `,  }"),
              accent("  (_-  _  ~_-~~~~`,  ,' )"),
              accent("    `~ -^(    __;-,((()))"),
              accent("          ~~~~ {_ -_(())"),
              accent("                 `\\  }"),
              accent("                   { }"),
              "",
              `   ${dim("brainkit")} ${muted("— your second brain, always with you")}`,
              "",
              `   ${accent("/setup")}  ${muted("configure vault")}    ${accent("/doctor")}  ${muted("health check")}`,
              "",
            ];
          },
          invalidate() {},
        };
      });
    }

    // Initial status
    ctx.ui.setStatus("brainkit", formatStatus(ctx.ui.theme));

    // Rotate hints every 12 seconds
    if (hintTimer) clearInterval(hintTimer);
    hintTimer = setInterval(() => {
      hintIndex++;
      if (currentTheme) {
        ctx.ui.setStatus("brainkit", formatStatus(currentTheme));
      }
    }, 12_000);
  });

  // Clean up timer on shutdown
  pi.on("session_shutdown", async () => {
    if (hintTimer) {
      clearInterval(hintTimer);
      hintTimer = null;
    }
  });
}
