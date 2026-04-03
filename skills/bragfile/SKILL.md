---
description: Professional accomplishments log — format, quality criteria, when to suggest entries
---

# Bragfile

A running log of **professional** accomplishments. Lives at `02_areas/career/bragfile.md`. Used for performance reviews, resume updates, and self-advocacy.

The bragfile is specifically for career and work accomplishments. Personal wins (ran first 10K, finished a home renovation, learned a new language) are great — but they belong in the relevant personal area notes (e.g., `02_areas/health/`, `01_projects/home-renovation/`) rather than the bragfile.

## Format

Organized by half-year (H1/H2), then by month (reverse chronological). Each entry is a dated bullet:

```markdown
# Bragfile

## H1 2026

### January

- **2026-01-15**: Shipped the threat detection API, reducing false positives by 40%
- **2026-01-08**: Led architecture review for the new auth service

### February

- **2026-02-20**: Mentored two junior engineers through their first production deployments
```

- Entry format: `- **YYYY-MM-DD**: description`
- Entries are added within the current month section, in chronological order

## What Makes a Good Entry

- **Specific, not vague** — "Reduced API latency by 30%" not "Improved performance"
- **Quantified when possible** — numbers, percentages, counts
- **Impact over activity** — what changed, not just what you did
- **Names projects and teams** when relevant (bolded)
- **Starts with action verbs** — shipped, led, designed, fixed, mentored, reduced, improved

## Rules

- **Append only.** Never modify or reorganize existing entries.
- Use the `brain_add_brag` tool — it handles section placement automatically.
- Entries go in chronological order within each month.

## When to Suggest Capturing a Brag

Offer gently — "Want me to add this to your bragfile?" — when the user:

- Mentions shipping, launching, or completing something
- Describes fixing a hard bug or resolving an incident
- Mentions leading a meeting, review, or initiative
- Mentions mentoring or helping others

Don't be pushy. A single gentle mention is enough. If they decline, move on.
