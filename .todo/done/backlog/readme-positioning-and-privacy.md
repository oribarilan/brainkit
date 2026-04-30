# readme-positioning-and-privacy

## Context
The README should clearly communicate two things that users care about up front:

1. **What brainkit is**: a wrapper around an existing AI coding harness (OpenCode, Copilot CLI, Claude Code). It does not replace the harness — it augments it by delivering skills, system prompts, hooks, and a TUI on top.
2. **Privacy posture**: brainkit collects no telemetry and no data of any kind. All brain data lives as plain files in a directory the user chooses. The recommended setup is a private git repository the user owns.

Today the README does not state these clearly, which leaves users guessing about scope, lock-in, and data handling.

**Value delivered**: prospective users immediately understand what brainkit is (and isn't), and trust that their data stays theirs.

## Related Files
- `README.md`

## Dependencies
- None

## Acceptance Criteria
- [x] README has a section (near the top) explaining brainkit is a wrapper for an existing harness and listing the supported harnesses
- [x] README explicitly states brainkit delivers skills, system prompts, hooks (and TUI on OpenCode) — it does not reimplement the harness
- [x] README has a clearly visible "Privacy" or "Your data" section stating: no telemetry, no data collection of any kind
- [x] README states all brain data is stored as files in a user-chosen directory
- [x] README recommends a private git repository as the suggested storage format
- [x] Wording is consistent with `specs/` and `docs/features.md` (no contradictions)

## Verification
- **Ad-hoc**: open `README.md` and confirm each acceptance criterion is visible and accurate. Cross-check claims against `core/vault.ts`, `opencode/server.ts`, and the launchers in `cli/` to ensure no telemetry or data collection exists in code.

## Notes
- Keep the privacy statement factual and verifiable — don't overclaim. If any future feature would change this, the README must be updated in the same PR.
- Consider linking from the privacy section to the relevant code (e.g., vault ops in `core/vault.ts`) so the claim is auditable.
