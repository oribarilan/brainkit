# phase-0-identity-decoupling

## Context

Today, the agent's identity (`[user].name`, `role`, etc.) lives inside each vault's `brainkit.toml`. This breaks in two real scenarios:

1. **Personal multi-machine.** The same user on a work laptop and a personal laptop pointing at the same vault gets a single `[user]` block — there's no clean way to say "I'm the same person but this is a different machine."
2. **Shared vaults (future).** Multiple humans co-editing one vault need distinct identities per machine. The vault cannot own a single `[user]`.

This phase decouples identity from the vault by introducing a **per-machine identity file** at `~/.config/brainkit/identity.toml`, with an env var override for ephemeral/scripted use.

**Value delivered:** Personal multi-machine users get correct identity attribution today. The shared-vaults work in later phases is unblocked. This phase ships independent value even if Phases 1–3 never happen.

This is the only phase that can begin immediately. Phases 1–3 are gated on validation.

## Related Files

- `core/types.ts` — add `MachineIdentity` type.
- `core/vault.ts` — add `readMachineIdentity()` and `resolveAgentIdentity()` functions; reuse existing `getConfigDir()`.
- `core/prompt-sections.ts:65-90` — `buildIdentity` consumes resolved identity instead of reading `config.user` directly.
- `core/system-prompt.ts` — pass resolved identity into prompt builders.
- `__tests__/` — unit tests for resolution order.
- `AGENTS.md` — document the new identity file (under "Vault Operations" or a new "Identity" section).

## Dependencies

- None. This is the foundation phase.

## Acceptance Criteria

- [ ] New TOML schema documented: `~/.config/brainkit/identity.toml` with fields `name` (required), `email` (optional), `handle` (optional).
- [ ] `core/vault.ts` exports `readMachineIdentity(): MachineIdentity | null` that returns parsed identity or `null` if file is absent. Returns `null` (not throws) when the file does not exist.
- [ ] `core/vault.ts` exports `resolveAgentIdentity(config: BrainkitConfig): ResolvedIdentity` that follows resolution order: (1) `BRAINKIT_IDENTITY_NAME` env var (plus optional `BRAINKIT_IDENTITY_EMAIL`, `BRAINKIT_IDENTITY_HANDLE`), (2) `readMachineIdentity()`, (3) `config.user` from `brainkit.toml`, (4) `git config user.name` (best-effort, no crash if git absent).
- [ ] `ResolvedIdentity` includes a `source: 'env' | 'identity-file' | 'vault-config' | 'git' | 'none'` field for diagnostics.
- [ ] `buildIdentity` in `core/prompt-sections.ts` reads from `resolveAgentIdentity()` rather than `config.user` directly. Existing personal-vault behavior is unchanged when no identity file or env var is set (vault config wins as today).
- [ ] Path traversal protection: `readMachineIdentity` reads only `path.join(getConfigDir(), 'identity.toml')` — no user-supplied paths.
- [ ] Cross-platform: uses `os.homedir()` and `path.join`. Windows-safe (no hardcoded `/`).
- [ ] No new runtime dependencies. Reuses existing `smol-toml` parser.
- [ ] Unit tests cover: env var override wins; identity file used when no env; vault config used when no identity file; git fallback when nothing else; `null` source when nothing resolves; malformed identity.toml produces a clear error (not a silent fall-through).
- [ ] CI passes including the Windows test job (this code is path-sensitive — Windows coverage is non-negotiable per `AGENTS.md`).
- [ ] `AGENTS.md` updated with a brief "Identity resolution" section documenting the order and the new file.

## Verification

**Automated (preferred):**

- New test file `core/__tests__/identity.test.ts` covering each branch of `resolveAgentIdentity`.
- Existing `core/__tests__/prompt-sections.test.ts` (if present) continues to pass; add cases for "identity sourced from env" and "identity sourced from identity.toml" in `buildIdentity`.
- `just test` passes locally.
- `just lint` passes (no new TS errors).
- `just check` passes (lint + format + test).

**Ad-hoc:**

- Create `~/.config/brainkit/identity.toml` with a name. Run `just dev`. Confirm the system prompt (visible via the agent) reflects the identity-file name, not the vault's `[user].name`.
- Set `BRAINKIT_IDENTITY_NAME=Override` and re-run. Confirm the override wins.
- Delete `identity.toml`, unset env var. Confirm the vault's `[user].name` is used (existing behavior preserved).

## Notes

- Do **not** introduce a `kind` field in this phase. That's Phase 2's decision and we want it kept explicit there. Phase 0 is identity-only.
- Do **not** change `[user]` schema in `brainkit.toml`. Backward compatibility is mandatory.
- The `ResolvedIdentity.source` field exists so the future `shared-vault` skill (Phase 2) can hard-fail when source is `'none'` in a shared vault. Phase 0 just exposes it.
- Consider logging the resolved identity source at session start (debug-level) — useful when users debug "why does the agent think I'm someone else."
- This phase is small (~80–150 LOC including tests). Resist the temptation to bundle Phase 2 work.
