# Onboarding: v2 config format and vault registration

## Acceptance Criteria

- [x] Global config example in prompt uses `version = 2` (not `version = 1`)
- [x] Global config example uses `[[vaults]]` array instead of `brain_path`
- [x] Instructions tell the agent to append a `[[vaults]]` entry with the vault's path after creating the vault directory
- [x] No reference to `brain_path` remains in the prompt text
- [x] Instructions suggest `~/brain/<vault-name>` as the default location
- [x] Instructions tell the agent to write the vault path with `~` for portability
- [x] `skills/onboarding/SKILL.md`: "Create the vault directory under the brain directory" → "Create the vault directory at the chosen path"
- [x] `skills/onboarding/SKILL.md`: no remaining references to "brain directory" as a required parent
- [x] `skills/brainkit/SKILL.md`: setup flow mentions vault registration via `[[vaults]]`
- [x] `onboarding-prompt.test.ts` assertions updated for v2 format
- [x] Tests pass
