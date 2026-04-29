# US-auto-adopt-existing-vault

## Status: Resolved

When a user reinstalls brainkit on a machine where a brainkit-managed vault already exists (e.g., cloned from git, or global config wiped but `brain/` intact), the agent detects the existing `brainkit.toml` and reconnects without re-running onboarding Q&A or overwriting config.

## What Shipped

Implemented via the shared onboarding prompt (`core/onboarding-prompt.ts`), used by all three harnesses (OpenCode, Copilot, Claude) through `buildOnboardingPrompt(harness)`.

- **Scenario B branch** (`onboarding-prompt.ts:41-48`): when agent finds existing `*/brainkit.toml`, it writes only the global `~/.config/brainkit/config.toml` and announces the reconnect — no Q&A, no vault writes.
- **Safety rules** (`onboarding-prompt.ts:18-22`): never overwrite `brainkit.toml`, never recreate populated PARA dirs. Reinforced throughout the prompt and covered by `core/__tests__/onboarding-prompt.test.ts`.
- **Multi-vault**: agent writes only `brain_path`; the launcher's existing vault selector (`cli/launch.ts:177`) handles selection on next launch.

## DoD

- [x] Reinstall flow detects existing `brainkit.toml`
- [x] Skips Q&A and writes only global config when detected
- [x] Existing vault files never overwritten
- [x] Works for OpenCode, Copilot, and Claude

## Gaps Knowingly Left Open

- **No proactive CLI-side detection.** `cli/launch.ts` still always hands off to the LLM when global config is missing, rather than doing an `existsSync` check on `~/brain/*/brainkit.toml` first. Skipped because the reinstall-on-existing-vault path is rare — not worth the extra code path to keep in sync.
- **`detectVaultState()` remains unused** outside tests. Earmarked for spec 12 (adopting non-brainkit vaults), not this story.
- **In-session `/setup`** has no adoption branch. Narrow gap; launcher's vault selector usually prevents reaching it with an existing vault.
- **No end-to-end CI test** for "wiped config + intact vault → only `config.toml` written." Behavior is delegated to the model with prompt-level coverage only.
