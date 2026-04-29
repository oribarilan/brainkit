# extract-staleness-helper

## Context

The "last brag entry was N days ago" → color (green ≤7d / yellow ≤14d / red, "never" = red) logic exists in two places already:

- `opencode/side.tsx` — sidebar color coding
- `scripts/copilot-status.js` — Copilot statusline ANSI colors

Adding Claude's `statusline.mjs` would be the third copy. Extract once, reuse everywhere.

**Value delivered:** Single source of truth for staleness thresholds and color categories. No drift across the three harness UIs.

## Related Files

- `opencode/side.tsx` — current logic
- `scripts/copilot-status.js` — current logic
- `core/vault.ts` — likely target for the helper

## Dependencies

- None

## Acceptance Criteria

- [ ] New helper in `core/` (probably `core/vault.ts` since it already exposes brag stats) — e.g. `stalenessCategory(daysSinceLastBrag: number | null): "fresh" | "warning" | "stale"`. Pure function.
- [ ] `opencode/side.tsx` uses the helper, mapping the category to its UI colors.
- [ ] `scripts/copilot-status.js` uses the helper, mapping the category to ANSI codes.
- [ ] Thresholds (7 / 14) live in one place — the helper.
- [ ] Test coverage for the helper covering: never (`null`), 0 days, 7 days (boundary), 8 days (boundary), 14 days (boundary), 15 days, very stale.
- [ ] Existing OpenCode and Copilot tests still pass; no behavior change.

## Verification

- **Automated:** new unit tests in `core/__tests__/vault.test.ts` (or wherever the helper lands). `just test` passes.
- **Ad-hoc:** quick visual confirmation that `opencode/side.tsx` colors haven't changed for any value, and `scripts/copilot-status.js` ANSI output is identical for any input.

## Notes

If the two consumers happen to use different thresholds today (drift the explorer didn't catch), pick the more recent / more sensible one and document the choice in this task's notes. This is a chance to settle drift, not propagate it.
