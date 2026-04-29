# claude-launcher-validate-brain-path

## Context

During Claude Code onboarding, the user types a path for their brain directory and the agent acts on it with `--dangerously-skip-permissions` granted (so it can create config.toml, vault dirs, PARA structure, etc. without prompting for permission on every write). Per the architecture review:

> The Scenario A/B/C prompt is good agent guidance, but the launcher itself uses `--dangerously-skip-permissions` and gives the agent unrestricted write access to the entire filesystem. If the model ignores or "creatively interprets" the safety rules — e.g. user types `~` or `/` as their brain path, or pastes a path with a typo that resolves to `~/Documents` — the agent can clobber data with no permission wall to catch it. The prompt is well-written and Claude Sonnet/Opus follow it in your smoke test, but this is a "trust the model" guarantee, not a code-enforced one.

The current safeguard (the prompt's three-scenario branching with explicit "NEVER overwrite an existing brainkit.toml" rules) is agent-driven, not code-enforced. A model that misinterprets — or a malicious prompt injection — could still cause data loss.

**Value delivered:** defense in depth. Even if the model goes off-script, brainkit refuses to operate against high-risk paths. The agent stays helpful but the blast radius is bounded.

## Related Files

- `cli/claude.ts` — `launchClaude` onboarding branch (where validation would happen)
- `core/onboarding-prompt.ts` — the agent-driven safety rules (this would supplement, not replace them)

## Dependencies

- None. Self-contained launcher-side validation.

## Acceptance Criteria

- [ ] **Pre-spawn validation:** before `--dangerously-skip-permissions` is granted, the launcher could either:
  - (a) Reject obviously dangerous paths the agent might create. But the launcher doesn't _know_ the path until the agent types it inside Claude. So this approach requires intercepting the agent's tool calls — out of scope.
  - (b) Restrict the agent's writable paths via Claude's permission system instead of `--dangerously-skip-permissions`. Use Claude's per-tool permission flags or settings to allow Write/Edit ONLY under `<homedir>/<expected brain area>` and `~/.config/brainkit/`. Reject writes elsewhere.
  - (c) Have the launcher itself create the brain dir + global config (after asking the user via a clack prompt for the brain path), then spawn Claude with `--dangerously-skip-permissions` scoped only to the vault dir, not the whole filesystem.
- [ ] **Recommended approach: (c).** Move the "ask the user for brain location + create config.toml" steps out of the agent and into the launcher (clack prompt + fs writes). The agent's job becomes only the _vault content_ setup (basics, context, preferences, vault.toml, PARA dirs) — and `--dangerously-skip-permissions` is replaced with explicit allow rules scoped to `<brain_path>/<vault_name>/` only.
- [ ] Reject (with helpful error) brain path candidates that resolve to: `/`, `$HOME`, `$HOME/Documents`, `$HOME/Desktop`, `$HOME/Downloads`, `/etc`, `/usr`, `/var`, anything that's a known macOS/Linux system dir, anything outside the user's homedir entirely.
- [ ] If the user _insists_ on a non-standard path, require an extra confirmation: "This isn't a typical brain location. Are you sure?" with default = no.

## Verification

- **Automated:** unit tests for the path-validation function with all the dangerous-path cases.
- **Ad-hoc:** `just fresh`, walk through onboarding, try entering each dangerous path. Confirm rejection.

## Notes

This is meaningful scope — moving the brain-location decision out of the agent into the launcher changes the onboarding architecture. Before doing it, weigh:

- **Pro:** real security (code-enforced, not prompt-enforced). No prompt injection can clobber the user's filesystem.
- **Pro:** the launcher can also offer a much better UX (clack `select` for "use existing brain dir / create new / specify path") than the agent's free-form question tool.
- **Con:** the agent loses some flexibility — it can no longer adapt the brain-location question based on context (e.g. "I see you have a `notes/` folder, want to use that?").
- **Con:** some onboarding logic now lives in TWO places (launcher for path/config, agent for vault content). Test surface grows.

Could also consider a middle ground: launcher writes a _placeholder_ config.toml with `brain_path = "PENDING"`, agent fills it in via tool calls, launcher detects the change on exit. Avoids the agent ever needing root-level filesystem access.

Deferred from US-claude-code per user decision after pre-release review (2026-04-29). The agent-driven safety rules ship in v0.9.x; this is the v0.10.x or v1.x hardening pass.

This same risk exists in OpenCode and Copilot onboarding (both also grant unrestricted write access). If we do this work, applying the same approach to all three harnesses is the right scope — but that's a separate user story, not a single backlog task.
