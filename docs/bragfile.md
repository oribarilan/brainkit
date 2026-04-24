# Bragfile

The bragfile is a running log of professional accomplishments, stored at `02_areas/career/bragfile.md` in the vault. It exists for a practical reason: when performance review season arrives, or when the user needs to update their resume, or when they're preparing for a promotion conversation, they have a concrete record of what they did and when. Without a bragfile, people routinely forget half of what they accomplished in a given year. This file fixes that.

The bragfile is strictly for professional wins. Personal accomplishments (ran a marathon, finished a home renovation, learned to cook Thai food) belong in the relevant area or project notes, not here.

## Behavior

### File format

The bragfile is organized by half-year periods (H1/H2), then by month within each period. Months appear in reverse chronological order within a half-year, but individual entries within a month appear in chronological order.

```markdown
# Bragfile

## H1 2026

### February

- **2026-02-20**: Mentored two junior engineers through their first production deployments

### January

- **2026-01-15**: Shipped the threat detection API, reducing false positives by 40%
- **2026-01-08**: Led architecture review for the new auth service
```

Each entry follows the format `- **YYYY-MM-DD**: description`. The date is bolded, followed by a colon and space, then the description.

### Append-only

Existing entries are never modified, reworded, reorganized, or deleted. The bragfile is an append-only log. New entries go into the correct half-year and month section, inserted in chronological order within the month. If the half-year section or month section doesn't exist yet, the system creates it.

### Entry quality

Good brag entries are specific and quantified. "Improved performance" is vague and unhelpful six months later. "Reduced API latency from 400ms to 120ms by adding a Redis cache layer" tells a story. The quality criteria:

- Specific, not vague. Include what, where, and how much.
- Quantified when possible. Numbers, percentages, counts, time saved.
- Impact over activity. What changed as a result, not just what the user did.
- Names projects and teams when relevant, bolded in the entry text.
- Starts with action verbs: shipped, led, designed, fixed, mentored, reduced, improved.

### When the agent suggests capturing a brag

The agent offers to add a brag entry when the user mentions shipping or launching something, fixing a hard bug, resolving an incident, leading a meeting or initiative, or mentoring someone. The suggestion is gentle — "Want me to add this to your bragfile?" — and happens once. If the user declines, the agent moves on. No nagging.

### Staleness reminders

If the bragfile hasn't been updated in 14 or more days, the system prompt includes a reminder. The `buildBragReminder()` function checks the date of the most recent entry by parsing `YYYY-MM-DD` dates from the entry pattern, compares it to today, and calculates the gap in days. If the gap is 14+, it appends a reminder section to the system prompt that tells the agent to gently suggest capturing any recent accomplishments.

The reminder text includes how many days have passed and the date of the last entry. It instructs the agent to mention it once, naturally, without being pushy. If the bragfile exists but has no entries, the reminder doesn't fire — it only activates when there's a previous entry to measure staleness against.

### Auto-brag detection

On session idle (after the agent finishes a turn), the system scans all user messages in the session for accomplishment keywords near second-person pronouns. The keyword list is: "shipped", "launched", "completed", "delivered", "fixed", "resolved", "implemented", "deployed", "released", "finished", "built". The system looks for any of these keywords appearing as whole words (not as substrings of larger words) with "you" or "your" somewhere within a 50-character window around the keyword.

When a match is found, the system shows a toast notification: "Sounds like an accomplishment! Consider adding it to your bragfile." This only fires once per session — a `Set` tracks which session IDs have already triggered a suggestion. The scan checks every user message in the session history, but once a match fires, that session is marked and no further scans produce toasts.

There's a guard against false positives: if "I" or "I've" appears in the 15 characters immediately before the keyword, the match is rejected. This catches cases where the agent is describing its own work ("I implemented the function") rather than the user's accomplishment. Without this guard, every time the agent said "I fixed the bug" the user would get a brag toast.

### Stats tracking

The `getBragStats()` function parses the bragfile content using a regex that matches the `- **YYYY-MM-DD**:` pattern. It returns a total entry count, the date of the most recent entry, and a breakdown of entries per month (keyed by `YYYY-MM` strings). These stats power the sidebar display and the staleness calculation.

## Harness implementation

| Capability | OpenCode | Copilot CLI |
|---|---|---|
| Adding entries | Agent uses built-in file editing, guided by the bragfile skill for format and placement rules | Agent uses built-in file editing, guided by bragfile skill in `.agents/skills/brainkit/references/bragfile.md` |
| Entry formatting | Agent follows skill conventions (date format, half-year/month sections, quality criteria) | Same — agent follows skill conventions |
| Staleness reminders | System prompt injection via `experimental.chat.system.transform` — `buildBragReminder()` checks last entry date and adds reminder text if 14+ days stale | Static in AGENTS.md, generated at launch with current staleness data; not updated mid-session |
| Auto-brag detection | `session.idle` event handler scans user messages for accomplishment keywords near "you"/"your"; shows toast via `api.tui.showToast()` | Not supported — the bragfile skill instructs the agent to offer capture when accomplishments come up in conversation |
| Brag stats in sidebar | TUI sidebar component reads `getBragStats()` and shows total entries + staleness with color coding (green ≤7d, yellow ≤14d, red >14d) | `statusLine` script shows brag count + staleness in Copilot's footer bar with the same color thresholds |
