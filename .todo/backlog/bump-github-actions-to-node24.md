# bump-github-actions-to-node24

## Context

GitHub deprecated Node.js 20 on Actions runners ([changelog](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)). Several actions brainkit's CI uses still bundle Node 20:

- `actions/checkout@v4`
- `actions/setup-node@v4`
- `extractions/setup-just@v2`

These run in both `.github/workflows/check.yml` and `.github/workflows/release.yml`. The deprecation surfaced as a warning in the v0.9.1 release run logs.

**Timeline (per GitHub's notice):**

- **June 2, 2026** — Node 24 becomes the default; deprecated actions are forced to Node 24
- **September 16, 2026** — Node 20 removed from runners entirely; pinned-to-v20 actions break

Without action, brainkit's CI (and therefore the npm release pipeline) breaks on Sept 16, 2026.

**Value delivered:** CI keeps working past the deprecation window. No more deprecation noise in release logs. We catch breakage on our schedule rather than the day a release goes red.

## Related Files

- `.github/workflows/check.yml` — uses `actions/checkout@v4`, `actions/setup-node@v4`, `extractions/setup-just@v2`
- `.github/workflows/release.yml` — same three actions

## Dependencies

- None (independent maintenance task)

## Acceptance Criteria

- [ ] All three actions bumped to versions that ship Node 24 (or whatever the current major is at the time):
  - `actions/checkout` — verify latest major
  - `actions/setup-node` — verify latest major
  - `extractions/setup-just` — verify latest major (this one is third-party, may lag — fall back to a community fork or `npm i -g` if no Node 24 release exists)
- [ ] `check.yml` still passes (lint + typecheck + format + tests + package integrity, both Linux and Windows jobs)
- [ ] `release.yml` job spec validated (dry-run via `act` or a no-op release branch is fine — actual publish only on real release)
- [ ] No new deprecation warnings in workflow logs after the bump

## Verification

- **Automated:** push the bump on a branch, observe `check.yml` runs green on both `ubuntu-latest` and `windows-latest`. Pull the run logs and grep for "deprecated" / "Node.js 20".
- **Manual:** open the latest run in the GitHub UI, confirm the deprecation annotations are gone.

## Notes

- Don't combine this with a release PR. Dedicated maintenance PR — easier to revert if a bumped action has unexpected breakage.
- If `extractions/setup-just` has no Node 24 release by the time we tackle this, switch to `cargo install just` or `npm i -g rust-just` inline. Just is small and fast to install.
- Consider adding [Dependabot for GitHub Actions](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/keeping-your-actions-up-to-date-with-dependabot) (`.github/dependabot.yml`) so we get auto-PRs for future action bumps. That's a follow-up, not part of this US.
- As a temporary opt-in if we hit time pressure: set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` env var on the runner. This is a workaround, not a fix — still bump the pins.
