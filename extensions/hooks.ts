import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { buildSystemPrompt } from "./system-prompt.js";
import { scheduleAutoCommit, flushAutoCommit } from "./auto-commit.js";
import type { BrainkitConfig } from "./vault.js";

// ---------------------------------------------------------------------------
// Desktop notification helper
// ---------------------------------------------------------------------------

function notifyDesktop(title: string, body: string): void {
  // OSC 777 for Ghostty, iTerm2, WezTerm
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

// ---------------------------------------------------------------------------
// Auto-brag detection helpers
// ---------------------------------------------------------------------------

const ACCOMPLISHMENT_KEYWORDS = [
  "shipped",
  "launched",
  "completed",
  "delivered",
  "fixed",
  "resolved",
  "implemented",
  "deployed",
  "released",
  "finished",
  "built",
];

/**
 * Check whether an accomplishment keyword appears near "you" or "your" in the
 * text, suggesting the agent is describing the *user's* accomplishment rather
 * than its own work.  We look for "you"/"your" within ~50 characters of the
 * keyword match.
 */
export function containsUserAccomplishment(text: string): boolean {
  const lowerText = text.toLowerCase();

  for (const keyword of ACCOMPLISHMENT_KEYWORDS) {
    let searchStart = 0;

    for (;;) {
      const kwIndex = lowerText.indexOf(keyword, searchStart);
      if (kwIndex === -1) break;

      // Ensure the keyword is at a word boundary (not part of a larger word)
      const charBefore = kwIndex > 0 ? (lowerText[kwIndex - 1] ?? " ") : " ";
      const charAfter =
        kwIndex + keyword.length < lowerText.length ? (lowerText[kwIndex + keyword.length] ?? " ") : " ";

      if (/\w/.test(charBefore) || /\w/.test(charAfter)) {
        searchStart = kwIndex + keyword.length;
        continue;
      }

      // Check for "you" or "your" within a 50-char window around the keyword
      const windowStart = Math.max(0, kwIndex - 50);
      const windowEnd = Math.min(lowerText.length, kwIndex + keyword.length + 50);
      const window = lowerText.slice(windowStart, windowEnd);

      // Match "you" or "your" as whole words
      if (/\byou\b|\byour\b/.test(window)) {
        // Make sure the agent isn't talking about itself — reject if "i "
        // appears right before the keyword (e.g., "I implemented the function")
        const prefixWindow = lowerText.slice(Math.max(0, kwIndex - 15), kwIndex).trimEnd();
        if (/\bi$/i.test(prefixWindow) || /\bi've$/i.test(prefixWindow)) {
          searchStart = kwIndex + keyword.length;
          continue;
        }
        return true;
      }

      searchStart = kwIndex + keyword.length;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Hook setup
// ---------------------------------------------------------------------------

export function setupHooks(
  pi: ExtensionAPI,
  getVaultPath: () => string | null,
  getConfig: () => BrainkitConfig | null,
): void {
  // Track which message indices we've already suggested brag capture for,
  // so we don't nag the user repeatedly.
  const suggestedMessageIndices = new Set<number>();

  // ── 1. System prompt injection ─────────────────────────────────────
  pi.on("before_agent_start", (event, ctx) => {
    const vaultPath = getVaultPath();
    const config = getConfig();
    if (vaultPath === null || config === null) return;

    const vaultPrompt = buildSystemPrompt(config, vaultPath, { cwd: ctx.cwd });
    return {
      systemPrompt: event.systemPrompt + "\n\n" + vaultPrompt,
    };
  });

  // ── 2. Auto-brag detection ─────────────────────────────────────────
  pi.on("agent_end", (event, _ctx) => {
    const vaultPath = getVaultPath();
    const config = getConfig();
    if (vaultPath === null || config === null) return;
    if (!config.features.bragfile) return;

    const messages = event.messages;
    if (messages.length === 0) return;

    // Find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role !== "assistant") continue;

      // Skip if we've already suggested for this index
      if (suggestedMessageIndices.has(i)) break;

      const content =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((part: { type: string; text?: string }) => part.type === "text")
                .map((part: { type: string; text?: string }) => part.text ?? "")
                .join(" ")
            : "";

      if (!content) break;

      if (containsUserAccomplishment(content)) {
        suggestedMessageIndices.add(i);
        notifyDesktop("brainkit", "Sounds like an accomplishment! Ask me to add it to your bragfile.");
      }

      break; // Only check the last assistant message
    }
  });

  // ── 3. Session naming ──────────────────────────────────────────────
  pi.on("session_start", (_event, _ctx) => {
    pi.setSessionName("[brainkit]");
  });

  // ── 4. Auto-commit — debounced after agent turns ────────────────────
  pi.on("agent_end", (_event, _ctx) => {
    const vaultPath = getVaultPath();
    if (vaultPath !== null) {
      scheduleAutoCommit(vaultPath);
    }
  });

  // ── 5. Flush auto-commit on session shutdown ───────────────────────
  pi.on("session_shutdown", (_event, _ctx) => {
    const vaultPath = getVaultPath();
    if (vaultPath !== null) {
      flushAutoCommit(vaultPath);
    }
  });
}
