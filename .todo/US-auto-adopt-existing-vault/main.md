# US-auto-adopt-existing-vault

## Goal

When a user reinstalls brainkit on a machine where a brainkit-managed vault already exists (e.g., cloned from git, or global config wiped but `brain/` intact), the agent should detect the existing `brainkit.toml` and reconnect — not re-run the full onboarding Q&A and risk overwriting the user's config.

## Definition of Done

TBD — to be specced by user.

Rough shape:

- [ ] Reinstall flow detects existing `brainkit.toml` in the chosen brain path / vault
- [ ] When detected, agent skips Q&A and just writes the global `~/.config/brainkit/config.toml`
- [ ] Existing `brainkit.toml`, PARA dirs, and key files are never overwritten
- [ ] Behavior works for both OpenCode and Copilot harnesses

## Task Priority

TBD

## Cross-Cutting Concerns

- Two entry points to consider:
  1. CLI launcher path when global config is missing → `core/onboarding-prompt.ts` (used by both harnesses)
  2. In-session `/setup` flow → `skills/brainkit/SKILL.md` + `skills/onboarding/SKILL.md`
- `core/vault.ts` already has `detectVaultState()` that distinguishes `configured | fresh | existing` — currently only used in tests, could be wired in.
- `discoverVaults()` (`core/vault.ts:92`) already gates on `brainkit.toml` presence — the launcher reuses this once global config exists, so the gap is purely in the pre-config onboarding prompt.
- Open question: silent reconnect vs. explicit "I found existing setup, reconnect?" confirmation.
- Open question: multi-vault case — pick during onboarding, or just write global config and let the launcher's vault selector handle it on next launch.
- Open question: should the CLI launcher itself proactively detect a default `~/brain` with vaults before invoking the LLM onboarding prompt (cheap UX win, avoids round-trip).

## Notes

See conversation thread that spawned this story for full analysis of the three reinstall paths (global config present, global config wiped, in-session `/setup`).
