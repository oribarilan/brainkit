// ---------------------------------------------------------------------------
// Desktop notification helper
// ---------------------------------------------------------------------------

export function notifyDesktop(title: string, body: string): void {
  // OSC 777 for Ghostty, iTerm2, WezTerm
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
}

// ---------------------------------------------------------------------------
// Auto-brag detection helpers
// ---------------------------------------------------------------------------

export const ACCOMPLISHMENT_KEYWORDS = [
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
